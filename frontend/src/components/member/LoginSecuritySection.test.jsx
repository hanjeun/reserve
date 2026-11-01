import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LoginSecuritySection from './LoginSecuritySection';
import useAuthStore from '../../store/useAuthStore';
import { saveSecurityReturn } from '../../utils/securityReturn';

const fixture = vi.hoisted(() => ({
    api: { getLoginMethods: vi.fn(), beginLoginMethodOAuth: vi.fn(), sendLoginMethodCode: vi.fn(),
        setLoginMethodPassword: vi.fn(), removeLoginMethodPassword: vi.fn(), unlinkSocialLogin: vi.fn(), changePassword: vi.fn() },
    message: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, confirm: vi.fn(), navigate: vi.fn(), logout: vi.fn(), mfaGet: vi.fn(), mfaPost: vi.fn(),
}));
vi.mock('../../services', () => ({ memberService: fixture.api }));
vi.mock('../../api/axios', () => ({ default: { get: fixture.mfaGet, post: fixture.mfaPost } }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message, confirm: fixture.confirm }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message, confirm: fixture.confirm }) }));
vi.mock('react-router-dom', async original => ({ ...await original(), useNavigate: () => fixture.navigate }));
const owner = { id: 7, email: 'owner@naver.com', role: 'BUSINESS' };
const methods = overrides => ({ memberId: 7, passwordEnabled: true, socialProvider: null,
    email: owner.email, socialProofFresh: false, linkableSocialProvider: 'NAVER', ...overrides });
const defer = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const view = user => <AntApp><MemoryRouter><LoginSecuritySection user={user} /></MemoryRouter></AntApp>;
beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    useAuthStore.setState({ user: owner, sessionRevision: 70, isLoggedIn: true, logout: fixture.logout });
    fixture.api.getLoginMethods.mockResolvedValue(methods());
    fixture.mfaGet.mockResolvedValue({ available: true, enabled: false, required: false, credentials: [] });
});

it('소셜 본인 확인 뒤 시작했던 이메일 설정 폼을 바로 열어요', async () => {
    saveSecurityReturn(owner.id, 'setup-password');
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE', socialProofFresh: true }));
    render(<AntApp><MemoryRouter initialEntries={['/my-page?security=verified']}><LoginSecuritySection user={owner} /></MemoryRouter></AntApp>);
    expect(await screen.findByLabelText('로그인 이메일')).toBeVisible();
    await waitFor(() => expect(document.activeElement).toHaveClass('reserve-login-security-panel'));
    expect(fixture.api.setLoginMethodPassword).not.toHaveBeenCalled();
});

it('다른 계정의 폼 복귀 정보로 작업 폼을 열지 않아요', async () => {
    saveSecurityReturn(8, 'setup-password');
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE', socialProofFresh: true }));
    render(<AntApp><MemoryRouter initialEntries={['/my-page?security=verified']}><LoginSecuritySection user={owner} /></MemoryRouter></AntApp>);
    await waitFor(() => expect(fixture.message.success).toHaveBeenCalled());
    expect(screen.queryByLabelText('로그인 이메일')).toBeNull();
});

it('연결 해제 폼을 복원해도 해제 요청은 자동으로 보내지 않아요', async () => {
    saveSecurityReturn(owner.id, 'unlink');
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'GOOGLE', socialProofFresh: true }));
    render(<AntApp><MemoryRouter initialEntries={['/my-page?security=verified']}><LoginSecuritySection user={owner} /></MemoryRouter></AntApp>);
    expect(await screen.findByRole('button', { name: '연결 해제', exact: true })).toBeVisible();
    expect(fixture.api.unlinkSocialLogin).not.toHaveBeenCalled();
});

