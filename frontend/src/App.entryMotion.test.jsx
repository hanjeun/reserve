import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import App from './App';
import Bone from './components/common/Bone';

const fixture = vi.hoisted(() => ({
    auth: { user: { id: 7, role: 'USER', termsAgreed: true }, isLoggedIn: true, sessionRevision: 0, initializeAuth: async () => {} },
    homeLoading: false,
}));
vi.mock('./store/useAuthStore', () => ({
    default: Object.assign(selector => selector ? selector(fixture.auth) : fixture.auth,
        { getState: () => fixture.auth, subscribe: () => () => {} }),
}));
vi.mock('./components/layout/Header', () => ({
    default: () => <header>
        <Link to="/" state={{ reserveHomeEntry: true, reserveRouteMotion: 'from-left' }}>로고로 홈</Link>
        <Link to="/">일반 홈 이동</Link>
        <Link to="/?region=all" replace state={{ reserveHomeEntry: true, reserveRouteMotion: 'from-left' }}>홈 주소 보정</Link>
        <Link to="/my-page">마이페이지 이동</Link>
        <Link to="/stores" state={{ reserveDiscoveryEntry: 'featured-banner' }}>배너로 탐색</Link>
        <Link to="/terms">약관 이동</Link>
        <Link to="/store/register">가게 등록 이동</Link>
    </header>,
    HeaderPlaceholder: () => <div />,
}));
vi.mock('./components/layout/Footer', () => ({ default: () => null }));
vi.mock('./components/layout/OfflineBanner', () => ({ default: () => null }));
vi.mock('./components/layout/DiscoveryNav', () => ({ default: () => null }));
vi.mock('./components/chat/MessengerShell', () => ({ default: () => null }));
vi.mock('./pages/member/MyPage', () => ({ default: () => <h1>마이페이지</h1> }));
vi.mock('./pages/Home', () => ({ default: () => <div data-home-content="true">
    <h1>홈</h1><section className="reserve-discovery-location">위치</section>
    {fixture.homeLoading ? <Bone /> : <p>추천 가게</p>}
</div> }));
vi.mock('./pages/store/StoreList', () => ({ default: () => <div className="reserve-explore-page"><h1>탐색</h1></div> }));
vi.mock('./pages/legal/Terms', () => ({ default: () => <h1>약관</h1> }));
vi.mock('./pages/store/StoreRegister', () => ({ default: () => <section className="reserve-onboarding-page"><h1>가게 등록</h1></section> }));

const content = () => document.querySelector('.ant-layout-content');
const css = postcss.parse(readFileSync('src/styles/global/discovery-motion.css', 'utf8'));
const routeEntryApplies = () => {
    let applies = false;
    css.walkRules(rule => {
        if (rule.nodes.some(node => node.prop === 'animation' && node.value.startsWith('reserve-discovery-page-from-'))
            && rule.selectors.some(selector => content()?.matches(selector))) applies = true;
    });
    return applies;
};
const finishEntry = (target = content()) => act(() => {
    const event = new Event('webkitAnimationEnd', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'reserve-discovery-page-from-right' });
    target.dispatchEvent(event);
});
const expectStill = () => {
    expect(content()).not.toHaveClass('reserve-route-entry--from-left');
    expect(content()).not.toHaveClass('reserve-route-entry--from-right');
    expect(routeEntryApplies()).toBe(false);
};
function show(path, state) {
    window.history.replaceState({ key: 'restored-entry', idx: 7, usr: state }, '', path);
    return render(<App />);
}

beforeAll(() => Promise.all([import('./pages/Home'), import('./pages/member/MyPage'), import('./pages/store/StoreList'), import('./pages/legal/Terms'), import('./pages/store/StoreRegister')]));
beforeEach(() => {
    fixture.homeLoading = false;
    fixture.auth.user = { id: 7, role: 'USER', termsAgreed: true };
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 14 }]);
});
afterEach(() => vi.restoreAllMocks());

it('does not replay a persisted home-logo or explicit direction after a document reload', async () => {
    show('/?region=all', { reserveHomeEntry: true, reserveRouteMotion: 'from-left' });
    await screen.findByRole('heading', { name: '홈' });
    expect(content()).toHaveAttribute('data-document-entry', 'true');
    expect(content()).not.toHaveAttribute('data-home-logo-entry');
    expectStill();
    fireEvent.click(screen.getByRole('link', { name: '홈 주소 보정' }));
    expect(content()).toHaveAttribute('data-document-entry', 'true');
    expectStill();
});

