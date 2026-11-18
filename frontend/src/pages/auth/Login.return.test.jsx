import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrivateRoute from '../../components/PrivateRoute';
import Login from './Login';
import { saveSecurityReturn, takeSecurityReturn } from '../../utils/securityReturn';

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
        ['access_denied', '소셜 로그인을 취소했어요.'],
        ['login_method_email_mismatch', '현재 RESERVE 계정과 같은 이메일의 인증된 소셜 계정을 사용해주세요.'],
        ['login_method_identity_mismatch', '처음 연결한 소셜 계정으로 본인 확인해주세요.'],
        ['ip_verification_unavailable', '접속 환경을 확인할 수 없어요. 잠시 후 다시 로그인해주세요.'],
    ])('shows the verified OAuth outcome once and returns to security settings: %s', async (code, text) => {
        const user = { id: 7, name: '기존 계정', role: 'USER', termsAgreed: true };
        const reference = '00000000-0000-4000-a000-000000000001';
        fixture.state = { ...fixture.state, user, isLoggedIn: true };
        fixture.post.mockResolvedValueOnce({ code });
        show('/login?error=oauth2&result=' + reference + '&message=synthetic', true);
        await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent('/my-page?security=retry'));
        expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith(text);
        expect(fixture.state.user).toBe(user);
        expect(fixture.login).not.toHaveBeenCalled();
        expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/api/auth/oauth-outcome', { reference }, { skipAuthRefresh: true, timeout: 5000 });
    });

    it('returns to device choices if the matching OAuth outcome could not be loaded', async () => {
        fixture.state = { ...fixture.state, user: { id: 7, role: 'USER' }, isLoggedIn: true };
        saveSecurityReturn(7, 'devices');
        fixture.post.mockRejectedValueOnce(new Error('outcome unavailable'));
        show('/login?error=oauth2&result=00000000-0000-4000-a000-000000000001', true);
        expect(await screen.findByTestId('destination')).toHaveTextContent('/my-page?security=retry');
        expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith('소셜 로그인 결과를 확인하지 못했어요. 다시 시도해주세요.');
        expect(takeSecurityReturn(7)).toMatchObject({ target: 'devices' });
        expect(fixture.login).not.toHaveBeenCalled();
    });

    it('does not open security settings for an unverified address', async () => {
        fixture.state = { ...fixture.state, user: { id: 7, role: 'USER' }, isLoggedIn: true };
        show('/login?error=oauth2&code=access_denied');
        expect(await screen.findByText('홈')).toBeInTheDocument();
        expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith('소셜 로그인 결과를 확인하지 못했어요. 다시 시도해주세요.');
        expect(fixture.post).not.toHaveBeenCalled();
    });

    it('keeps anonymous users on login and ignores address-supplied copy', async () => {
        show('/login?error=oauth2&message=100%25&code=email_conflict', true);
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith(
            '소셜 로그인 결과를 확인하지 못했어요. 다시 시도해주세요.'));
        expect(screen.getByRole('button', { name: '로그인', exact: true })).toBeInTheDocument();
        expect(fixture.login).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
    });
});