it('관리자 소셜 복귀는 관리 화면을 열어도 추가 인증을 자동 통과하지 않아요', async () => {
    const member = { ...owner, role: 'ADMIN' };
    useAuthStore.setState({ user: member });
    saveSecurityReturn(member.id, 'mfa');
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'GOOGLE', socialProofFresh: true }));
    fixture.mfaGet.mockResolvedValue({ available: true, enabled: true, required: true, credentials: [{ id: 'fixture-key', kind: 'PASSKEY' }] });
    fixture.mfaPost.mockResolvedValue({ purpose: 'MANAGE', verified: false, passkeyAvailable: true });
    render(<AntApp><MemoryRouter initialEntries={['/my-page?security=verified']}><LoginSecuritySection user={member} /></MemoryRouter></AntApp>);
    expect(await screen.findByRole('button', { name: '패스키로 확인' })).toBeVisible();
    expect(fixture.mfaPost).toHaveBeenCalledExactlyOnceWith('/api/member/mfa/manage', { password: undefined }, expect.anything());
});

it('본인 확인이 실패하면 원래 이메일 설정의 확인 안내부터 다시 열어요', async () => {
    saveSecurityReturn(owner.id, 'setup-password');
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE', socialProofFresh: false }));
    render(<AntApp><MemoryRouter initialEntries={['/my-page?security=retry']}><LoginSecuritySection user={owner} /></MemoryRouter></AntApp>);
    expect(await screen.findByRole('button', { name: 'Google로 본인 확인' })).toBeVisible();
    expect(screen.queryByLabelText('로그인 이메일')).toBeNull();
    expect(fixture.message.success).not.toHaveBeenCalled();
});

it.each(['ADMIN', 'BUSINESS', 'USER'])('설정용 소셜 본인 확인은 로그인 알림 대신 확인 완료를 한 번 표시해요: %s', async role => {
    const member = { ...owner, role };
    useAuthStore.setState({ user: member });
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'GOOGLE', socialProofFresh: true }));
    const page = render(<AntApp><MemoryRouter initialEntries={['/my-page?tab=name&security=verified#profile']}>
        <LoginSecuritySection user={member} /></MemoryRouter></AntApp>);
    await waitFor(() => expect(fixture.message.success).toHaveBeenCalledExactlyOnceWith('본인 확인을 완료했어요.'));
    expect(fixture.navigate).toHaveBeenCalledWith({ pathname: '/my-page', search: '?tab=name', hash: '#profile' }, { replace: true });
    page.rerender(<AntApp><MemoryRouter initialEntries={['/my-page?tab=name&security=verified#profile']}>
        <LoginSecuritySection user={member} /></MemoryRouter></AntApp>);
    expect(fixture.message.success).toHaveBeenCalledTimes(1);
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
});

it.each(['ADMIN', 'BUSINESS', 'USER'])('표시 쿼리만 있거나 본인 확인이 오래됐으면 완료로 안내하지 않아요: %s', async role => {
    const member = { ...owner, role };
    useAuthStore.setState({ user: member });
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'GOOGLE', socialProofFresh: false }));
    render(<AntApp><MemoryRouter initialEntries={['/my-page?security=verified']}><LoginSecuritySection user={member} /></MemoryRouter></AntApp>);
    await screen.findByRole('button', { name: 'Google 로그인 연결 해제' });
    expect(fixture.message.success).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
});

it('본인 확인 결과 표시 없이 일반 설정을 열면 로그인·확인 알림을 추가하지 않아요', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'GOOGLE', socialProofFresh: true }));
    render(view(owner));
    await screen.findByRole('button', { name: 'Google 로그인 연결 해제' });
    expect(fixture.message.success).not.toHaveBeenCalled();
});

