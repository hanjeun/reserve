import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Header from './Header';
import DiscoveryNav from './DiscoveryNav';
import FilterToolbar from '../common/FilterToolbar';

const { goBack, authState, reducedMotionState } = vi.hoisted(() => ({
    goBack: vi.fn(),
    authState: { isLoggedIn: false },
    reducedMotionState: { value: true },
}));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => reducedMotionState.value }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => goBack }));
vi.mock('../../store/useAuthStore', () => ({
    default: Object.assign(selector => selector ? selector(authState) : authState, {
        getState: () => authState,
        subscribe: () => () => {},
    }),
}));
vi.mock('./HeaderAccountMenu', () => ({ default: () => <button>내 계정 메뉴 열기</button> }));

function CurrentRoute() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname + location.search + (location.state?.searchEntry ? ':searchEntry' : '')}</output>;
}

function CurrentListSearch() {
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    if (!['/stores', '/waiting'].includes(location.pathname)) return null;
    return <FilterToolbar search={{ value: params.get('keyword') || '', placeholder: '현재 목록 검색', onChange: event => {
        const value = event.target.value;
        setParams(current => { const next = new URLSearchParams(current); next.set('keyword', value); next.set('page', '1'); return next; });
    } }} onReload={() => {}} />;
}

function RouteCommitProbe() {
    const navigate = useNavigate();
    return <>
        <button onClick={() => navigate('/')}>이동 완료</button>
        <button onClick={() => navigate('/terms')}>다른 화면 이동</button>
        <button onClick={() => navigate('?region=', { replace: true })}>선택 기본값 보정</button>
        <button onClick={() => navigate(-1)}>히스토리 뒤로</button>
        <button onClick={() => navigate(1)}>히스토리 앞으로</button>
    </>;
}

const renderHeader = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
        <Header />
        <CurrentRoute />
        <RouteCommitProbe />
    </MemoryRouter>,
);

