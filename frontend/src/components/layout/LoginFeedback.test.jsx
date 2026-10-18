import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from 'antd';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginFeedback from './LoginFeedback';
import { consumeLoginFeedback, rememberLoginFeedback } from '../../utils/loginFeedback';

const fixture = vi.hoisted(() => ({ user: { id: 7, role: 'USER', name: '회원', termsAgreed: true }, message: { success: vi.fn() } }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => selector({ user: fixture.user }) }));

beforeEach(() => {
    sessionStorage.clear(); vi.clearAllMocks();
    vi.spyOn(App, 'useApp').mockReturnValue({ message: fixture.message });
});
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe('login feedback after document replacement', () => {
    it('waits until leaving the callback, then presents the email-login wording once', () => {
        rememberLoginFeedback(fixture.user);
        render(<StrictMode><MemoryRouter initialEntries={['/oauth2/callback']}>
            <LoginFeedback /><Link to="/guide/common">도착 화면</Link>
        </MemoryRouter></StrictMode>);
        expect(fixture.message.success).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('link', { name: '도착 화면' }));
        expect(fixture.message.success).toHaveBeenCalledExactlyOnceWith('회원님, 로그인됐어요!');
        expect(consumeLoginFeedback(fixture.user)).toBe(false);
    });
    it('does not repeat the feedback on a later document load', () => {
        rememberLoginFeedback(fixture.user);
        const first = render(<StrictMode><MemoryRouter><LoginFeedback /></MemoryRouter></StrictMode>);
        first.unmount();
        render(<MemoryRouter><LoginFeedback /></MemoryRouter>);
        expect(fixture.message.success).toHaveBeenCalledOnce();
    });
});