it('places passkey settings below social methods with the same icon control and text size', async () => {
    render(view(owner));
    const passkey = await screen.findByRole('button', { name: '패스키·인증 앱 등록' });
    const security = screen.getByRole('region', { name: '로그인 및 보안' });
    const passkeyRow = within(security).getByRole('group', { name: '패스키 및 인증 앱' });
    expect(passkey.className).toBe(screen.getByRole('button', { name: '비밀번호 변경' }).className);
    expect(passkeyRow.parentElement.style.display).toBe('grid');
    expect(screen.getByText('소셜 로그인').compareDocumentPosition(passkeyRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(passkeyRow).queryByRole('heading')).toBeNull();
    expect(screen.queryByLabelText('현재 비밀번호')).toBeNull();
});

it('keeps withdrawal available inside the security card when the method lookup fails', async () => {
    fixture.api.getLoginMethods.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 503 }));
    render(<AntApp><MemoryRouter><LoginSecuritySection user={owner}><button>탈퇴하기</button></LoginSecuritySection></MemoryRouter></AntApp>);
    await screen.findByText('로그인 방법을 불러오지 못했어요.');
    expect(within(screen.getByRole('region', { name: '로그인 및 보안' })).getByRole('button', { name: '탈퇴하기' })).toBeEnabled();
});

it('closes password editing from its close button without submitting credentials', async () => {
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '비밀번호 변경' }));
    const form = screen.getByRole('form', { name: '비밀번호 변경' });
    const panel = form.closest('.reserve-login-security-panel');
    expect(panel.querySelector('.reserve-login-security-surface')).toContainElement(form);
    expect(panel.style.animation).toContain('reserve-feed-replies-enter');
    expect(panel.style.gridTemplateRows).toBe('1fr');
    expect(panel.firstElementChild.style.minHeight).toMatch(/^0(?:px)?$/);
    expect(panel.firstElementChild.style.overflow).toBe('hidden');
    fireEvent.change(within(form).getByPlaceholderText('현재 비밀번호'), { target: { value: 'Original123!' } });
    fireEvent.click(within(form).getByRole('button', { name: '닫기', exact: true }));
    expect(form).toBeInTheDocument();
    expect(panel).not.toHaveAttribute('aria-hidden');
    expect(panel.style.animation).toContain('reserve-feed-replies-exit');
    expect(panel).toHaveAttribute('inert');
    expect(form).toBeInTheDocument();
    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
    expect(fixture.api.changePassword).not.toHaveBeenCalled();
    expect(fixture.logout).not.toHaveBeenCalled();
    expect(fixture.message.info).not.toHaveBeenCalled();
});

it('opens password editing directly below email and toggles it from the same pencil', async () => {
    render(view(owner));
    const pencil = await screen.findByRole('button', { name: '비밀번호 변경' });
    expect(pencil).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(pencil);
    const form = screen.getByRole('form', { name: '비밀번호 변경' });
    const panel = form.closest('.reserve-login-security-panel');
    expect(panel.id).toBe(pencil.getAttribute('aria-controls'));
    expect(panel.previousElementSibling).toContainElement(pencil);
    expect(panel.style.gridColumn).toBe('1 / -1');
    expect(panel.compareDocumentPosition(screen.getByText('소셜 로그인')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const input = within(form).getByPlaceholderText('현재 비밀번호');
    fireEvent.change(input, { target: { value: 'Original123!' } });
    input.focus();
    fireEvent.click(pencil);
    expect(pencil).toHaveFocus();
    expect(pencil).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('inert');
    expect(panel).not.toHaveAttribute('aria-hidden');
    await waitFor(() => expect(form).not.toBeInTheDocument());
    fireEvent.click(pencil);
    expect(screen.getByPlaceholderText('현재 비밀번호')).toHaveValue('');
    expect(fixture.api.changePassword).not.toHaveBeenCalled();
});

it('places the password shortcut under email and allows closing it from its pencil', async () => {
    render(<AntApp><MemoryRouter><LoginSecuritySection user={owner} initialPasswordOpen /></MemoryRouter></AntApp>);
    const form = await screen.findByRole('form', { name: '비밀번호 변경' });
    const pencil = screen.getByRole('button', { name: '비밀번호 변경' });
    const panel = form.closest('.reserve-login-security-panel');
    expect(panel.previousElementSibling).toContainElement(pencil);
    expect(pencil).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(pencil);
    expect(panel).toHaveAttribute('inert');
    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(fixture.api.changePassword).not.toHaveBeenCalled();
});

it('honors reduced motion while toggling email proof from the same plus', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE' }));
    const original = window.matchMedia;
    const media = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: query === '(prefers-reduced-motion: reduce)' }));
    try {
        render(view(owner));
        const plus = await screen.findByRole('button', { name: '이메일 로그인 설정' });
        fireEvent.click(plus);
        const panel = screen.getByRole('button', { name: 'Google로 본인 확인' }).closest('.reserve-login-security-proof');
        expect(panel.style.animation).toBe('none');
        fireEvent.click(plus);
        expect(panel.style.animation).toBe('none');
        expect(plus).toHaveFocus();
        await waitFor(() => expect(panel).not.toBeInTheDocument());
        expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
    } finally { media.mockRestore(); }
});

