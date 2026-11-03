import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import PrivateRoute from '../../components/PrivateRoute';
import * as oauth from '../../utils/oauthAuthorization';

const fixture = vi.hoisted(() => ({ state: {}, member: null, post: vi.fn(), get: vi.fn(), authenticate: vi.fn(), finish: vi.fn(), login: vi.fn(),
    message: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post, get: fixture.get } }));
vi.mock('../../utils/mfaAuthentication', () => ({ authenticateWithPasskey: fixture.authenticate, finishMfaSession: fixture.finish }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => typeof selector === 'function' ? selector(fixture.state) : fixture.state }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message }) }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../components/member/MfaFlow', () => ({ default: ({ onDone, initialView }) => <button data-method={initialView?.preferredFactor}
    data-purpose={initialView?.purpose} data-verified={initialView?.verified} data-reference={initialView?.completionState?.reference}
    data-issued={initialView?.completionState?.issued} onClick={() => onDone(fixture.member)}>추가 인증 완료</button> }));

const DestinationPath = () => { const location = useLocation(); return <span aria-label="도착 주소" data-state={JSON.stringify(location.state)}>{location.pathname + location.search}</span>; };
const show = path => render(<MemoryRouter initialEntries={[path]}><AntApp><DestinationPath /><Routes>
    <Route path="/login" element={<Login />} /><Route element={<PrivateRoute />}>
        <Route path="/my-page" element={<span>보안 설정</span>} /></Route>
    <Route path="/" element={<span>홈 화면</span>} />
</Routes></AntApp></MemoryRouter>);
const submitPassword = () => {
    fireEvent.change(screen.getByPlaceholderText('이메일 주소'), { target: { value: 'fixture@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호'), { target: { value: 'fixture-password' } });
    fireEvent.submit(screen.getByRole('button', { name: '로그인', exact: true }).closest('form'));
};
const enableRememberMe = async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: '로그인 유지' }));
    expect(screen.getByRole('checkbox', { name: '로그인 유지' })).not.toBeChecked();
    fireEvent.click(await screen.findByRole('button', { name: '로그인 유지하기' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '로그인 유지' })).toBeChecked());
};
const restorePage = persisted => {
    const event = new Event('pageshow');
    Object.defineProperty(event, 'persisted', { value: persisted });
    fireEvent(window, event);
};
afterEach(() => vi.restoreAllMocks());

