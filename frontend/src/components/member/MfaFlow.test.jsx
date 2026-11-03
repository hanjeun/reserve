import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import MfaFlow from './MfaFlow';
import { performPasskey } from '../../utils/passkey';
import useAuthStore from '../../store/useAuthStore';
import { requestAuthenticationBack } from '../../utils/authenticationNavigation';
const fixture = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), login: vi.fn(), message: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post, get: fixture.get } }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message }) }));

vi.mock('../../utils/passkey', async importOriginal => ({ ...await importOriginal(), performPasskey: vi.fn() }));
describe('추가 인증', () => {
    it('코드 확인 뒤 마무리만 실패하면 코드를 다시 쓰지 않고 로그인을 이어가요', async () => {
        const view = { purpose: 'RISK_LOGIN', emailAvailable: true, completionId: 'a'.repeat(64) };
        let finishes = 0;
        fixture.post.mockImplementation(path => {
            if (path.endsWith('/verify')) return Promise.resolve({ ...view, verified: true });
            if (path.endsWith('/finish') && finishes++ === 0) return Promise.reject(new Error('마무리 연결이 끊겼어요.'));
            if (path.endsWith('/completion')) return Promise.reject(new Error('아직 발급되지 않았어요.'));
            return Promise.resolve(null);
        });
        fixture.get.mockResolvedValue({ id: 7 });
        const done = vi.fn();
        render(<MfaFlow page initialView={view} onDone={done} />);
        fireEvent.click(screen.getByRole('button', { name: '코드발송' }));
        await screen.findByRole('button', { name: '재발송' });
        fireEvent.change(screen.getByLabelText('이메일 인증 코드'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
        const resume = await screen.findByRole('button', { name: '로그인 계속하기' });
        await waitFor(() => expect(resume).toBeEnabled());
        fireEvent.click(resume);
        await waitFor(() => expect(done).toHaveBeenCalledWith({ id: 7 }));
        expect(fixture.post.mock.calls.filter(([path]) => path.endsWith('/verify'))).toHaveLength(1);
        expect(fixture.post.mock.calls.filter(([path]) => path.endsWith('/finish'))).toHaveLength(2);
    });
    it('확인 완료 상태를 복원하면 이메일이나 패스키를 다시 요구하지 않아요', async () => {
        const view = { purpose: 'RISK_LOGIN', verified: true, emailAvailable: true, passkeyAvailable: true, completionId: 'a'.repeat(64) };
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/status') ? view : null));
        fixture.get.mockResolvedValue({ id: 7 });
        render(<MfaFlow page />);
        const resume = await screen.findByRole('button', { name: '로그인 계속하기' });
        expect(screen.queryByLabelText('이메일 인증 코드')).toBeNull();
        expect(performPasskey).not.toHaveBeenCalled();
        fireEvent.click(resume);
        await waitFor(() => expect(fixture.login).toHaveBeenCalledWith({ id: 7 }));
    });
    it('발급 뒤 회원 조회 실패는 같은 화면에서 조회만 재시도해요', async () => {
        fixture.post.mockResolvedValue(null);
        fixture.get.mockRejectedValueOnce(new Error('조회 연결이 끊겼어요.')).mockResolvedValueOnce({ id: 7 });
        const done = vi.fn();
        render(<MfaFlow page initialView={{ purpose: 'RISK_LOGIN', verified: true, completionId: 'a'.repeat(64) }} onDone={done} />);
        fireEvent.click(screen.getByRole('button', { name: '로그인 계속하기' }));
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalled());
        const resume = screen.getByRole('button', { name: '로그인 계속하기' });
        await waitFor(() => expect(resume).toBeEnabled());
        fireEvent.click(resume);
        await waitFor(() => expect(done).toHaveBeenCalledWith({ id: 7 }));
        expect(fixture.post).toHaveBeenCalledTimes(1);
    });
    it('민감 변경의 확인은 기존 로그인 완료 API를 호출하지 않고 원래 작업에 돌려줘요', async () => {
        const verified = { purpose: 'MANAGE', verified: true, completionId: 'a'.repeat(64), totpAvailable: true };
        fixture.post.mockResolvedValue(verified);
        const verifiedAction = vi.fn();
        render(<MfaFlow initialView={{ ...verified, verified: false }} onVerified={verifiedAction} />);
        fireEvent.change(screen.getByLabelText('인증 앱 코드'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
        await waitFor(() => expect(verifiedAction).toHaveBeenCalledWith({ ...verified, rememberBrowser: false }));
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/finish'))).toBe(false);
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('브라우저 기억은 기본 미선택이고 확인 성공 뒤에만 선택을 보내요', async () => {
        const view = { purpose: 'RISK_LOGIN', verified: true, completionId: 'a'.repeat(64) };
        fixture.post.mockResolvedValue({ browser: 'UNAVAILABLE' });
        fixture.get.mockResolvedValue({ id: 7 });
        render(<MfaFlow page initialView={view} />);
        const consent = screen.getByRole('checkbox', { name: '이 브라우저를 30일 동안 기억해요.' });
        expect(consent).not.toBeChecked();
        expect(fixture.post).not.toHaveBeenCalled();
        fireEvent.click(consent);
        fireEvent.click(screen.getByRole('button', { name: '로그인 계속하기' }));
        await waitFor(() => expect(fixture.login).toHaveBeenCalled());
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/finish', { completionId: view.completionId, rememberBrowser: true }, expect.anything());
        expect(fixture.message.info).toHaveBeenCalledWith(expect.stringContaining('브라우저 기억 설정을 완료하지 못했어요'));
    });
    it('메일 전송 실패를 발송 성공으로 표시하지 않고 다시 요청할 수 있어요', async () => {
        fixture.post.mockRejectedValueOnce(new Error('인증 메일을 보내지 못했어요.'));
        render(<MfaFlow initialView={{ purpose: 'RISK_LOGIN', emailAvailable: true }} />);
        fireEvent.click(screen.getByRole('button', { name: '코드발송' }));
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledWith('인증 메일을 보내지 못했어요.'));
        expect(screen.queryByText('인증 코드를 보냈어요. 계정 이메일에서 확인해주세요.')).toBeNull();
        expect(screen.getByRole('button', { name: '코드발송' })).toBeEnabled();
    });
    it('인증 정보 조회 실패는 메시지로 알리고 아이콘으로 다시 조회할 수 있어요', async () => {
        fixture.post.mockRejectedValueOnce(new Error('인증 정보를 불러오지 못했어요.'))
            .mockResolvedValueOnce({ purpose: 'MANAGE', totpAvailable: true });
        render(<MfaFlow />);
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledWith('인증 정보를 불러오지 못했어요.'));
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '인증 정보 다시 불러오기' }));
        expect(await screen.findByLabelText('인증 앱 코드')).toBeInTheDocument();
        expect(fixture.post).toHaveBeenCalledTimes(2);
    });

    it('전달받은 인증 실패는 메시지 한 번으로 표시하고 폼에 누적하지 않아요', () => {
        const initialView = { purpose: 'LOGIN', totpAvailable: true, initialError: '다른 인증 수단으로 확인해주세요.' };
        const page = render(<MfaFlow initialView={initialView} />);
        page.rerender(<MfaFlow initialView={{ ...initialView }} />);
        expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith(initialView.initialError);
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('폐기된 인증 요청의 늦은 실패는 메시지로 다시 표시하지 않아요', async () => {
        fixture.post.mockRejectedValue(Object.assign(new Error('이전 인증 요청'), { isStaleSession: true }));
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }} settings={{ required: true, credentials: [] }} />);
        fireEvent.click(screen.getByRole('button', { name: '패스키 추가' }));
        await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(1));
        await act(async () => {});
        expect(fixture.message.error).not.toHaveBeenCalled();
        expect(fixture.message.info).not.toHaveBeenCalled();
    });

    it('새 환경의 이메일 확인은 기존 발송 필드를 쓰고 인증 수단 등록을 열지 않아요', async () => {
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/verify') ? { purpose: 'RISK_LOGIN', verified: true } : null));
        fixture.get.mockResolvedValue({ id: 7, role: 'USER' });
        const done = vi.fn();
        render(<MfaFlow page initialView={{ purpose: 'RISK_LOGIN', emailAvailable: true }} onDone={done} />);
        expect(screen.getByRole('heading', { name: '접속 환경 확인' })).toBeInTheDocument();
        expect(screen.getByText('계정 보호를 위해 접속 환경을 다시 확인해요. 본인 확인을 마치면 계속할 수 있어요.')).toBeInTheDocument();
        expect(screen.getByText('코드발송을 누르면 계정 이메일로 인증 코드를 보내요.')).toBeInTheDocument();
        expect(fixture.post).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '패스키 추가' })).toBeNull();
        expect(screen.queryByRole('button', { name: '복구코드 사용' })).toBeNull();
        expect(screen.queryByRole('button', { name: '확인', exact: true })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '코드발송' }));
        await screen.findByRole('button', { name: '재발송' });
        expect(screen.getByText('인증 코드를 보냈어요. 계정 이메일에서 확인해주세요.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('이메일 인증 코드'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
        await waitFor(() => expect(done).toHaveBeenCalledWith({ id: 7, role: 'USER' }));
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/email/send', undefined, expect.anything());
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/verify', { kind: 'EMAIL', proof: '123456' }, expect.anything());
    });

    it('이메일 발송 실패 뒤에는 발송 완료로 표시하지 않고 다시 요청할 수 있어요', async () => {
        fixture.post.mockRejectedValueOnce(new Error('인증 코드를 보내지 못했어요.'));
        render(<MfaFlow page initialView={{ purpose: 'RISK_LOGIN', emailAvailable: true }} />);
        fireEvent.click(screen.getByRole('button', { name: '코드발송' }));
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith('인증 코드를 보내지 못했어요.'));
        expect(screen.getByRole('button', { name: '코드발송' })).toBeEnabled();
        expect(screen.queryByText('인증 코드를 보냈어요. 계정 이메일에서 확인해주세요.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '확인', exact: true })).not.toBeInTheDocument();
    });

    it('사업자는 서버가 허용한 등록 유예 후 로그인하고 인증 완료로 기록하지 않아요', async () => {
        fixture.post.mockResolvedValue(null);
        fixture.get.mockResolvedValue({ id: 8, role: 'BUSINESS' });
        const done = vi.fn();
        render(<MfaFlow initialView={{ purpose: 'LOGIN', enrollmentRequired: true, canDeferEnrollment: true }} onDone={done} />);
        const skip = screen.getByRole('button', { name: '다음에 할게요' });
        expect(skip.parentElement).toHaveClass('reserve-auth-secondary-actions');
        fireEvent.click(skip);
        await waitFor(() => expect(done).toHaveBeenCalledWith({ id: 8, role: 'BUSINESS' }));
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/defer', undefined, expect.anything());
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/finish'))).toBe(false);
    });
    it('관리자의 추가 인증에는 등록 유예를 표시하지 않아요', () => {
        render(<MfaFlow initialView={{ purpose: 'LOGIN', enrollmentRequired: true, canDeferEnrollment: false }} />);
        expect(screen.queryByRole('button', { name: '다음에 할게요' })).toBeNull();
    });

    beforeEach(() => { vi.resetAllMocks(); useAuthStore.setState({ login: fixture.login, user: null, isLoggedIn: false }); });
    it('설정에서 연 추가 인증은 폼으로 내려가고 포커스를 옮겨요', async () => {
        render(<MfaFlow settings={{ credentials: [] }} initialView={{ purpose: 'MANAGE', passkeyAvailable: true }} />);
        const section = screen.getByRole('region', { name: '추가 인증' });
        await waitFor(() => expect(document.activeElement).toBe(section));
        expect(performPasskey).not.toHaveBeenCalled();
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('연필로 처음 연 패널은 화면을 내리지 않고 다음 인증 단계의 이동은 유지해요', async () => {
        render(<><button type="button">관리 연필</button><MfaFlow revealOnMount={false} settings={{ credentials: [] }}
            initialView={{ purpose: 'MANAGE', passkeyAvailable: true }} /></>);
        const trigger = screen.getByRole('button', { name: '관리 연필' });
        trigger.focus();
        const section = screen.getByRole('region', { name: '추가 인증' });
        section.scrollIntoView = vi.fn();
        await act(async () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(section.scrollIntoView).not.toHaveBeenCalled();
        expect(trigger).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: '복구코드 사용' }));
        await waitFor(() => expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }));
        expect(section).toHaveFocus();
        expect(screen.getByLabelText('복구코드')).toBeVisible();
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('패스키는 WebAuthn 등록을 사용하고 인증 앱 설정과 구분해요', async () => {
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/passkey/options') ? 'synthetic-options' : { codes: ['SYNTHETIC-CODE'] }));
        performPasskey.mockResolvedValue('synthetic-credential');
        render(<MfaFlow initialView={{ enrollmentRequired: true }} />);
        expect(screen.getByRole('heading', { name: '패스키 등록하기' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '패스키 추가' }));
        await screen.findByRole('heading', { name: '복구코드 보관' });
        expect(performPasskey).toHaveBeenCalledWith('synthetic-options', true, expect.any(AbortSignal));
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/totp/setup'))).toBe(false);
    });
    it('복구코드를 확인하기 전에는 로그인 완료를 요청하지 않아요', async () => {
        fixture.post.mockImplementation(path => {
            if (path.endsWith('/totp/setup')) return Promise.resolve({ secret: 'SYNTHETIC', uri: 'otpauth://totp/fixture?secret=SYNTHETIC' });
            if (path.endsWith('/totp/confirm')) return Promise.resolve({ codes: ['synthetic-recovery-one'] });
            return Promise.resolve(null);
        });
        fixture.get.mockResolvedValue({ id: 1, name: '합성 회원' });
        const done = vi.fn();
        render(<MfaFlow initialView={{ mfaRequired: true, enrollmentRequired: true }} onDone={done} />);
        fireEvent.click(screen.getByRole('button', { name: '인증 앱 연결' }));
        const code = await screen.findByLabelText('인증 앱 코드');
        expect(screen.getByRole('heading', { name: '인증 앱 연결' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '인증 앱 등록 키 복사' })).toBeInTheDocument();
        fireEvent.change(code, { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: '등록', exact: true }));
        await screen.findByText('synthetic-recovery-one');
        expect(screen.getByRole('region', { name: '추가 인증' })).toHaveAttribute('data-sentry-block');
        expect(fixture.post).not.toHaveBeenCalledWith('/api/auth/mfa/finish', expect.anything(), expect.anything());
        expect(fixture.login).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '보관했어요' }));
        await waitFor(() => expect(fixture.login).toHaveBeenCalledWith({ id: 1, name: '합성 회원' }));
        expect(done).toHaveBeenCalledTimes(1);
    });
    it('복구코드 본인 확인의 세션 교체 동안 개인 요청을 멈추고 관리 폼을 이어가요', async () => {
        let resolve;
        fixture.post.mockImplementation(() => new Promise(done => { resolve = done; }));
        useAuthStore.setState({ user: { id: 7 }, isLoggedIn: true, authRestoring: false });
        const done = vi.fn();
        render(<MfaFlow initialView={{ purpose: 'MANAGE', passkeyAvailable: true, preferredFactor: 'BACKUP' }}
            settings={{ required: true, credentials: [] }} onDone={done} />);
        fireEvent.change(screen.getByLabelText('복구코드'), { target: { value: 'synthetic-code' } });
        fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
        await waitFor(() => expect(useAuthStore.getState().authRestoring).toBe(true));

        await act(async () => resolve({ purpose: 'MANAGE', verified: true }));

        expect(await screen.findByRole('button', { name: '복구코드 재발급' })).toBeInTheDocument();
        expect(useAuthStore.getState().authRestoring).toBe(false);
        expect(fixture.post).toHaveBeenCalledTimes(1);
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/verify', { kind: 'BACKUP', proof: 'synthetic-code' }, expect.anything());
        expect(fixture.login).not.toHaveBeenCalled();
        expect(done).not.toHaveBeenCalled();
    });
    it('취소한 임시 인증을 서버에서 폐기한 뒤 화면을 닫아요', async () => {
        const cancel = vi.fn();
        fixture.post.mockResolvedValue(null);
        render(<MfaFlow initialView={{ mfaRequired: true, purpose: 'LOGIN' }} onCancel={cancel} />);
        expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
        act(() => expect(requestAuthenticationBack()).toBe(true));
        await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
        expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/cancel', undefined, expect.anything());
    });
    it('세션 복원 뒤 늦게 도착한 이전 상태를 표시하지 않아요', async () => {
        let oldResult;
        fixture.post.mockImplementationOnce(() => new Promise(resolve => { oldResult = resolve; }))
            .mockResolvedValueOnce({ purpose: 'LOGIN', totpAvailable: true });
        useAuthStore.setState({ sessionRevision: 1 });
        render(<MfaFlow />);
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        expect(await screen.findByLabelText('인증 앱 코드')).toBeInTheDocument();
        await act(async () => oldResult({ purpose: 'LOGIN', passkeyAvailable: true }));
        expect(screen.queryByRole('button', { name: '패스키로 확인' })).toBeNull();
        expect(performPasskey).not.toHaveBeenCalled();
    });
    it('등록 화면은 제목을 한 번만 표시하고 두 인증 수단을 한 줄에 배치해요', () => {
        render(<MfaFlow page initialView={{ enrollmentRequired: true }} />);
        expect(screen.getAllByRole('heading')).toHaveLength(1);
        expect(screen.getByRole('heading', { name: '패스키 등록하기' })).toBeInTheDocument();
        const passkey = screen.getByRole('button', { name: '패스키 추가' });
        expect(passkey.parentElement).toBe(screen.getByRole('button', { name: '인증 앱 연결' }).parentElement);
        expect(passkey.parentElement).toHaveClass('reserve-login-actions');
        expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
    });
    it('인증 앱 설정에서 뒤로 가면 방법 선택으로 돌아가고 다음 뒤로 가기에서만 폐기해요', async () => {
        fixture.post.mockResolvedValue({ secret: 'SYNTHETIC', uri: 'otpauth://totp/fixture?secret=SYNTHETIC' });
        const cancel = vi.fn();
        render(<MfaFlow initialView={{ enrollmentRequired: true }} onCancel={cancel} />);
        fireEvent.click(screen.getByRole('button', { name: '인증 앱 연결' }));
        await screen.findByLabelText('인증 앱 코드');
        act(() => requestAuthenticationBack());
        expect(screen.getByRole('button', { name: '패스키 추가' })).toBeInTheDocument();
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/cancel'))).toBe(false);
        act(() => requestAuthenticationBack());
        await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    });
    it('추가 인증 진입은 패스키 선택창을 바로 열고 취소하면 인증 앱으로 전환해요', async () => {
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/status')
            ? { purpose: 'LOGIN', passkeyAvailable: true, totpAvailable: true } : 'options'));
        performPasskey.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));
        render(<MfaFlow page />);
        expect(await screen.findByLabelText('인증 앱 코드')).toBeInTheDocument();
        expect(performPasskey).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: '패스키로 확인' })).toBeNull();
        expect(screen.getByRole('button', { name: '복구코드 사용' }).closest('.reserve-mfa-alternatives')).toBeInTheDocument();
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('인증 관리의 패스키 버튼도 브라우저 인증을 한 번만 요청해요', async () => {
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/verify')
            ? { purpose: 'MANAGE', verified: true } : 'options'));
        performPasskey.mockResolvedValue('signed-credential');
        render(<MfaFlow initialView={{ purpose: 'MANAGE', passkeyAvailable: true }} settings={{ required: true, credentials: [] }} />);
        expect(screen.queryByRole('button', { name: '패스키 추가' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '패스키로 확인' }));
        expect(await screen.findByRole('heading', { name: '인증 수단 관리' })).toBeInTheDocument();
        expect(performPasskey).toHaveBeenCalledTimes(1);
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/finish'))).toBe(false);
    });
    it.each([false, true])('인증 관리 도구는 같은 크기의 아이콘으로 표시하고 마지막 관리자 수단을 보호해요 (필수 %s)', required => {
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }}
            settings={{ required, credentials: [{ id: 'synthetic-key', kind: 'PASSKEY', name: '합성 패스키' }] }} />);
        const add = screen.getByRole('button', { name: '패스키 추가' });
        const totp = screen.getByRole('button', { name: '인증 앱 연결' });
        const recovery = screen.getByRole('button', { name: '복구코드 재발급' });
        const actions = [add, totp, recovery];
        expect(add.closest('.reserve-mfa-management-actions')).toBe(totp.closest('.reserve-mfa-management-actions'));
        expect(add.closest('.reserve-mfa-management-actions')).toBe(recovery.closest('.reserve-mfa-management-actions'));
        expect(recovery.closest('.reserve-mfa-management-actions')).toHaveClass('reserve-mfa-management-actions--secondary');
        expect(document.querySelectorAll('.reserve-mfa-management-actions')).toHaveLength(1);
        if (!required) {
            const disable = screen.getByRole('button', { name: '추가 인증 해제' });
            expect(disable.closest('.reserve-mfa-management-actions')).toBe(recovery.closest('.reserve-mfa-management-actions'));
            actions.push(disable);
        } else expect(screen.queryByRole('button', { name: '추가 인증 해제' })).toBeNull();
        for (const action of actions) {
            expect(action).toHaveClass('reserve-icon-tool');
            expect(action.closest('.reserve-mfa-management-actions')).toBeInTheDocument();
            expect(action.textContent).toBe('');
        }
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('작은 화면에서도 관리 도구와 확인 도구는 오른쪽 기준으로 줄바꿈해요', () => {
        const stylesheet = postcss.parse(readFileSync('src/styles/global/account-security.css', 'utf8'));
        const styles = selector => {
            const result = {};
            stylesheet.walkRules(selector, rule => rule.walkDecls(decl => { result[decl.prop] = decl.value; }));
            return result;
        };
        expect(styles('.reserve-mfa-management-actions')).toMatchObject({ display: 'flex', 'align-items': 'center',
            'justify-content': 'flex-end', 'flex-wrap': 'wrap', gap: '8px' });
        expect(styles('.reserve-mfa-verification-actions')).toMatchObject({ 'justify-content': 'flex-end', 'align-items': 'center', gap: '8px' });
        expect(styles('.reserve-mfa-flow--settings .reserve-auth-secondary-actions')['justify-content']).toBe('flex-end');
        expect(styles('.reserve-mfa-manual-key > .reserve-copyable-text')).toMatchObject({ display: 'flex', 'justify-content': 'space-between', width: '100%' });
        expect(styles('.reserve-login-security-surface')).toMatchObject({ background: 'var(--c-bg-paper)',
            border: '1px solid var(--c-text-primary)', padding: '16px', 'border-radius': '12px' });
        expect(styles('.reserve-mfa-management-actions--secondary')['margin-top']).toBe('8px');
    });
    it('인증 앱의 뒤로와 등록은 같은 실행 행에 있고 뒤로는 등록을 제출하지 않아요', async () => {
        fixture.post.mockResolvedValue({ secret: 'SYNTHETIC', uri: 'otpauth://totp/fixture?secret=SYNTHETIC' });
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }} settings={{ required: true, credentials: [] }} />);
        fireEvent.click(screen.getByRole('button', { name: '인증 앱 연결' }));
        await screen.findByLabelText('인증 앱 코드');
        const back = screen.getByRole('button', { name: '뒤로' });
        const submit = screen.getByRole('button', { name: '등록', exact: true });
        expect(back.closest('.reserve-mfa-verification-actions')).toBe(submit.closest('.reserve-mfa-verification-actions'));
        expect(back).toHaveAttribute('type', 'button');
        expect(submit).toHaveAttribute('type', 'submit');
        fireEvent.click(back);
        await screen.findByRole('heading', { name: '인증 수단 관리' });
        expect(screen.queryByLabelText('인증 앱 코드')).toBeNull();
        expect(fixture.post.mock.calls.every(([path]) => path.endsWith('/totp/setup'))).toBe(true);
    });
    it('관리 화면은 등록 환경을 표시하고 이름이나 로그인 상태를 자동으로 변경하지 않아요', () => {
        const cancel = vi.fn();
        const settings = { required: true, credentials: [{ id: 'synthetic-key', kind: 'PASSKEY', name: '모바일 · Chrome' }] };
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }} settings={settings} onCancel={cancel} />);
        expect(screen.getByText('모바일 · Chrome')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(fixture.post).not.toHaveBeenCalled();
        expect(fixture.login).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
    });
    it('새 패스키의 서버 등록 요청이 거절되면 브라우저 등록과 로그인 완료를 실행하지 않아요', async () => {
        fixture.post.mockRejectedValue(new Error('기존 인증 수단으로 다시 확인해주세요.'));
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }} settings={{ required: true, credentials: [] }} />);
        fireEvent.click(screen.getByRole('button', { name: '패스키 추가' }));
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledWith('기존 인증 수단으로 다시 확인해주세요.'));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/api/auth/mfa/passkey/options', { registration: true }, expect.anything());
        expect(performPasskey).not.toHaveBeenCalled();
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('환경 정보가 없는 기존 패스키는 현재 접속 기기로 바꾸지 않아요', () => {
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }}
            settings={{ required: true, credentials: [{ id: 'synthetic-key', kind: 'PASSKEY' }] }} />);
        expect(screen.getByRole('group', { name: '패스키 인증 수단' })).toBeInTheDocument();
        expect(screen.queryByLabelText('기기 이름')).toBeNull();
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('설정의 복구코드는 확인 버튼 옆에 있고 닫기 버튼은 없어요', () => {
        render(<MfaFlow initialView={{ purpose: 'MANAGE', passkeyAvailable: true }} settings={{ required: true, credentials: [] }} />);
        const primary = screen.getByRole('button', { name: '패스키로 확인' });
        const recovery = screen.getByRole('button', { name: '복구코드 사용' });
        const actions = primary.closest('.reserve-mfa-verification-actions');
        expect(primary).toHaveClass('reserve-icon-tool');
        expect(actions).toContainElement(primary);
        expect(actions).toContainElement(recovery);
        expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
        fireEvent.click(recovery);
        expect(screen.getByLabelText('복구코드')).toBeInTheDocument();
    });
    it('외부 연필 닫기는 설정 중인 인증 앱도 서버에서 폐기하고 중복 요청을 막아요', async () => {
        const ref = createRef();
        let finish;
        const cancel = vi.fn();
        fixture.post.mockImplementation(path => path.endsWith('/totp/setup')
            ? Promise.resolve({ secret: 'SYNTHETIC', uri: 'otpauth://totp/fixture?secret=SYNTHETIC' })
            : new Promise(resolve => { finish = resolve; }));
        render(<MfaFlow ref={ref} initialView={{ purpose: 'MANAGE', verified: true }} settings={{ required: true, credentials: [] }} onCancel={cancel} />);
        fireEvent.click(screen.getByRole('button', { name: '인증 앱 연결' }));
        await screen.findByLabelText('인증 앱 코드');
        act(() => { ref.current.cancel(); ref.current.cancel(); });
        expect(cancel).not.toHaveBeenCalled();
        expect(fixture.post.mock.calls.filter(([path]) => path.endsWith('/cancel'))).toHaveLength(1);
        await act(async () => finish(null));
        expect(cancel).toHaveBeenCalledTimes(1);
    });
    it('인증 화면의 단계 전환만 한 번 움직이고 요청 대기 중에는 다시 움직이지 않아요', async () => {
        const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
        const animate = vi.fn(() => ({ cancel: vi.fn() }));
        Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/totp/setup')
            ? { secret: 'SYNTHETIC', uri: 'otpauth://totp/fixture?secret=SYNTHETIC' } : { codes: ['synthetic-recovery'] }));
        const view = render(<MfaFlow initialView={{ enrollmentRequired: true }} />);
        try {
            expect(animate).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole('button', { name: '인증 앱 연결' }));
            const code = await screen.findByLabelText('인증 앱 코드');
            expect(animate).toHaveBeenCalledTimes(1);
            fireEvent.change(code, { target: { value: '123456' } });
            expect(animate).toHaveBeenCalledTimes(1);
            fireEvent.click(screen.getByRole('button', { name: '등록', exact: true }));
            await screen.findByText('synthetic-recovery');
            expect(animate).toHaveBeenCalledTimes(2);
        } finally {
            view.unmount();
            if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original);
            else delete HTMLElement.prototype.animate;
        }
    });

    it('잘못된 추가 인증으로 기존 로그인 단계를 완료하지 않아요', async () => {
        fixture.post.mockRejectedValue(new Error('코드를 확인해주세요.'));
        render(<MfaFlow initialView={{ mfaRequired: true, enrollmentRequired: false, totpAvailable: true, purpose: 'LOGIN' }} />);
        fireEvent.change(screen.getByLabelText('인증 앱 코드'), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
        await waitFor(() => expect(fixture.message.error).toHaveBeenCalledWith('코드를 확인해주세요.'));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('다른 인증 수단이 남으면 현재 브라우저의 새 쿠키를 확인하고 관리 화면을 닫아요', async () => {
        const done = vi.fn(), logout = vi.fn();
        useAuthStore.setState({ user: { id: 7, role: 'ADMIN' }, isLoggedIn: true, logout });
        fixture.post.mockResolvedValue({ sessionRenewed: true });
        fixture.get.mockResolvedValue({ id: 7, role: 'ADMIN' });
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }} settings={{ required: true,
            credentials: [{ id: 'old-phone', kind: 'PASSKEY', name: '다른 기기 패스키' }, { id: 'pc', kind: 'PASSKEY', name: 'PC · Chrome' }] }} onDone={done} />);
        fireEvent.click(screen.getByRole('button', { name: '다른 기기 패스키 해제' }));
        await waitFor(() => expect(done).toHaveBeenCalledWith({ id: 7, role: 'ADMIN' }));
        expect(logout).not.toHaveBeenCalled();
        expect(fixture.login).not.toHaveBeenCalled();
        expect(fixture.get).toHaveBeenCalledWith('/api/member/me', expect.objectContaining({ skipAuthRefresh: true }));
    });
    it('인증 수단 해제 응답 전에 계정이 바뀌면 이전 계정의 화면 갱신을 이어가지 않아요', async () => {
        let complete;
        const done = vi.fn();
        useAuthStore.setState({ user: { id: 7, role: 'ADMIN' }, isLoggedIn: true });
        fixture.post.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }} settings={{ required: true,
            credentials: [{ id: 'phone', kind: 'PASSKEY', name: '모바일' }, { id: 'pc', kind: 'PASSKEY', name: 'PC' }] }} onDone={done} />);
        fireEvent.click(screen.getByRole('button', { name: '모바일 해제' }));
        await waitFor(() => expect(complete).toBeTypeOf('function'));
        await act(async () => {
            useAuthStore.getState().expireSession();
            useAuthStore.setState({ user: { id: 8, role: 'USER' }, isLoggedIn: true });
            complete({ sessionRenewed: true });
        });
        expect(fixture.get).not.toHaveBeenCalled();
        expect(done).not.toHaveBeenCalled();
        expect(useAuthStore.getState().user.id).toBe(8);
    });

    it.each([[false, false], [true, false], [true, true]])('마지막 인증 수단은 관리자 필수 %s·격리 로컬 허용 %s에 따라 보호해요', async (required, localAdminResetAvailable) => {
        const cancel = vi.fn();
        const logout = vi.fn();
        useAuthStore.setState({ logout });
        fixture.post.mockResolvedValue(null);
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }}
            settings={{ required, localAdminResetAvailable, credentials: [{ id: 'fixture-passkey', kind: 'PASSKEY', name: '합성 패스키' }] }} onCancel={cancel} />);
        const remove = screen.getByRole('button', { name: '합성 패스키 해제', exact: true });
        if (required && !localAdminResetAvailable) {
            expect(remove).toHaveAttribute('aria-disabled', 'true');
            expect(screen.queryByRole('button', { name: '추가 인증 해제' })).toBeNull();
        } else {
            expect(remove).toBeEnabled();
            fireEvent.click(remove);
            await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
            expect(fixture.post).toHaveBeenCalledWith('/api/auth/mfa/remove', { id: 'fixture-passkey' }, expect.anything());
            expect(logout).toHaveBeenCalledTimes(1);
        }
    });
});
