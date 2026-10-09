import { act, render } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OAuthCallback from './OAuthCallback';
import { preloadRouteSkeletons } from '../../components/layout/routeSkeletonLoader';
import { clearRedirect, peekRedirect, saveRedirect } from '../../utils/redirect';

const { checkAuth, navigate, message } = vi.hoisted(() => ({
    checkAuth: vi.fn(), navigate: vi.fn(), message: { success: vi.fn(), error: vi.fn() },
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
    beforeAll(() => preloadRouteSkeletons());
    beforeEach(() => {
        clearRedirect();
        vi.clearAllMocks();
        vi.spyOn(App, 'useApp').mockReturnValue({ message });
    });
    afterEach(() => { clearRedirect(); vi.restoreAllMocks(); });

    it('keeps the home skeleton while authentication waits, without a full-screen spinner', async () => {
        let resolve;
        checkAuth.mockReturnValue(new Promise(yes => { resolve = yes; }));
        const { container } = render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        expect(container.querySelector('.reserve-discovery-featured')).toBeInTheDocument();
        expect(container.querySelector('svg[aria-label="로딩 중"]')).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        await act(async () => resolve({ email: 'account@example.test', name: '회원' }));
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('shows the saved destination and consumes it only after authentication succeeds', async () => {
        saveRedirect('/my-reservations?view=list');
        let resolve;
        checkAuth.mockReturnValue(new Promise(yes => { resolve = yes; }));
        const { container } = render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        expect(container.querySelector('.reserve-route-skeleton--reservations')).toBeInTheDocument();
        expect(peekRedirect()).toBe('/my-reservations?view=list');
        await act(async () => resolve({ email: 'account@example.test' }));
        expect(navigate).toHaveBeenCalledWith('/my-reservations?view=list', { replace: true });
        expect(peekRedirect()).toBeNull();
    });

    it('ignores an authentication failure after the callback screen has been left', async () => {
        let resolve;
        checkAuth.mockReturnValue(new Promise(yes => { resolve = yes; }));
        const { unmount } = render(<MemoryRouter initialEntries={['/oauth2/callback']}><OAuthCallback /></MemoryRouter>);
        unmount();
        await act(async () => resolve(null));
        expect(navigate).not.toHaveBeenCalled();
        expect(message.error).not.toHaveBeenCalled();
    });
});
