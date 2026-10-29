import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Signup from './Signup';
import SocialAgreement from './SocialAgreement';
import SignupLegalLayout from '../../components/layout/SignupLegalLayout';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { API_ENDPOINTS } from '../../constants';

const fixture = vi.hoisted(() => ({ message: { error: vi.fn(), success: vi.fn() }, post: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post } }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ isLoggedIn: false, user: null }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message }) }));
vi.mock('../../hooks', async () => ({
    useMessage: () => ({ message: fixture.message }),
    useEmailVerification: (await import('../../hooks/useEmailVerification')).default,
    useFormErrors: (await import('../../hooks/useFormErrors')).default,
}));

function LegalDocument({ title }) {
    useDocumentTitle(title);
    return <h1>{title}</h1>;
}
function NavigationControls() {
    const navigate = useNavigate();
    return <nav aria-label="시험 이동">
        <button type="button" onClick={() => navigate(-1)}>뒤로</button>
        <button type="button" onClick={() => navigate(1)}>앞으로</button>
        <Link to="/outside">다른 화면으로</Link>
        <Link to="/signup">가입 화면으로</Link>
    </nav>;
}
function show(path = '/signup') {
    return render(<MemoryRouter initialEntries={[path]}><AntApp>
        <NavigationControls />
        <Routes>
            <Route element={<SignupLegalLayout signup={<Signup />} socialAgreement={<SocialAgreement />} />}>
                <Route path="/signup" element={null} />
                <Route path="/signup/social" element={null} />
                <Route path="/terms" element={<LegalDocument title="서비스 이용약관" />} />
                <Route path="/privacy" element={<LegalDocument title="개인정보 처리방침" />} />
            </Route>
            <Route path="/outside" element={<h1>다른 화면</h1>} />
            <Route path="/login" element={<h1>로그인 화면</h1>} />
        </Routes>
    </AntApp></MemoryRouter>);
}
async function verifyEmail() {
    fireEvent.change(screen.getByPlaceholderText('이메일 주소'), { target: { value: 'signup@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '코드발송', exact: true }));
    fireEvent.change(await screen.findByPlaceholderText('6자리 인증번호'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
    await screen.findByRole('button', { name: '인증됨', exact: true });
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    fixture.post.mockImplementation(async path => path === API_ENDPOINTS.AUTH.SIGNUP ? null : {
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        ...(path === API_ENDPOINTS.EMAIL.VERIFY_CODE ? { verificationTicket: 'a'.repeat(43) } : {}),
    });
});
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

it.each([
    ['/signup', 0, '서비스 이용약관'],
    ['/signup', 1, '개인정보 처리방침'],
    ['/signup/social', 0, '서비스 이용약관'],
    ['/signup/social', 1, '개인정보 처리방침'],
])('%s opens legal document %s in the current SPA without submitting or opening a window', (path, index, title) => {
    const popup = vi.spyOn(window, 'open').mockImplementation(() => null);
    show(path);
    fireEvent.click(screen.getAllByRole('button', { name: '보기', exact: true })[index]);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(popup).not.toHaveBeenCalled();
    expect(fixture.post).not.toHaveBeenCalled();
});

it('keeps signup inputs, email proof and consent through legal-page history visits', async () => {
    show();
    fireEvent.change(screen.getByPlaceholderText('이름'), { target: { value: '가입 점검' } });
    await verifyEmail();
    fireEvent.change(screen.getByPlaceholderText('비밀번호 (8자 이상, 영문+숫자)'), { target: { value: 'Fixture123!' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 확인'), { target: { value: 'Fixture123!' } });
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getAllByRole('checkbox')[3]);
    fireEvent.click(screen.getAllByRole('button', { name: '보기', exact: true })[1]);

    expect(screen.getByRole('heading', { name: '개인정보 처리방침' })).toBeInTheDocument();
    const hiddenForm = screen.getByPlaceholderText('이름').closest('[hidden]');
    expect(hiddenForm).toHaveAttribute('inert');
    expect(hiddenForm).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: '가입 완료', exact: true })).toBeNull();
    expect(document.title).toBe('개인정보 처리방침 | RESERVE');
    expect(localStorage.getItem('reserve_email_verify')).toBeNull();
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('Fixture123!');
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('a'.repeat(43));
    expect(sessionStorage.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '뒤로', exact: true }));
    expect(screen.getByPlaceholderText('이름')).toHaveValue('가입 점검');
    expect(screen.getByPlaceholderText('이메일 주소')).toHaveValue('signup@example.test');
    expect(screen.getByPlaceholderText('비밀번호 (8자 이상, 영문+숫자)')).toHaveValue('Fixture123!');
    expect(screen.getByPlaceholderText('비밀번호 확인')).toHaveValue('Fixture123!');
    expect(screen.getByRole('button', { name: '인증됨', exact: true })).toBeDisabled();
    expect(screen.getAllByRole('checkbox')[1]).toBeChecked();
    expect(screen.getAllByRole('checkbox')[2]).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')[3]).toBeChecked();
    expect(document.title).toBe('회원가입 | RESERVE');

    fireEvent.click(screen.getByRole('button', { name: '앞으로', exact: true }));
    expect(screen.getByRole('heading', { name: '개인정보 처리방침' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '뒤로', exact: true }));
    fireEvent.click(screen.getAllByRole('checkbox')[2]);
    fireEvent.submit(screen.getByRole('button', { name: '가입 완료', exact: true }).closest('form'));
    await waitFor(() => expect(fixture.post).toHaveBeenCalledWith(API_ENDPOINTS.AUTH.SIGNUP, expect.objectContaining({
        name: '가입 점검', email: 'signup@example.test', password: 'Fixture123!',
        passwordConfirm: 'Fixture123!', verificationTicket: 'a'.repeat(43), termsAgreed: true, marketingAgreed: true,
    })));
});

it('keeps social-signup consent when returning from a legal document', () => {
    show('/signup/social');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getAllByRole('checkbox')[3]);
    fireEvent.click(screen.getAllByRole('button', { name: '보기', exact: true })[0]);
    fireEvent.click(screen.getByRole('button', { name: '뒤로', exact: true }));
    expect(screen.getAllByRole('checkbox')[1]).toBeChecked();
    expect(screen.getAllByRole('checkbox')[2]).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')[3]).toBeChecked();
    expect(document.title).toBe('서비스 이용 동의 | RESERVE');
});

it.each(['/terms', '/privacy'])('does not mount signup when directly opening %s', path => {
    show(path);
    expect(screen.queryByPlaceholderText('이름')).toBeNull();
    expect(screen.queryByText('RESERVE 서비스 이용 동의')).toBeNull();
    expect(fixture.post).not.toHaveBeenCalled();
});

it('discards signup inputs and proof after leaving the signup/legal route group', async () => {
    show();
    fireEvent.change(screen.getByPlaceholderText('이름'), { target: { value: '떠난 가입 폼' } });
    await verifyEmail();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '보기', exact: true })[0]);
    fireEvent.click(screen.getByRole('link', { name: '다른 화면으로' }));
    expect(screen.getByRole('heading', { name: '다른 화면' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('이름')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '가입 화면으로' }));
    expect(screen.getByPlaceholderText('이름')).toHaveValue('');
    expect(screen.getByPlaceholderText('이메일 주소')).toHaveValue('');
    expect(screen.getByRole('button', { name: '가입 완료', exact: true })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '인증됨', exact: true })).toBeNull();
    expect(screen.getAllByRole('checkbox').every(checkbox => !checkbox.checked)).toBe(true);
});
