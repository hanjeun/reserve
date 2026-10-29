import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import MfaFlow from './MfaFlow';
import { performPasskey } from '../../utils/passkey';
import useAuthStore from '../../store/useAuthStore';
import { requestAuthenticationBack } from '../../utils/authenticationNavigation';
const fixture = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), login: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post, get: fixture.get } }));

vi.mock('../../utils/passkey', () => ({ performPasskey: vi.fn() }));
describe('추가 인증', () => {

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
        expect(screen.getByRole('button', { name: '복구코드 사용' }).parentElement).toHaveClass('reserve-mfa-alternatives');
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it('인증 관리의 패스키 버튼도 브라우저 인증을 한 번만 요청해요', async () => {
        fixture.post.mockImplementation(path => Promise.resolve(path.endsWith('/verify')
            ? { purpose: 'MANAGE', verified: true } : 'options'));
        performPasskey.mockResolvedValue('signed-credential');
        render(<MfaFlow initialView={{ purpose: 'MANAGE', passkeyAvailable: true }} settings={{ required: true, credentials: [] }} />);
        fireEvent.click(screen.getByRole('button', { name: '패스키로 확인' }));
        expect(await screen.findByRole('heading', { name: '인증 수단 관리' })).toBeInTheDocument();
        expect(performPasskey).toHaveBeenCalledTimes(1);
        expect(fixture.post.mock.calls.some(([path]) => path.endsWith('/finish'))).toBe(false);
    });
    it('설정의 복구코드는 확인 버튼 옆에 있고 닫기 버튼은 없어요', () => {
        render(<MfaFlow initialView={{ purpose: 'MANAGE', passkeyAvailable: true }} settings={{ required: true, credentials: [] }} />);
        const primary = screen.getByRole('button', { name: '패스키로 확인' });
        const recovery = screen.getByRole('button', { name: '복구코드 사용' });
        expect(primary.parentElement).toHaveClass('reserve-mfa-verification-actions');
        expect(primary.parentElement).toContainElement(recovery);
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
        expect(await screen.findByRole('alert')).toHaveTextContent('코드를 확인해주세요.');
        expect(fixture.login).not.toHaveBeenCalled();
    });
    it.each([false, true])('마지막 인증 수단은 관리자 필수 여부 %s에 따라 보호해요', async required => {
        const cancel = vi.fn();
        const logout = vi.fn();
        useAuthStore.setState({ logout });
        fixture.post.mockResolvedValue(null);
        render(<MfaFlow initialView={{ purpose: 'MANAGE', verified: true }}
            settings={{ required, credentials: [{ id: 'fixture-passkey', kind: 'PASSKEY', name: '합성 패스키' }] }} onCancel={cancel} />);
        const remove = screen.getByRole('button', { name: '해제', exact: true });
        if (required) {
            expect(remove).toBeDisabled();
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