it.each([['NAVER', '네이버'], ['GOOGLE', 'Google'], ['KAKAO', '카카오']])('toggles social unlink directly under its own row: %s', async (provider, label) => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: provider, socialProofFresh: true }));
    render(view(owner));
    const unlink = await screen.findByRole('button', { name: `${label} 로그인 연결 해제` });
    fireEvent.click(unlink);
    const form = screen.getByLabelText('현재 비밀번호').closest('form');
    const panel = form.closest('.reserve-login-security-panel');
    expect(panel.previousElementSibling).toBe(unlink.closest('div'));
    expect(panel.id).toBe(unlink.getAttribute('aria-controls'));
    expect(panel.compareDocumentPosition(screen.getByRole('group', { name: '패스키 및 인증 앱' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    screen.getByLabelText('현재 비밀번호').focus();
    fireEvent.click(unlink);
    expect(unlink).toHaveFocus();
    expect(unlink).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('inert');
    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(fixture.api.unlinkSocialLogin).not.toHaveBeenCalled();
});

it.each([['NAVER', '네이버'], ['GOOGLE', 'Google'], ['KAKAO', '카카오']])('toggles social connection directly under its own row: %s', async (provider, label) => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ linkableSocialProvider: provider }));
    render(view(owner));
    const connect = await screen.findByRole('button', { name: `${label} 연결` });
    fireEvent.click(connect);
    const form = screen.getByLabelText('현재 비밀번호').closest('form');
    const panel = form.closest('.reserve-login-security-panel');
    expect(panel.previousElementSibling).toBe(connect.closest('div'));
    expect(panel.id).toBe(connect.getAttribute('aria-controls'));
    fireEvent.click(connect);
    expect(connect).toHaveFocus();
    expect(connect).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('inert');
    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
});

it('closes the previous method form when selecting another row', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'NAVER' }));
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '비밀번호 변경' }));
    fireEvent.click(screen.getByRole('button', { name: '이메일 로그인 해제' }));
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('form', { name: '비밀번호 변경', hidden: true })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '네이버로 본인 확인' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    expect(screen.getByRole('form', { name: '비밀번호 변경' })).toBeInTheDocument();
    const proof = screen.getByRole('button', { name: '네이버로 본인 확인', hidden: true }).closest('.reserve-login-security-proof');
    expect(proof).toHaveAttribute('inert');
    await waitFor(() => expect(proof).not.toBeInTheDocument());
    expect(fixture.api.removeLoginMethodPassword).not.toHaveBeenCalled();
});

it('reloads proof status after the API client normalizes an expired social-proof response', async () => {
    fixture.api.getLoginMethods.mockResolvedValueOnce(methods({ socialProvider: 'NAVER', socialProofFresh: true }))
        .mockResolvedValue(methods({ socialProvider: 'NAVER', socialProofFresh: false }));
    fixture.api.removeLoginMethodPassword.mockRejectedValueOnce(Object.assign(new Error('본인 확인을 다시 진행해주세요.'), { status: 428 }));
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '이메일 로그인 해제' }));
    await act(async () => fixture.confirm.mock.calls.at(-1)[0].onOk());
    await waitFor(() => expect(fixture.api.getLoginMethods).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: '이메일 로그인 해제' })).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('button', { name: '네이버로 본인 확인' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이메일 로그인 해제' }));
    expect(await screen.findByRole('button', { name: '네이버로 본인 확인' })).toBeEnabled();
    expect(fixture.api.removeLoginMethodPassword).toHaveBeenCalledOnce();
    expect(fixture.logout).not.toHaveBeenCalled();
});