describe('shared wordmark and result search header', () => {
    beforeEach(() => { vi.clearAllMocks(); authState.isLoggedIn = false; reducedMotionState.value = true; });

    it('uses one full wordmark and restores Login / Start for guests', () => {
        renderHeader('/stores');
        const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
        expect(logo.textContent).toBe('RESERVE');
        expect(logo.querySelector('img')).toBeNull();
        expect(screen.getByRole('link', { name: '통합 검색' }).textContent).toBe('');
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '내 계정 메뉴 열기' })).toBeNull();
        expect(screen.queryByText('관심 가게')).toBeNull();
        expect(screen.queryByText('내 예약 확인')).toBeNull();
    });

    it('keeps guest account actions usable on deeper routes', () => {
        const { unmount } = renderHeader('/store/12');
        fireEvent.click(screen.getByRole('button', { name: '로그인' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/login');
        unmount();
        renderHeader('/store/12');
        fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/signup');
    });

    it('retains the existing account menu for signed-in users', async () => {
        authState.isLoggedIn = true;
        renderHeader('/stores');
        expect(await screen.findByRole('button', { name: '내 계정 메뉴 열기' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '로그인' })).toBeNull();
        expect(screen.queryByRole('button', { name: '시작하기' })).toBeNull();
    });

    it.each(['/stores', '/waiting'])('edits only the current list and leaves the separate global entry blank at %s', async path => {
        const original = path + '?keyword=' + encodeURIComponent('카페 안산') + '&view=list&sort=reviewCount&page=2';
        render(<MemoryRouter initialEntries={[original]}><Header /><DiscoveryNav /><CurrentListSearch /><CurrentRoute /></MemoryRouter>);
        expect(screen.queryByRole('button', { name: /목록 검색어 수정/ })).toBeNull();
        expect(screen.queryByRole('button', { name: '이전 화면으로 돌아가기' })).toBeNull();
        const input = screen.getByPlaceholderText('현재 목록 검색');
        expect(screen.getByRole('banner')).not.toHaveClass('reserve-header-has-query');
        expect(screen.getByRole('link', { name: 'RESERVE 홈' })).toBeVisible();
        expect(screen.getByRole('link', { name: '통합 검색' })).toHaveAttribute('href', '/search');
        expect(screen.getByLabelText('현재 경로').textContent).toBe(original);
        fireEvent.change(input, { target: { value: '공방' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        const current = new URL(screen.getByLabelText('현재 경로').textContent, 'http://localhost');
        expect(current.pathname).toBe(path); expect(current.searchParams.get('keyword')).toBe('공방');
        expect(current.searchParams.get('view')).toBe('list'); expect(current.searchParams.get('sort')).toBe('reviewCount'); expect(current.searchParams.get('page')).toBe('1');
        const tabs = screen.getByRole('navigation', { name: '서비스 탐색' });
        const selected = path === '/stores' ? '탐색' : '웨이팅';
        fireEvent.click(within(tabs).getByRole('link', { name: selected === '탐색' ? '웨이팅' : '탐색', exact: true }));
        fireEvent.click(within(tabs).getByRole('link', { name: selected, exact: true }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe(current.pathname + current.search);
        expect(screen.getByPlaceholderText('현재 목록 검색')).toHaveValue('공방');
        expect(within(tabs).getByRole('link', { name: selected, exact: true })).toHaveAttribute('aria-current', 'page');
        fireEvent.click(screen.getByRole('link', { name: '통합 검색' }));
        await waitFor(() => expect(screen.getByLabelText('현재 경로').textContent).toBe('/search:searchEntry'));
    });

    it.each(['/admin?tab=members&search=회원', '/business?tab=ads&advertisementSearch=광고'])('does not transfer a workspace list query into global search: %s', async path => {
        renderHeader(path);
        expect(screen.queryByRole('button', { name: /목록 검색어 수정/ })).toBeNull();
        fireEvent.click(screen.getByRole('link', { name: '통합 검색' }));
        await waitFor(() => expect(screen.getByLabelText('현재 경로').textContent).toBe('/search:searchEntry'));
    });

    it('keeps a pending search and its duplicate-click lock through canonical query replacement', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/');
            const search = screen.getByRole('link', { name: '통합 검색' });
            fireEvent.click(search);
            fireEvent.click(screen.getByRole('button', { name: '선택 기본값 보정' }));
            expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/?region=');
            expect(screen.getByRole('banner')).toHaveAttribute('aria-busy', 'true');
            fireEvent.click(search);
            act(() => { vi.advanceTimersByTime(220); });
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/search:searchEntry');
            fireEvent.click(screen.getByRole('button', { name: '히스토리 뒤로' }));
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/?region=');
        } finally { vi.useRealTimers(); }
    });

    it('cancels pending search on a different page and releases its navigation lock', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/');
            fireEvent.click(screen.getByRole('link', { name: '통합 검색' }));
            fireEvent.click(screen.getByRole('button', { name: '다른 화면 이동' }));
            act(() => { vi.advanceTimersByTime(220); });
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/terms');
            fireEvent.click(screen.getByRole('link', { name: '통합 검색' }));
            act(() => { vi.advanceTimersByTime(220); });
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/search:searchEntry');
        } finally { vi.useRealTimers(); }
    });

    it('cancels pending search on browser back even when the pathname stays the same', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            render(<MemoryRouter initialEntries={['/?region=', '/']}><Header /><CurrentRoute /><RouteCommitProbe /></MemoryRouter>);
            fireEvent.click(screen.getByRole('link', { name: '통합 검색' }));
            fireEvent.click(screen.getByRole('button', { name: '히스토리 뒤로' }));
            act(() => { vi.advanceTimersByTime(220); });
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/?region=');
        } finally { vi.useRealTimers(); }
    });

    it('keeps the wordmark for list filters and unrelated query parameters', () => {
        const { unmount } = renderHeader('/stores?keyword=%20%20&domain=FOOD');
        expect(screen.getByRole('banner')).not.toHaveClass('reserve-header-has-query');
        expect(screen.getByRole('link', { name: '통합 검색' })).toBeTruthy();
        unmount();
        renderHeader('/my-page?keyword=' + encodeURIComponent('공방'));
        expect(screen.getByRole('banner')).not.toHaveClass('reserve-header-has-query');
        expect(screen.queryByRole('button', { name: '목록 검색어 수정: 공방' })).toBeNull();
    });

    it('does not render a list query in the header or embed it in the global link', () => {
        const term = '<img src=x onerror=alert(1)> & 공방';
        renderHeader('/stores/?keyword=' + encodeURIComponent(term));
        expect(screen.queryByText(term)).toBeNull();
        expect(screen.getByRole('banner')).not.toHaveClass('reserve-header-has-query');
        expect(screen.getByRole('link', { name: '통합 검색' })).toHaveAttribute('href', '/search');
    });

    it('keeps the full wordmark and the existing back action on deeper screens', () => {
        renderHeader('/store/12');
        expect(screen.getByRole('link', { name: 'RESERVE 홈' }).textContent).toBe('RESERVE');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(goBack).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
    });

    it('lets the messages page play its close animation before navigating back', () => {
        const onCloseRequest = vi.fn((event) => event.preventDefault());
        window.addEventListener('reserve:messenger-route-close', onCloseRequest);
        const { unmount } = renderHeader('/messages');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(goBack).not.toHaveBeenCalled();
        unmount();
        window.removeEventListener('reserve:messenger-route-close', onCloseRequest);

        renderHeader('/messages');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(goBack).toHaveBeenCalledTimes(1);
    });

    it.each(['/store/register', '/store/12/edit'])('returns through store questions before route history at %s', path => {
        const onStepBack = vi.fn(event => event.preventDefault());
        window.addEventListener('reserve:registration-step-back', onStepBack);
        try {
            renderHeader(path);
            fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
            expect(onStepBack).toHaveBeenCalledOnce();
            expect(goBack).not.toHaveBeenCalled();
            expect(screen.getByLabelText('현재 경로')).toHaveTextContent(path);
        } finally {
            window.removeEventListener('reserve:registration-step-back', onStepBack);
        }
    });

    it('uses route history when store edit has no active question back request', () => {
        renderHeader('/store/12/edit');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(goBack).toHaveBeenCalledOnce();
    });

    it('lets the messages page close with its animation before the logo goes home', () => {
        const onCloseRequest = vi.fn((event) => event.preventDefault());
        window.addEventListener('reserve:messenger-route-close', onCloseRequest);
        const { unmount } = renderHeader('/messages');
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(onCloseRequest.mock.calls[0][0].detail).toEqual({ to: '/' });
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/messages');
        unmount();
        window.removeEventListener('reserve:messenger-route-close', onCloseRequest);
    });

    it('leaves a single bottom divider below discovery tabs while deeper routes keep their header divider', () => {
        const { unmount } = renderHeader('/');
        expect(screen.getByRole('banner').getAttribute('style')).toMatch(/box-shadow:\s*none;/);
        expect(screen.getByRole('banner').getAttribute('style')).not.toMatch(/border-bottom/);
        unmount();
        renderHeader('/store/12');
        expect(screen.getByRole('banner').getAttribute('style')).toMatch(/box-shadow:\s*inset 0(?:px)? -1px 0(?:px)?/);
        expect(screen.getByRole('banner').getAttribute('style')).not.toMatch(/border-bottom/);
    });

    it('scrolls home without losing the existing reduced-motion behavior', () => {
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        renderHeader();
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        scroll.mockRestore();
    });

    it('goes back at once while retaining the arrow until the route no longer needs it', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            const { unmount } = renderHeader('/store/12');
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            fireEvent.click(back);
            expect(back).not.toHaveClass('reserve-header-back--leaving');
            expect(goBack).toHaveBeenCalledOnce();
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();

            unmount();
            renderHeader('/store/12');
            const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
            fireEvent.click(logo);
            // 로고는 움직이지 않는다 — 눌림 모션도, 그걸 기다리는 지연도 없이 바로 홈으로 간다.
            expect(logo).not.toHaveClass('reserve-header-logo--home-motion');
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
        } finally {
            vi.useRealTimers();
        }
    });

    it('collapses the back button with the same motion when the logo leaves a deeper screen', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
            // 로고는 기다리지 않고 바로 홈으로 간다.
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
            // 뒤로가기가 필요 없는 화면에 도착할 때만 접힌다.
            const leaving = document.querySelector('.reserve-header-back');
            expect(leaving).toHaveClass('reserve-header-back--leaving');
            expect(leaving).toBeDisabled();
            expect(leaving).toHaveAttribute('aria-hidden', 'true');
            act(() => { vi.advanceTimersByTime(180); });
            expect(document.querySelector('.reserve-header-back')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the arrow still and deduplicates back actions until the history move commits', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            fireEvent.click(back);
            fireEvent.click(back);
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();
            // 비동기 이동을 기다리는 동안 버튼을 다시 접었다 펼치지 않는다.
            expect(back).not.toHaveClass('reserve-header-back--leaving');
            expect(back).not.toBeDisabled();
            fireEvent.click(back);
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();
            fireEvent.click(screen.getByRole('button', { name: '이동 완료' }));
            expect(document.querySelector('.reserve-header-back')).toBe(back);
            expect(back).toHaveClass('reserve-header-back--leaving');
            expect(back).toBeDisabled();
            act(() => { vi.advanceTimersByTime(180); });
            expect(document.querySelector('.reserve-header-back')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('retains the same arrow and releases the navigation lock after a deeper route change', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            const original = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            fireEvent.click(original);
            fireEvent.click(screen.getByRole('button', { name: '다른 화면 이동' }));
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            expect(back).toBe(original);
            expect(back).not.toHaveClass('reserve-header-back--leaving');
            expect(back).not.toBeDisabled();
            fireEvent.click(back);
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('unlocks the back button when browser forward restores the same history entry key', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            fireEvent.click(screen.getByRole('button', { name: '다른 화면 이동' }));
            fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
            act(() => { vi.advanceTimersByTime(180); });
            fireEvent.click(screen.getByRole('button', { name: '히스토리 뒤로' }));
            fireEvent.click(screen.getByRole('button', { name: '히스토리 앞으로' }));
            expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/terms');
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            expect(back).not.toHaveClass('reserve-header-back--leaving');
            expect(back).not.toBeDisabled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('removes the back button at once when motion is reduced', () => {
        renderHeader('/store/12');
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(document.querySelector('.reserve-header-back')).toBeNull();
    });

    it('keeps the logo still on home and only scrolls to the top', () => {
        reducedMotionState.value = false;
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        renderHeader();
        const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
        fireEvent.click(logo);
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
        expect(logo).not.toHaveClass('reserve-header-logo--home-motion');
        scroll.mockRestore();
    });
});
