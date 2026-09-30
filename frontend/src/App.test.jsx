import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import App from './App';

// 앱 셸을 실제 라우터(BrowserRouter)로 띄우되, 네트워크·무거운 레이아웃은 가볍게 바꾼다.
// 확인하려는 것은 "라우트 표 + 오류 경계 + SEO 관문"의 연결이다.
const { authState, pageState } = vi.hoisted(() => ({
    authState: { user: null, sessionRevision: 0, initializeAuth: async () => {} },
    pageState: { termsThrows: false },
}));
vi.mock('./store/useAuthStore', () => ({
    default: (selector) => (selector ? selector(authState) : authState),
}));
vi.mock('./components/layout/Header', () => ({
    default: () => <header><Link to="/somewhere-else">다른 곳으로</Link></header>,
    HeaderPlaceholder: () => <div aria-hidden="true" />,
}));
vi.mock('./components/layout/Footer', () => ({ default: () => <footer>푸터</footer> }));
vi.mock('./components/layout/OfflineBanner', () => ({ default: () => null }));
vi.mock('./components/layout/DiscoveryNav', () => ({ default: () => null }));
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
    beforeAll(() => import('./pages/NotFound'));
    beforeEach(() => {
        document.head.innerHTML = `
            <title>RESERVE | 예약이 필요한 순간</title>
            <meta name="robots" content="index, follow" />
            <meta property="og:url" content="https://reserve.it.kr" />
            <link rel="canonical" href="https://reserve.it.kr" />
        `;
        pageState.termsThrows = false;
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

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