it('shows the existing account methods and prevents removal of the only login method', async () => {
    render(view(owner));
    const connect = await screen.findByRole('button', { name: '네이버 연결' });
    expect(connect).toBeEnabled();
    expect(connect).toHaveClass('reserve-social-login');
    expect(connect).toHaveAttribute('type', 'button');
    expect(connect.querySelector('svg')).not.toBeNull();
    expect(connect.textContent).toBe('');
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '이메일 로그인 해제' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '로그인 및 보안' })).toHaveTextContent('이용 내역은 유지돼요');
});

it('requires fresh social proof before enabling email login and never offers to remove the only social method', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'NAVER' }));
    render(view(owner));
    const setup = await screen.findByRole('button', { name: '이메일 로그인 설정' });
    const glyph = setup.querySelector('.reserve-login-setup-icon');
    const svg = glyph.querySelector('svg');
    expect(setup).toHaveAttribute('aria-expanded', 'false');
    expect(setup).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByRole('button', { name: '네이버로 본인 확인' })).not.toBeInTheDocument();
    fireEvent.click(setup);
    expect(screen.getByRole('button', { name: '이메일 로그인 설정' })).toBe(setup);
    expect(setup.querySelector('svg')).toBe(svg);
    expect(glyph).toHaveClass('is-open');
    expect(setup).toHaveAttribute('aria-expanded', 'true');
    expect(setup).not.toHaveAttribute('aria-haspopup');
    expect(fixture.message.info).not.toHaveBeenCalled();
    const unlink = screen.getByRole('button', { name: '네이버 로그인 연결 해제' });
    expect(unlink).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(unlink);
    expect(fixture.message.info).toHaveBeenLastCalledWith('먼저 이메일 로그인을 설정해주세요. 로그인 방법은 최소 하나를 유지해야 해요.');
    expect(fixture.api.setLoginMethodPassword).not.toHaveBeenCalled();
    expect(fixture.api.unlinkSocialLogin).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '네이버로 본인 확인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '네이버로 본인 확인' })).toHaveClass('reserve-social-login');
    const proof = screen.getByRole('button', { name: '네이버로 본인 확인' }).closest('.reserve-login-security-proof');
    expect(proof.id).toBe(setup.getAttribute('aria-controls'));
    expect(proof.style.animation).toContain('reserve-feed-replies-enter');
    fireEvent.click(setup);
    expect(setup.querySelector('svg')).toBe(svg);
    expect(glyph).not.toHaveClass('is-open');
    expect(setup).toHaveAttribute('aria-expanded', 'false');
    expect(proof).not.toHaveAttribute('aria-hidden');
    expect(proof.style.animation).toContain('reserve-feed-replies-exit');
    expect(proof).toHaveAttribute('inert');
    expect(proof).toBeInTheDocument();
    await waitFor(() => expect(proof).not.toBeInTheDocument());
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
});

it('binds a link request to the initiating member and locks duplicate submissions', async () => {
    const request = defer();
    fixture.api.beginLoginMethodOAuth.mockReturnValue(request.promise);
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '네이버 연결' }));
    const input = screen.getByLabelText('현재 비밀번호');
    fireEvent.change(input, { target: { value: 'Original123!' } });
    fireEvent.submit(input.closest('form'));
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(fixture.api.beginLoginMethodOAuth).toHaveBeenCalledTimes(1));
    expect(fixture.api.beginLoginMethodOAuth).toHaveBeenCalledWith(7, { provider: 'NAVER', currentPassword: 'Original123!', reauthenticate: false });
    expect(screen.getByRole('button', { name: '네이버 연결' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '네이버 연결' }));
    expect(input.closest('form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '네이버 연결' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: '카카오 연결' })).not.toBeInTheDocument();
    await act(async () => { request.reject(new Error('본인 확인 실패')); await request.promise.catch(() => {}); });
    expect(fixture.logout).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
});