describe('로그인과 기본 인증 인계', () => {
    beforeEach(() => {
        vi.resetAllMocks(); sessionStorage.clear(); fixture.state = { isLoggedIn: false, login: fixture.login };
        fixture.member = { id: 7, name: '합성 회원', role: 'USER', termsAgreed: true };
        fixture.login.mockImplementation(user => { fixture.state = { ...fixture.state, isLoggedIn: true, isLoggingOut: false, user }; });
        fixture.get.mockResolvedValue({ idleSeconds: 1209600, absoluteSeconds: 2592000 });
        fixture.authenticate.mockResolvedValue({ verified: true });
        fixture.finish.mockResolvedValue({ id: 7, name: '합성 회원' });
    });
    it.each([['kakao', '카카오'], ['naver', '네이버'], ['google', 'Google']])('취소 후 복원된 %s 로그인은 입력을 유지하고 다시 시작할 수 있어요', async (provider, label) => {
        const authorization = vi.spyOn(oauth, 'oauthAuthorizationUrl');
        fixture.post.mockResolvedValue({ mfaRequired: true, enrollmentRequired: true });
        show('/login');
        fireEvent.change(screen.getByPlaceholderText('이메일 주소'), { target: { value: 'fixture@example.test' } });
        fireEvent.click(screen.getByRole('button', { name: `${label}로 로그인` }));
        const submit = screen.getByRole('button', { name: '로그인', exact: true });
        expect(submit).toBeDisabled();
        expect(authorization).toHaveBeenCalledWith(provider, undefined, false);
        expect(fixture.get).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
        restorePage(false);
        expect(submit).toBeDisabled();
        restorePage(true);
        expect(submit).toBeEnabled();
        expect(screen.getByPlaceholderText('이메일 주소')).toHaveValue('fixture@example.test');
        submitPassword();
        await screen.findByRole('button', { name: '추가 인증 완료' });
        expect(fixture.post).toHaveBeenCalledTimes(1);
    });
    it('외부 이동 시작 실패도 로그인 로딩과 실행 잠금을 해제해요', () => {
        vi.spyOn(oauth, 'oauthAuthorizationUrl').mockImplementationOnce(() => { throw new Error('이동 요청을 확인하지 못했어요.'); });
        show('/login');
        fireEvent.click(screen.getByRole('button', { name: '카카오로 로그인' }));
        expect(screen.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
        expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith('이동 요청을 확인하지 못했어요.');
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('외부 이동이 아닌 진행 중 비밀번호 요청은 페이지 표시 이벤트로 초기화하지 않아요', async () => {
        let finish;
        fixture.post.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        show('/login'); submitPassword();
        await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(1));
        restorePage(true);
        expect(screen.getByRole('button', { name: '로그인', exact: true })).toBeDisabled();
        await act(async () => { finish({ mfaRequired: true, enrollmentRequired: true }); });
        await screen.findByRole('button', { name: '추가 인증 완료' });
        expect(fixture.post).toHaveBeenCalledTimes(1);
    });
    it('페이지 제목은 아이콘과 접근성 이름만 남기고 로그인 동의 문구를 표시하지 않아요', () => {
        show('/login');
        const title = screen.getByRole('heading', { name: '로그인' });
        expect(title.textContent.trim()).toBe('');
        expect(screen.getByText('예약이 필요한 순간, RESERVE')).toBeInTheDocument();
        expect(screen.queryByText(/로그인 시/)).toBeNull();
        expect(screen.getByRole('button', { name: '로그인', exact: true })).toBeInTheDocument();
    });
    it.each([false, true])('확인한 로그인 유지 선택을 비밀번호 요청에 전달해요 (%s)', async rememberMe => {
        fixture.post.mockResolvedValue({ mfaRequired: true, enrollmentRequired: true });
        show('/login');
        expect(screen.getByRole('checkbox', { name: '로그인 유지' })).not.toBeChecked();
        if (rememberMe) await enableRememberMe();
        submitPassword();
        await screen.findByRole('button', { name: '추가 인증 완료' });
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/login', { email: 'fixture@example.test', password: 'fixture-password', rememberMe }, { withCredentials: true });
        expect(fixture.login).not.toHaveBeenCalled();
        expect(screen.queryByRole('heading', { name: '로그인' })).toBeNull();
    });
    it('로그인 유지 안내는 서버 만료 기간을 표시하고 취소하면 선택하지 않아요', async () => {
        show('/login');
        fireEvent.click(screen.getByRole('checkbox', { name: '로그인 유지' }));
        expect(await screen.findByText(/14일 동안 사용하지 않거나 로그인한 지 30일/)).toBeInTheDocument();
        expect(screen.getByText(/공용 PC에서는 사용 후 꼭 로그아웃해주세요/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '취소', exact: true }));
        expect(screen.getByRole('checkbox', { name: '로그인 유지' })).not.toBeChecked();
    });
    it('로그인 유지 안내 조회 실패를 표시하고 재시도해도 인증이나 유지 선택을 실행하지 않아요', async () => {
        fixture.get.mockRejectedValueOnce({ status: 503 });
        show('/login');
        fireEvent.click(screen.getByRole('checkbox', { name: '로그인 유지' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('로그인 유지 안내를 불러오지 못했어요.');
        expect(screen.getByRole('alert')).toHaveTextContent('서버에서 요청을 처리하지 못했어요.');
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByText(/14일 동안 사용하지 않거나 로그인한 지 30일/)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: '로그인 유지' })).not.toBeChecked();
        expect(fixture.get).toHaveBeenCalledTimes(2);
        expect(fixture.post).not.toHaveBeenCalled();
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('패스키 버튼은 이메일 폼 없이 브라우저 인증을 한 번 요청하고 바로 로그인해요', async () => {
        fixture.post.mockResolvedValue({ purpose: 'PASSKEY_LOGIN' });
        show('/login');
        await enableRememberMe();
        const login = screen.getByRole('button', { name: '로그인', exact: true });
        const passkey = screen.getByRole('button', { name: '패스키로 로그인', exact: true });
        expect(login.parentElement).toBe(passkey.parentElement);
        expect(passkey).toHaveAttribute('type', 'button');
        fireEvent.click(passkey);
        expect(await screen.findByText('홈 화면')).toBeInTheDocument();
        expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/api/auth/mfa/passkey/login', { rememberMe: true }, { skipAuthRefresh: true });
        expect(fixture.authenticate).toHaveBeenCalledExactlyOnceWith(false, expect.any(AbortSignal), expect.any(Object));
        expect(fixture.finish).toHaveBeenCalledTimes(1);
        expect(fixture.login).toHaveBeenCalledExactlyOnceWith({ id: 7, name: '합성 회원' });
        expect(fixture.message.success).toHaveBeenCalledExactlyOnceWith('합성 회원님, 로그인됐어요!');
    });
    it('직접 패스키 로그인도 발급 뒤 조회 실패를 완료 상태와 함께 인증 화면으로 넘겨요', async () => {
        const reference = 'e'.repeat(64);
        fixture.post.mockResolvedValue({ purpose: 'PASSKEY_LOGIN', completionId: reference });
        fixture.authenticate.mockResolvedValue({ mfaRequired: true, verified: true, purpose: 'PASSKEY_LOGIN', completionId: reference });
        fixture.finish.mockImplementation(async (_signal, _defer, state) => { state.issued = true; throw new Error('회원 조회를 다시 시도해주세요.'); });
        show('/login');
        fireEvent.click(screen.getByRole('button', { name: '패스키로 로그인', exact: true }));
        const resume = await screen.findByRole('button', { name: '추가 인증 완료' });
        expect(resume).toHaveAttribute('data-verified', 'true');
        expect(resume).toHaveAttribute('data-reference', reference);
        expect(resume).toHaveAttribute('data-issued', 'true');
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/cancel'))).toBe(false);
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('비밀번호 뒤 새 환경의 패스키 확인은 기억 동의를 선택할 화면을 유지해요', async () => {
        const reference = 'e'.repeat(64);
        fixture.post.mockResolvedValue({ mfaRequired: true, passkeyAvailable: true, purpose: 'RISK_LOGIN', completionId: reference });
        fixture.authenticate.mockResolvedValue({ mfaRequired: true, verified: true, purpose: 'RISK_LOGIN', completionId: reference });
        show('/login'); submitPassword();
        const resume = await screen.findByRole('button', { name: '추가 인증 완료' });
        expect(resume).toHaveAttribute('data-purpose', 'RISK_LOGIN');
        expect(resume).toHaveAttribute('data-verified', 'true');
        expect(resume).toHaveAttribute('data-reference', reference);
        expect(fixture.finish).not.toHaveBeenCalled();
    });
    it('패스키 선택을 취소하면 임시 인증을 폐기하고 로그인 화면을 유지해요', async () => {
        fixture.post.mockResolvedValue({ purpose: 'PASSKEY_LOGIN' });
        fixture.authenticate.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));
        show('/login');
        fireEvent.click(screen.getByRole('button', { name: '패스키로 로그인', exact: true }));
        await waitFor(() => expect(fixture.message.info).toHaveBeenCalledTimes(1));
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/cancel', undefined, { skipAuthRefresh: true });
        expect(fixture.finish).not.toHaveBeenCalled(); expect(fixture.login).not.toHaveBeenCalled();
        expect(fixture.message.success).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('이메일 주소')).toBeEnabled();
    });
    it('비밀번호 이후에도 패스키를 바로 요청하고 취소하면 인증 앱으로 인계해요', async () => {
        fixture.post.mockResolvedValue({ mfaRequired: true, passkeyAvailable: true, totpAvailable: true });
        fixture.authenticate.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));
        show('/login'); submitPassword();
        const alternative = await screen.findByRole('button', { name: '추가 인증 완료' });
        expect(alternative).toHaveAttribute('data-method', 'TOTP');
        expect(fixture.authenticate).toHaveBeenCalledTimes(1); expect(fixture.finish).not.toHaveBeenCalled();
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('페이지를 떠난 뒤 도착한 응답은 브라우저 인증을 열지 않아요', async () => {
        let resolve;
        fixture.post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const page = show('/login');
        fireEvent.click(screen.getByRole('button', { name: '패스키로 로그인', exact: true }));
        page.unmount();
        await act(async () => resolve({ purpose: 'PASSKEY_LOGIN' }));
        expect(fixture.authenticate).not.toHaveBeenCalled(); expect(fixture.login).not.toHaveBeenCalled();
    });
    it('처리 중인 로그인에 다른 인증 요청을 겹치지 않아요', async () => {
        let resolve;
        fixture.post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        show('/login'); submitPassword();
        await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(1));
        submitPassword();
        fireEvent.click(screen.getByRole('button', { name: '패스키로 로그인', exact: true }));
        expect(screen.getByRole('button', { name: 'Google로 로그인' })).toBeDisabled();
        expect(fixture.post).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ mfaRequired: true, enrollmentRequired: true }));
    });
    it('등록 아이콘은 로그인 후 일반 계정의 보안 설정으로 이어져요', async () => {
        fixture.state.isLoggingOut = true;
        show('/login'); fireEvent.click(screen.getByRole('button', { name: '패스키 등록' }));
        await waitFor(() => expect(fixture.message.info).toHaveBeenCalledExactlyOnceWith('패스키를 등록하려면 먼저 로그인해주세요.'));
        expect(screen.queryByText('패스키를 등록하려면 먼저 로그인해주세요.')).toBeNull();
        expect(screen.queryByText('홈 화면')).toBeNull(); expect(fixture.post).not.toHaveBeenCalled();
        fixture.post.mockResolvedValue({ id: 7, role: 'USER', name: '합성 회원', termsAgreed: true });
        submitPassword();
        expect(await screen.findByText('보안 설정')).toBeInTheDocument();
        expect(screen.queryByText('홈 화면')).toBeNull(); expect(fixture.authenticate).not.toHaveBeenCalled();
    });
    it('등록 의도는 로그인 경계에서 다시 마운트돼도 홈으로 바뀌지 않아요', async () => {
        fixture.state.isLoggedIn = true; fixture.state.user = { role: 'USER', termsAgreed: true };
        show('/login?enroll=passkey');
        expect(await screen.findByText('보안 설정')).toBeInTheDocument();
        expect(screen.queryByText('홈 화면')).toBeNull(); expect(fixture.post).not.toHaveBeenCalled();
    });
    it('이전 등록 URL의 안내를 한 번 소비하고 새로고침 뒤에도 등록 목적지는 유지해요', async () => {
        const page = show('/login?enroll=passkey&source=fixture');
        await waitFor(() => expect(fixture.message.info).toHaveBeenCalledExactlyOnceWith('패스키를 등록하려면 먼저 로그인해주세요.'));
        const destination = screen.getByLabelText('도착 주소');
        expect(destination).toHaveTextContent('/login?source=fixture');
        const state = JSON.parse(destination.getAttribute('data-state'));
        expect(state.from).toEqual({ pathname: '/my-page', search: '?tab=name', hash: '#account-security' });
        page.unmount(); fixture.message.info.mockClear();
        show({ pathname: '/login', search: '?source=fixture', state });
        expect(fixture.message.info).not.toHaveBeenCalled();
        expect(screen.queryByText('패스키를 등록하려면 먼저 로그인해주세요.')).toBeNull();
        fixture.post.mockResolvedValue({ id: 7, role: 'USER', name: '합성 회원', termsAgreed: true });
        submitPassword();
        expect(await screen.findByText('보안 설정')).toBeInTheDocument();
    });
    it.each([
        { path: '/login?mfa=1', destination: '홈 화면', name: '합성 회원' },
        { path: '/login?mfa=1&security=1', destination: '보안 설정', name: '합성 회원' },
        { path: '/login?mfa=1', destination: '홈 화면', name: null },
    ])('추가 인증은 실제 로그인과 설정 확인의 안내를 구분해 이동해요 ($path, $name)', async ({ path, destination, name }) => {
        fixture.member = { ...fixture.member, name };
        show(path);
        expect(fixture.message.success).not.toHaveBeenCalled();
        fixture.state = { ...fixture.state, isLoggedIn: true, user: fixture.member };
        fireEvent.click(screen.getByRole('button', { name: '추가 인증 완료' }));
        expect(await screen.findByText(destination)).toBeInTheDocument();
        if (path.includes('security=1')) {
            expect(fixture.message.success).not.toHaveBeenCalled();
            expect(screen.getByLabelText('도착 주소')).toHaveTextContent('/my-page?security=verified');
        } else expect(fixture.message.success).toHaveBeenCalledExactlyOnceWith(name ? `${name}님, 로그인됐어요!` : '로그인됐어요.');
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('캐시된 로그인 상태가 OAuth 추가 인증을 건너뛰지 않아요', async () => {
        fixture.state.isLoggedIn = true;
        show('/login?mfa=1&security=1');
        expect(screen.queryByText('홈 화면')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '추가 인증 완료' }));
        expect(await screen.findByText('보안 설정')).toBeInTheDocument(); expect(fixture.login).not.toHaveBeenCalled();
    });
});