it('animates the skeleton-first home parent once through URL normalization and data replacement', async () => {
    const view = show('/my-page');
    await screen.findByRole('heading', { name: '마이페이지' });
    fixture.homeLoading = true;
    fireEvent.click(screen.getByRole('link', { name: '로고로 홈' }));
    await screen.findByRole('heading', { name: '홈' });
    const parent = content();
    expect(content()).toHaveAttribute('data-skeleton-shown', 'true');
    expect(content()).toHaveClass('reserve-route-entry--from-left');
    expect(routeEntryApplies()).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: '홈 주소 보정' }));
    expect(content()).toBe(parent);
    expect(content()).toHaveAttribute('data-skeleton-shown', 'true');
    expect(content()).toHaveClass('reserve-route-entry--from-left');
    finishEntry();
    expectStill();
    fixture.homeLoading = false;
    view.rerender(<App />);
    expect(screen.getByText('추천 가게')).toBeInTheDocument();
    expect(content()).toBe(parent);
    expect(content()).toHaveAttribute('data-skeleton-shown', 'true');
    expectStill();
});

it('animates the cached home parent without a child entrance or remount on normalization', async () => {
    show('/my-page');
    await screen.findByRole('heading', { name: '마이페이지' });
    fireEvent.click(screen.getByRole('link', { name: '로고로 홈' }));
    await screen.findByRole('heading', { name: '홈' });
    const location = document.querySelector('.reserve-discovery-location');
    expect(content()).not.toHaveAttribute('data-skeleton-shown');
    expect(content()).not.toHaveAttribute('data-document-entry');
    expect(content()).not.toHaveAttribute('data-home-logo-entry');
    expect(routeEntryApplies()).toBe(true);
    expect(content()).toHaveClass('reserve-route-entry--from-left');
    fireEvent.click(screen.getByRole('link', { name: '홈 주소 보정' }));
    expect(document.querySelector('.reserve-discovery-location')).toBe(location);
    expect(routeEntryApplies()).toBe(true);
    expect(css.toString()).not.toContain('[data-home-logo-entry=');
});

it('keeps ordinary cached route navigation animated and clears it when the animation finishes', async () => {
    // Importing code alone does not initialize React.lazy. Visit once before asserting a cached revisit.
    show('/terms');
    await screen.findByRole('heading', { name: '약관' });
    fireEvent.click(screen.getByRole('link', { name: '마이페이지 이동' }));
    await screen.findByRole('heading', { name: '마이페이지' });
    fireEvent.click(screen.getByRole('link', { name: '약관 이동' }));
    await screen.findByRole('heading', { name: '약관' });
    expect(content()).not.toHaveAttribute('data-skeleton-shown');
    expect(content()).not.toHaveAttribute('data-document-entry');
    expect(content()).toHaveClass('reserve-route-entry--from-right');
    finishEntry(screen.getByRole('heading', { name: '약관' }));
    expect(content()).toHaveClass('reserve-route-entry--from-right');
    finishEntry();
    expectStill();
});

it('keeps ordinary navigation animated while its data skeleton is visible', async () => {
    show('/my-page');
    await screen.findByRole('heading', { name: '마이페이지' });
    fixture.homeLoading = true;
    fireEvent.click(screen.getByRole('link', { name: '일반 홈 이동' }));
    await screen.findByRole('heading', { name: '홈' });
    expect(content()).toHaveAttribute('data-skeleton-shown', 'true');
    expect(content()).toHaveClass('reserve-route-entry--from-right');
    expect(routeEntryApplies()).toBe(true);
});

it('uses one common parent entrance for a featured-banner navigation', async () => {
    show('/my-page');
    await screen.findByRole('heading', { name: '마이페이지' });
    fireEvent.click(screen.getByRole('link', { name: '배너로 탐색' }));
    await screen.findByRole('heading', { name: '탐색' });
    expect(content()).toHaveClass('reserve-route-entry--from-right');
    expect(routeEntryApplies()).toBe(true);
});

it('uses one common parent entrance for a cached store form', async () => {
    fixture.auth.user = { id: 7, role: 'BUSINESS', termsAgreed: true };
    show('/store/register');
    await screen.findByRole('heading', { name: '가게 등록' });
    fireEvent.click(screen.getByRole('link', { name: '마이페이지 이동' }));
    await screen.findByRole('heading', { name: '마이페이지' });
    fireEvent.click(screen.getByRole('link', { name: '가게 등록 이동' }));
    await screen.findByRole('heading', { name: '가게 등록' });
    expect(content()).not.toHaveAttribute('data-skeleton-shown');
    expect(content()).not.toHaveAttribute('data-document-entry');
    expect(content()).toHaveClass('reserve-route-entry--from-right');
    expect(routeEntryApplies()).toBe(true);
});
