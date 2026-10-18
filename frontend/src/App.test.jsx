import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import App from './App';

// 앱 셸을 실제 라우터(BrowserRouter)로 띄우되, 네트워크·무거운 레이아웃은 가볍게 바꾼다.
// 확인하려는 것은 "라우트 표 + 오류 경계 + SEO 관문"의 연결이다.
const { authState, pageState } = vi.hoisted(() => ({
    authState: { user: null, isLoggedIn: false, sessionRevision: 0, initializeAuth: async () => {} },
    pageState: { termsThrows: false },
}));
vi.mock('./store/useAuthStore', () => ({
    default: Object.assign((selector) => (selector ? selector(authState) : authState), {
        getState: () => authState,
        subscribe: () => () => {},
    }),
}));
vi.mock('./components/layout/Header', () => ({
    default: () => <header><Link to="/somewhere-else">다른 곳으로</Link></header>,
    HeaderPlaceholder: () => <div aria-hidden="true" data-testid="site-header-placeholder" />,
}));
vi.mock('./components/layout/Footer', () => ({ default: () => <footer>푸터</footer> }));
vi.mock('./components/layout/OfflineBanner', () => ({ default: () => null }));
vi.mock('./components/layout/DiscoveryNav', () => ({ default: () => null }));
vi.mock('./components/chat/MessengerShell', () => ({ default: () => null }));
vi.mock('./pages/member/MessagesPage', () => ({ default: () => <h1>메시지 화면</h1> }));
vi.mock('./pages/auth/Login', () => ({ default: () => <h1>로그인 화면</h1> }));
vi.mock('./pages/legal/Terms', () => ({
    default: () => {
        if (pageState.termsThrows) throw new Error('terms render failed');
        return <h1>서비스 이용약관</h1>;
    },
}));

const renderAt = (path) => {
    window.history.replaceState(null, '', path);
    render(<App />);
};

describe('app route table fallbacks', () => {
    // Test the route table with the real page, not the first Vite transform of its lazy module.
    beforeAll(() => Promise.all([
        import('./pages/NotFound'), import('./pages/legal/UserGuide'), import('./pages/legal/BusinessGuide'),
        import('./pages/legal/CommonGuide'), import('./pages/legal/OperationGuide'),
        import('./pages/member/MessagesPage'), import('./pages/auth/Login'),
    ]));
    beforeEach(() => {
        document.head.innerHTML = `
            <title>RESERVE | 예약이 필요한 순간</title>
            <meta name="robots" content="index, follow" />
            <meta property="og:url" content="https://reserve.it.kr" />
            <link rel="canonical" href="https://reserve.it.kr" />
        `;
        pageState.termsThrows = false;
        authState.user = null;
        authState.isLoggedIn = false;
        authState.initializeAuth = async () => {};
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('uses the messenger frame without a site header or footer during boot and after authentication', async () => {
        let finishAuth;
        authState.user = { id: 1, role: 'USER', termsAgreed: true };
        authState.isLoggedIn = true;
        authState.initializeAuth = () => new Promise(resolve => { finishAuth = resolve; });
        renderAt('/messages');
        expect(document.querySelector('.reserve-app-layout--messages.reserve-boot-shell')).toBeInTheDocument();
        expect(screen.queryByTestId('site-header-placeholder')).toBeNull();
        expect(document.querySelector('header, footer')).toBeNull();
        await act(async () => finishAuth());
        expect(await screen.findByRole('heading', { name: '메시지 화면' })).toBeInTheDocument();
        expect(document.querySelector('.reserve-app-layout--messages')).toBeInTheDocument();
        expect(document.querySelector('header, footer')).toBeNull();
    });

    it('keeps anonymous message entry protected and restores the normal login frame', async () => {
        renderAt('/messages?storeId=14#conversation');
        expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/login');
        expect(screen.queryByRole('heading', { name: '메시지 화면' })).toBeNull();
        expect(document.querySelector('header')).toBeInTheDocument();
        expect(screen.getByText('푸터')).toBeInTheDocument();
        expect(window.history.state.usr.from.pathname).toBe('/messages');
        expect(window.history.state.usr.from.search).toBe('?storeId=14');
        expect(window.history.state.usr.from.hash).toBe('#conversation');
    });

    it.each([
        '/this-does-not-exist',
        '/,%20https://reserve.it.kr/login',
        '/store/12/unknown',
    ])('renders the not-found page with noindex for %s instead of an empty body', async (path) => {
        renderAt(path);

        expect(await screen.findByRole('heading', { level: 1, name: '페이지를 찾을 수 없어요' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '홈으로' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '뒤로가기' })).toBeInTheDocument();
        expect(screen.getByText('푸터')).toBeInTheDocument();
        expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toMatch(/^noindex/);
        expect(document.title).toBe('페이지를 찾을 수 없어요 | RESERVE');
    });

    it.each([
        ['/guide/user', '사용자 이용안내'],
        ['/guide/business', '사업자 이용안내'],
        ['/guide/common', '공통 이용안내'],
    ])('opens %s publicly with its own title and canonical', async (path, title) => {
        renderAt(path);
        expect(await screen.findByRole('navigation', { name: '이용안내' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
        expect(document.title).toBe(title + ' | RESERVE');
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://reserve.it.kr' + path);
    });

    it('keeps the legacy guide public and preserves its query and fragment on redirect', async () => {
        renderAt('/operation-guide?source=legacy#policy');
        expect(await screen.findByRole('navigation', { name: '이용안내' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: '공통 이용안내' })).toBeInTheDocument();
        expect(window.location.pathname + window.location.search + window.location.hash).toBe('/guide/common?source=legacy#policy');
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://reserve.it.kr/guide/common');
    });

    it('keeps the header when a routed page throws, then recovers on the next address', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pageState.termsThrows = true;
        renderAt('/terms');

        expect(await screen.findByRole('heading', { name: '문제가 생겼어요' })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '다른 곳으로' })).toBeInTheDocument();
        expect(screen.getByText('푸터')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('link', { name: '다른 곳으로' }));

        expect(await screen.findByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: '문제가 생겼어요' })).toBeNull();
    });

    it('retries the same route after the render error is fixed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pageState.termsThrows = true;
        renderAt('/terms');
        expect(await screen.findByRole('heading', { name: '문제가 생겼어요' })).toBeInTheDocument();

        pageState.termsThrows = false;
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

        expect(await screen.findByRole('heading', { name: '서비스 이용약관' })).toBeInTheDocument();
    });
});
