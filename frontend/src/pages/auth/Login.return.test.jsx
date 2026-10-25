import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrivateRoute from '../../components/PrivateRoute';
import Login from './Login';

const fixture = vi.hoisted(() => ({ state: {}, post: vi.fn(), login: vi.fn(),
    message: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post } }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => typeof selector === 'function' ? selector(fixture.state) : fixture.state }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message }) }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));

function Destination() {
    const location = useLocation();
    return <output data-testid="destination">{location.pathname}{location.search}{location.hash}</output>;
}
function show(path, strict = false) {
    const page = <MemoryRouter initialEntries={[path]}><AntApp><Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/my-page" element={<Destination />} />
        <Route element={<PrivateRoute allowedRoles={['ADMIN', 'BUSINESS']} />}>
            <Route path="/business" element={<Destination />} /><Route path="/admin" element={<Destination />} />
        </Route><Route path="/" element={<span>홈</span>} />
    </Routes></AntApp></MemoryRouter>;
    return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

describe('workspace login return', () => {
    beforeEach(() => {
        vi.clearAllMocks(); sessionStorage.clear();
        fixture.state = { isLoggedIn: false, user: null, isLoggingOut: false, login: fixture.login };
        fixture.login.mockImplementation(user => { fixture.state = { ...fixture.state, user, isLoggedIn: true }; });
        fixture.post.mockResolvedValue({ id: 9, name: '점검 계정', role: 'ADMIN', termsAgreed: true });
    });
    afterEach(() => sessionStorage.clear());
    it.each(['/business?tab=ads&advertisementPage=2#return', '/admin?tab=feed-reports&reportMode=comments#return'])('email login keeps the complete return address %s', async path => {
            const user = userEvent.setup(); show(path);
            await user.type(await screen.findByPlaceholderText('이메일 주소'), 'fixture@example.test');
            await user.type(screen.getByPlaceholderText('비밀번호'), 'fixture-password');
            fireEvent.submit(screen.getByRole('button', { name: '로그인', exact: true }).closest('form'));
            await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent(path));
            expect(sessionStorage.getItem('reserve:redirectAfterLogin')).toBeNull();
        });

    it.each([
        '소셜 로그인을 취소했어요.',
        '현재 RESERVE 계정과 같은 이메일의 인증된 소셜 계정을 사용해주세요.',
        '처음 연결한 소셜 계정으로 본인 확인해주세요.',
        '본인 확인을 100% 완료하지 못했어요.',
    ])('shows a signed-in OAuth failure once and returns to security settings: %s', async text => {
        const user = { id: 7, name: '기존 계정', role: 'USER', termsAgreed: true };
        fixture.state = { ...fixture.state, user, isLoggedIn: true };
        sessionStorage.setItem('reserve:redirectAfterLogin', '/admin?tab=feed-reports');
        show(`/login?${new URLSearchParams({ error: 'oauth2', message: text })}`, true);
        await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent('/my-page'));
        expect(fixture.message.error).toHaveBeenCalledTimes(1);
        expect(fixture.message.error).toHaveBeenCalledWith(text);
        expect(fixture.state.user).toBe(user);
        expect(fixture.state.isLoggedIn).toBe(true);
        expect(fixture.login).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
    });

    it('returns a signed-in OAuth failure with no message to settings with a fallback notice', async () => {
        fixture.state = { ...fixture.state, user: { id: 7, role: 'USER' }, isLoggedIn: true };
        show('/login?error=oauth2');
        await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent('/my-page'));
        expect(fixture.message.error).toHaveBeenCalledWith('소셜 로그인하지 못했어요. 다시 시도해주세요.');
    });

    it('keeps an anonymous OAuth failure on login and decodes its message only once', async () => {
        const text = '소셜 로그인을 취소했어요. 진행률 100%';
        show(`/login?${new URLSearchParams({ error: 'oauth2', message: text })}`, true);
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledTimes(1));
        expect(fixture.message.error).toHaveBeenCalledWith(text);
        expect(screen.getByRole('button', { name: '로그인', exact: true })).toBeInTheDocument();
        expect(screen.queryByTestId('destination')).toBeNull();
        expect(fixture.state.isLoggedIn).toBe(false);
        expect(fixture.login).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
    });
});
