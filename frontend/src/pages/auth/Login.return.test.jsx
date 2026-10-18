import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
function show(path) {
    return render(<MemoryRouter initialEntries={[path]}><AntApp><Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateRoute allowedRoles={['ADMIN', 'BUSINESS']} />}>
            <Route path="/business" element={<Destination />} /><Route path="/admin" element={<Destination />} />
        </Route><Route path="/" element={<span>홈</span>} />
    </Routes></AntApp></MemoryRouter>);
}

describe('workspace login return', () => {
    beforeEach(() => {
        vi.clearAllMocks(); sessionStorage.clear();
        fixture.state = { isLoggedIn: false, user: null, isLoggingOut: false, login: fixture.login };
        fixture.login.mockImplementation(user => { fixture.state = { ...fixture.state, user, isLoggedIn: true }; });
        fixture.post.mockResolvedValue({ id: 9, name: '점검 계정', role: 'ADMIN', termsAgreed: true });
    });
    afterEach(() => sessionStorage.clear());
    it.each(['/business?tab=ads&advertisementPage=2#return', '/admin?tab=feed-reports&reportMode=comments#return'])
        ('email login keeps the complete return address %s', async path => {
            const user = userEvent.setup(); show(path);
            await user.type(await screen.findByPlaceholderText('이메일 주소'), 'fixture@example.test');
            await user.type(screen.getByPlaceholderText('비밀번호'), 'fixture-password');
            fireEvent.submit(screen.getByRole('button', { name: '로그인', exact: true }).closest('form'));
            await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent(path));
            expect(sessionStorage.getItem('reserve:redirectAfterLogin')).toBeNull();
        });
});
