import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderAccountMenu from './HeaderAccountMenu';
import api from '../../api/axios';
import useMessage from '../../hooks/useMessage';

const { navigate, authState, logout, message, dismissProgress } = vi.hoisted(() => ({
    navigate: vi.fn(),
    authState: {
        user: { id: 1, name: '한재은', email: 'han@example.test', role: 'USER' },
        isLoggingOut: false,
        setLoggingOut: vi.fn(),
    },
    logout: vi.fn(),
    message: { loading: vi.fn(), success: vi.fn(), warning: vi.fn() },
    dismissProgress: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('antd', () => ({
    Dropdown: ({ children, menu }) => (
        <div>
            {children}
            {menu.items.filter(item => item?.key).map(item => (
                <button key={item.key} type="button" disabled={item.disabled} onClick={item.onClick}>{item.label}</button>
            ))}
        </div>
    ),
    Typography: { Text: ({ children }) => <span>{children}</span> },
}));
vi.mock('../../api/axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../store/useAuthStore', () => ({
    default: Object.assign(() => authState, { getState: () => ({ logout }) }),
}));
vi.mock('../../hooks/useMessage', () => ({ default: vi.fn() }));
vi.mock('../common/Avatar', () => ({ default: () => <span aria-hidden="true" /> }));

describe('HeaderAccountMenu logout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authState.user = { id: 1, name: '한재은', email: 'han@example.test', role: 'USER' };
        authState.isLoggingOut = false;
        message.loading.mockReturnValue(dismissProgress);
        useMessage.mockReturnValue({ message });
    });

    it('shows immediate progress and bounds the server logout request to eight seconds', async () => {
        api.post.mockResolvedValue(null);
        const user = userEvent.setup();
        render(<HeaderAccountMenu />);

        await user.click(screen.getByRole('button', { name: '로그아웃' }));

        expect(authState.setLoggingOut).toHaveBeenCalledWith(true);
        expect(message.loading).toHaveBeenCalledWith(expect.objectContaining({
            content: '로그아웃하는 중이에요.', duration: 0,
        }));
        const progress = render(message.loading.mock.calls[0][0].icon);
        expect(screen.getByRole('img', { name: '로딩 중' })).toBeInTheDocument();
        progress.unmount();
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/auth/logout', undefined, {
            timeout: 8000,
            skipAuthRefresh: true,
        }));
        expect(dismissProgress).toHaveBeenCalledTimes(1);
        expect(logout).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/', { replace: true, state: { reserveRouteMotion: 'from-left' } });
        expect(message.success).toHaveBeenCalledWith('로그아웃했어요.');
    });

    it('still clears this device session when the server logout cannot be confirmed', async () => {
        api.post.mockRejectedValue(new Error('timeout'));
        const user = userEvent.setup();
        render(<HeaderAccountMenu />);

        await user.click(screen.getByRole('button', { name: '로그아웃' }));

        await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
        expect(navigate).toHaveBeenCalledWith('/', { replace: true, state: { reserveRouteMotion: 'from-left' } });
        expect(message.warning).toHaveBeenCalledWith('이 기기에서 로그아웃했어요. 서버 연결은 확인하지 못했어요.');
    });
});
