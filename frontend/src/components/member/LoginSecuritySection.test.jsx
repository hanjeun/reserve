import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LoginSecuritySection from './LoginSecuritySection';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({
    api: { getLoginMethods: vi.fn(), beginLoginMethodOAuth: vi.fn(), sendLoginMethodCode: vi.fn(),
        setLoginMethodPassword: vi.fn(), removeLoginMethodPassword: vi.fn(), unlinkSocialLogin: vi.fn(), changePassword: vi.fn() },
    message: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, confirm: vi.fn(), navigate: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../services', () => ({ memberService: fixture.api }));
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
    useAuthStore.setState({ user: owner, sessionRevision: 70, isLoggedIn: true, logout: fixture.logout });
    fixture.api.getLoginMethods.mockResolvedValue(methods());
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
    expect(panel.style.animation).toContain('reserve-feed-replies-enter');
    expect(panel.style.gridTemplateRows).toBe('1fr');
    expect(panel.firstElementChild.style.minHeight).toMatch(/^0(?:px)?$/);
    expect(panel.firstElementChild.style.overflow).toBe('hidden');
    fireEvent.change(within(form).getByPlaceholderText('현재 비밀번호'), { target: { value: 'Original123!' } });
    fireEvent.click(within(form).getByRole('button', { name: '닫기', exact: true }));
    expect(screen.queryByRole('form', { name: '비밀번호 변경' })).not.toBeInTheDocument();
    expect(panel.style.animation).toContain('reserve-feed-replies-exit');
    expect(panel).toHaveAttribute('inert');
    expect(form).toBeInTheDocument();
    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(fixture.api.beginLoginMethodOAuth).not.toHaveBeenCalled();
    expect(fixture.api.changePassword).not.toHaveBeenCalled();
    expect(fixture.logout).not.toHaveBeenCalled();
    expect(fixture.message.info).not.toHaveBeenCalled();
});

it('reloads proof status after the API client normalizes an expired social-proof response', async () => {
    fixture.api.getLoginMethods.mockResolvedValueOnce(methods({ socialProvider: 'NAVER', socialProofFresh: true }))
        .mockResolvedValue(methods({ socialProvider: 'NAVER', socialProofFresh: false }));
    fixture.api.removeLoginMethodPassword.mockRejectedValueOnce(Object.assign(new Error('본인 확인을 다시 진행해주세요.'), { status: 428 }));
    render(view(owner));
    fireEvent.click(await screen.findByRole('button', { name: '이메일 로그인 해제' }));
    await act(async () => fixture.confirm.mock.calls.at(-1)[0].onOk());
    expect(await screen.findByRole('button', { name: '네이버로 본인 확인' })).toBeEnabled();
    expect(fixture.api.getLoginMethods).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '이메일 로그인 해제' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: '이메일 로그인 해제' }));
    expect(fixture.message.info).toHaveBeenCalledWith('먼저 네이버로 본인 확인을 진행해주세요.');
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
    expect(setup).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(setup);
    expect(fixture.message.info).toHaveBeenLastCalledWith('먼저 네이버로 본인 확인을 진행해주세요.');
    const unlink = screen.getByRole('button', { name: '네이버 로그인 연결 해제' });
    expect(unlink).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(unlink);
    expect(fixture.message.info).toHaveBeenLastCalledWith('먼저 이메일 로그인을 설정해주세요. 로그인 방법은 최소 하나를 유지해야 해요.');
    expect(fixture.api.setLoginMethodPassword).not.toHaveBeenCalled();
    expect(fixture.api.unlinkSocialLogin).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '네이버로 본인 확인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '네이버로 본인 확인' })).toHaveClass('reserve-social-login');
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
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '인증 코드 다시 받기' })).toBeInTheDocument());
    expect(screen.getByLabelText('인증 코드')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('로그인 이메일'), { target: { value: 'another@example.test' } });
    expect(screen.getByLabelText('인증 코드')).toBeDisabled();
    const submit = screen.getAllByRole('button', { name: '이메일 로그인 설정' }).at(-1);
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(submit);
    expect(fixture.message.info).toHaveBeenLastCalledWith('먼저 이메일 인증 코드를 받아주세요.');
    expect(fixture.api.setLoginMethodPassword).not.toHaveBeenCalled();
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
