import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthCallback from './OAuthCallback';
import { preloadRouteSkeletons } from '../../components/layout/routeSkeletonLoader';
import DiscoveryRouteSkeleton from '../../components/layout/DiscoveryRouteSkeleton';
import RouteSkeletonPages from '../../components/layout/RouteSkeletonPages';
import { clearRedirect, peekRedirect, saveRedirect } from '../../utils/redirect';
import { consumeLoginFeedback } from '../../utils/loginFeedback';
import { refreshSessionOnce } from '../../api/sessionRefresh';
import { currentSession } from '../../api/sessionScope';

const { checkAuth, navigate, replace, api, message } = vi.hoisted(() => ({
    checkAuth: vi.fn(), navigate: vi.fn(), replace: vi.fn(), message: { success: vi.fn(), error: vi.fn() },
    api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../api/axios', () => ({ default: api }));
vi.mock('../../store/useAuthStore', () => {
    const state = { checkAuth, user: null, isLoggedIn: false, sessionRevision: 0 };
    return { default: Object.assign(selector => selector ? selector(state) : state, {
        getState: () => state,
        subscribe: () => () => {},
    }) };
});
vi.mock('react-router-dom', async importOriginal => ({ ...(await importOriginal()), useNavigate: () => navigate }));

describe('OAuth pending presentation', () => {
    beforeAll(async () => {
        expect((await preloadRouteSkeletons('discovery'))?.default).toBe(DiscoveryRouteSkeleton);
        expect((await preloadRouteSkeletons('reservations'))?.default).toBe(RouteSkeletonPages);
    });
    beforeEach(() => {
        window.history.replaceState({}, '', '/oauth2/callback');
        vi.stubGlobal('location', { ...window.location, replace });
        clearRedirect();
        sessionStorage.removeItem('reserve:oauth-login-feedback');
        vi.clearAllMocks();
        vi.spyOn(App, 'useApp').mockReturnValue({ message });
    });
    afterEach(() => { clearRedirect(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

    it('keeps the home skeleton while authentication waits, without a full-screen spinner', async () => {
        let resolve;
        checkAuth.mockReturnValue(new Promise(yes => { resolve = yes; }));
        const { container } = render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        expect(container.querySelector('.reserve-discovery-featured')).toBeInTheDocument();
        expect(container.querySelector('svg[aria-label="로딩 중"]')).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        const user = { id: 7, role: 'USER', email: 'account@example.test', name: '회원', termsAgreed: true };
        await act(async () => resolve(user));
        expect(replace).toHaveBeenCalledWith('/');
        expect(api.get).not.toHaveBeenCalled();
        expect(message.success).not.toHaveBeenCalled();
        expect(consumeLoginFeedback(user)).toBe(true);
    });

    it('shows the saved destination and consumes it only after authentication succeeds', async () => {
        saveRedirect('/my-reservations?view=list');
        let resolve;
        checkAuth.mockReturnValue(new Promise(yes => { resolve = yes; }));
        const { container } = render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        expect(container.querySelector('.reserve-route-skeleton--reservations')).toBeInTheDocument();
        expect(peekRedirect()).toBe('/my-reservations?view=list');
        await act(async () => resolve({ email: 'account@example.test' }));
        expect(replace).toHaveBeenCalledWith('/my-reservations?view=list');
        expect(peekRedirect()).toBeNull();
    });

    it('ignores an authentication failure after the callback screen has been left', async () => {
        let resolve;
        checkAuth.mockReturnValue(new Promise(yes => { resolve = yes; }));
        const { unmount } = render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        unmount();
        await act(async () => resolve(null));
        expect(navigate).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        expect(message.error).not.toHaveBeenCalled();
    });
    it('keeps provider response details out of the console on authentication failure', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        checkAuth.mockRejectedValueOnce(Object.assign(new Error('synthetic private detail'), { response: { data: 'synthetic response body' } }));
        render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        await act(async () => {});
        expect(log).toHaveBeenCalledExactlyOnceWith('OAuth sign-in could not be completed');
        expect(message.error).toHaveBeenCalledWith('로그인 정보를 가져오지 못했어요.');
        expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('returns to the onsite QR destination without exposing its token in a query', async () => {
        saveRedirect('/store/31#waiting-token=rw1.j.example');
        checkAuth.mockResolvedValue({ email: 'account@example.test', termsAgreed: true });
        render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        await act(async () => {});
        expect(replace).toHaveBeenCalledWith('/store/31#waiting-token=rw1.j.example');
        expect(navigate).not.toHaveBeenCalled();
        expect(peekRedirect()).toBeNull();
    });

    it('uses the authenticated terms state and retains the onsite destination until agreement', async () => {
        saveRedirect('/store/31#waiting-token=rw1.j.example');
        checkAuth.mockResolvedValue({ email: 'account@example.test', termsAgreed: false });
        render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        await act(async () => {});
        expect(replace).toHaveBeenCalledWith('/signup/social');
        expect(peekRedirect()).toBe('/store/31#waiting-token=rw1.j.example');
    });

    it.each([[false, true], [false, false], [true, true], [true, false]])(
        'asks only after login, then resumes the original route (passkey=%s, keep=%s)', async (passkey, keep) => {
        const target = '/my-reservations?view=list#fixture';
        saveRedirect(target);
        checkAuth.mockResolvedValue({ id: 7, email: 'account@example.test', termsAgreed: true });
        api.get.mockResolvedValue({ reference: 'fixture-offer' });
        render(<ConfigProvider theme={{ token: { motion: false } }}>
            <MemoryRouter initialEntries={[{ pathname: '/oauth2/callback', search: '?remember=1',
                state: passkey ? { passkeyReturn: { path: target, prevented: true } } : null }]}><OAuthCallback /></MemoryRouter>
        </ConfigProvider>);
        expect(await screen.findByRole('dialog', { name: '로그인을 유지할까요?' })).toBeInTheDocument();
        expect(replace).not.toHaveBeenCalled();
        let releaseRefresh;
        const refresh = keep ? refreshSessionOnce(currentSession().epoch, () => new Promise(resolve => { releaseRefresh = resolve; })) : null;
        fireEvent.click(screen.getByRole('button', { name: keep ? '로그인 유지' : '이번만 로그인' }));
        if (refresh) {
            await act(async () => {});
            try { expect(api.post).not.toHaveBeenCalled(); }
            finally { await act(async () => { releaseRefresh(); await refresh; }); }
        }
        if (passkey) {
            await waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith(target, { replace: true, state: { reserveRouteMotion: 'from-right' } }));
            expect(replace).not.toHaveBeenCalled();
        } else await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(target));
        if (keep) expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/auth/remember-login', { reference: 'fixture-offer' },
            { skipAuthRefresh: true, timeout: 8000 });
        else expect(api.post).not.toHaveBeenCalled();
    });

    it('leaves the prompt out when the server has no matching offer', async () => {
        checkAuth.mockResolvedValue({ email: 'account@example.test', termsAgreed: true });
        api.get.mockResolvedValue(null);
        render(<MemoryRouter initialEntries={['/oauth2/callback?remember=1']}><OAuthCallback /></MemoryRouter>);
        await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith('/'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('uses a neutral fallback when a legacy address contains arbitrary copy', () => {
        window.history.replaceState({}, '', '/oauth2/callback?error=oauth2&message=100%25');
        render(<MemoryRouter initialEntries={['/oauth2/callback?error=oauth2&message=100%25']}><OAuthCallback /></MemoryRouter>);
        expect(checkAuth).not.toHaveBeenCalled();
        expect(message.error).toHaveBeenCalledWith('소셜 로그인 결과를 확인하지 못했어요. 다시 시도해주세요.');
        expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
});
