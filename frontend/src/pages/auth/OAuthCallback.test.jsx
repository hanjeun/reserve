import { act, render } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthCallback from './OAuthCallback';
import { preloadRouteSkeletons } from '../../components/layout/routeSkeletonLoader';
import DiscoveryRouteSkeleton from '../../components/layout/DiscoveryRouteSkeleton';
import RouteSkeletonPages from '../../components/layout/RouteSkeletonPages';
import { clearRedirect, peekRedirect, saveRedirect } from '../../utils/redirect';

const { checkAuth, navigate, replace, message } = vi.hoisted(() => ({
    checkAuth: vi.fn(), navigate: vi.fn(), replace: vi.fn(), message: { success: vi.fn(), error: vi.fn() },
}));
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
        await act(async () => resolve({ email: 'account@example.test', name: '회원' }));
        expect(replace).toHaveBeenCalledWith('/');
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

    it('handles an already decoded error containing a percent sign without getting stuck', () => {
        window.history.replaceState({}, '', '/oauth2/callback?error=oauth2&message=100%25');
        window.location.search = '?error=oauth2&message=100%25';
        render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        expect(checkAuth).not.toHaveBeenCalled();
        expect(message.error).toHaveBeenCalledWith('100%');
        expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
});