it.each([
    `https://other.example/oauth2/authorization/google?account_link=${'a'.repeat(43)}`,
    `/oauth2/authorization/naver?account_link=${'a'.repeat(43)}`,
    '/oauth2/authorization/google?account_link=invalid',
    `/oauth2/authorization/google?account_link=${'a'.repeat(43)}&next=https://other.example`,
])('rejects an unexpected account authorization destination: %s', async authorizationUrl => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE' }));
    fixture.api.beginLoginMethodOAuth.mockResolvedValue({ authorizationUrl });
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '이메일 로그인 설정' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Google로 본인 확인' }));
    await waitFor(() => expect(fixture.message.error).toHaveBeenCalledWith('로그인 요청을 확인하지 못했어요.'));
    expect(fixture.api.beginLoginMethodOAuth).toHaveBeenCalledWith(7, { provider: 'GOOGLE', currentPassword: undefined, reauthenticate: true });
    expect(screen.getByRole('button', { name: 'Google로 본인 확인' })).toBeEnabled();
    expect(fixture.logout).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
});

it('invalidates the displayed email challenge when the user edits the email', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'NAVER', socialProofFresh: true }));
    fixture.api.sendLoginMethodCode.mockResolvedValue({ challengeId: 'test-challenge', expiresAt: new Date(Date.now() + 300000).toISOString() });
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '이메일 로그인 설정' }));
    expect(screen.queryByRole('button', { name: '네이버로 본인 확인' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '인증 코드 다시 받기' })).toBeInTheDocument());
    expect(screen.getByLabelText('인증 코드')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('로그인 이메일'), { target: { value: 'another@example.test' } });
    const code = screen.getByLabelText('인증 코드');
    expect(code).toBeDisabled();
    expect(code.closest('.reserve-login-security-code')).toHaveAttribute('inert');
    const submit = screen.getAllByRole('button', { name: '이메일 로그인 설정' }).at(-1);
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(submit);
    expect(fixture.message.info).toHaveBeenLastCalledWith('먼저 이메일 인증 코드를 받아주세요.');
    expect(fixture.api.setLoginMethodPassword).not.toHaveBeenCalled();
    await waitFor(() => expect(code).not.toBeInTheDocument());
});

it('opens email setup after fresh proof returns and closes it from the same plus control', async () => {
    fixture.api.getLoginMethods.mockResolvedValueOnce(methods({ passwordEnabled: false, socialProvider: 'GOOGLE' }))
        .mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE', socialProofFresh: true }));
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '이메일 로그인 설정' }));
    expect(screen.getByRole('button', { name: 'Google로 본인 확인' })).toBeEnabled();
    const returned = new Event('pageshow');
    Object.defineProperty(returned, 'persisted', { value: true });
    fireEvent(window, returned);
    await waitFor(() => expect(screen.getByRole('button', { name: '이메일 로그인 설정' })).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('form', { name: '이메일 로그인 설정' })).not.toBeInTheDocument();
    const setup = screen.getByRole('button', { name: '이메일 로그인 설정' });
    const glyph = setup.querySelector('.reserve-login-setup-icon');
    const svg = glyph.querySelector('svg');
    fireEvent.click(setup);
    const form = screen.getByRole('form', { name: '이메일 로그인 설정' });
    const panel = form.closest('.reserve-login-security-panel');
    expect(panel.previousElementSibling).toContainElement(setup);
    expect(glyph).toHaveClass('is-open');
    expect(setup.querySelector('svg')).toBe(svg);
    fireEvent.click(setup);
    expect(setup.querySelector('svg')).toBe(svg);
    expect(glyph).not.toHaveClass('is-open');
    expect(panel).toHaveAttribute('inert');
    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(fixture.api.setLoginMethodPassword).not.toHaveBeenCalled();
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
});

it('does not carry an expanded proof prompt into another account', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ passwordEnabled: false, socialProvider: 'GOOGLE' }));
    const page = render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '이메일 로그인 설정' }));
    expect(screen.getByRole('button', { name: 'Google로 본인 확인' })).toBeEnabled();
    const next = { id: 8, email: 'next@naver.com', role: 'USER' };
    fixture.api.getLoginMethods.mockResolvedValue(methods({ memberId: 8, email: next.email, passwordEnabled: false, socialProvider: 'NAVER' }));
    act(() => useAuthStore.setState({ user: next, sessionRevision: 71 }));
    page.rerender(view(next));
    await screen.findByRole('button', { name: '네이버 로그인 연결 해제' });
    expect(screen.queryByRole('button', { name: 'Google로 본인 확인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '네이버로 본인 확인' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이메일 로그인 설정' })).toHaveAttribute('aria-expanded', 'false');
});

it('hides other providers on a linked social account without opening a proof form or sending an OAuth request', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'NAVER', socialProofFresh: true }));
    render(view(owner));
    await screen.findByRole('button', { name: '네이버 로그인 연결 해제' });
    expect(screen.queryByRole('button', { name: '카카오 연결' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google 연결' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument();
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
});

it.each([['NAVER', '네이버'], ['GOOGLE', 'Google'], ['KAKAO', '카카오']])('shows only the provider allowed by the server: %s', async (provider, label) => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ linkableSocialProvider: provider }));
    render(view(owner));
    await screen.findByRole('button', { name: `${label} 연결` });
    expect(screen.getAllByRole('button', { name: / 연결$/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: `${label} 연결` }));
    expect(screen.getByRole('button', { name: `${label} 계정으로 연결하기` })).toBeInTheDocument();
});

it('keeps email login available and hides all social connections for an unsupported email domain', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ email: 'owner@example.test', linkableSocialProvider: null }));
    render(view(owner));
    expect(await screen.findByRole('button', { name: '비밀번호 변경' })).toBeEnabled();
    expect(screen.queryAllByRole('button', { name: / 연결$/ })).toHaveLength(0);
    expect(screen.getByText('이 이메일은 소셜 로그인 연결을 지원하지 않아요. 이메일 로그인은 계속 사용할 수 있어요.')).toBeInTheDocument();
});

it('does not log out or navigate a newly selected account when an old unlink response finishes', async () => {
    fixture.api.getLoginMethods.mockResolvedValue(methods({ socialProvider: 'NAVER', socialProofFresh: true }));
    const request = defer();
    fixture.api.unlinkSocialLogin.mockReturnValue(request.promise);
    const page = render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '네이버 로그인 연결 해제' }));
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'Original123!' } });
    fireEvent.click(screen.getByRole('button', { name: '연결 해제', exact: true }));
    await waitFor(() => expect(fixture.api.unlinkSocialLogin).toHaveBeenCalledWith(7, 'Original123!'));
    const next = { id: 8, email: 'next@example.test', role: 'USER' };
    fixture.api.getLoginMethods.mockResolvedValue(methods({ memberId: 8, email: next.email }));
    act(() => useAuthStore.setState({ user: next, sessionRevision: 71 }));
    page.rerender(view(next));
    await screen.findByText('next@example.test');
    await act(async () => { request.resolve({}); await request.promise; });
    expect(fixture.logout).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.message.success).not.toHaveBeenCalled();
});

it('ignores an old status response after the displayed account changes', async () => {
    const old = defer();
    fixture.api.getLoginMethods.mockReturnValueOnce(old.promise);
    const page = render(view(owner));
    const next = { id: 8, email: 'next@example.test' };
    fixture.api.getLoginMethods.mockResolvedValue(methods({ memberId: 8, email: next.email }));
    act(() => useAuthStore.setState({ user: next, sessionRevision: 71 }));
    page.rerender(view(next));
    await screen.findByText(next.email);
    await act(async () => { old.resolve(methods()); await old.promise; });
    expect(screen.queryByText(owner.email)).not.toBeInTheDocument();
    expect(screen.getByText(next.email)).toBeInTheDocument();
});
