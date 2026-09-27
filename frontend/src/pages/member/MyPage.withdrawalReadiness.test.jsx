import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyPage from './MyPage';
import useAuthStore from '../../store/useAuthStore';
import { memberService } from '../../services';

const feedback = vi.hoisted(() => ({
    message: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    confirm: vi.fn(), navigate: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../services', () => ({
    memberService: { getWithdrawalReadiness: vi.fn(), deleteMember: vi.fn() },
    businessService: { getMyStatus: vi.fn() },
}));
vi.mock('../../hooks', () => ({ useMessage: () => feedback, useWindowWidth: () => 1200 }));
vi.mock('../../hooks/useTheme', () => ({
    default: () => ({ theme: 'light', resolvedTheme: 'light', font: 'pretendard', accent: 'blue' }),
    FONT_OPTIONS: [], ACCENT_OPTIONS: [],
}));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/useImagePreview', () => ({
    default: () => ({ handlePreview: vi.fn(), previewNode: null, suppressLinkNavigation: vi.fn() }),
}));
vi.mock('react-router-dom', async importOriginal => ({
    ...await importOriginal(), useNavigate: () => feedback.navigate,
}));
vi.mock('../../components/common', async () => ({
    Button: (await import('../../components/common/Button')).default,
    FormInput: (await import('../../components/common/FormInput')).default,
    PageContainer: ({ children }) => <main>{children}</main>,
    Avatar: () => null, Bone: () => <span />, SegmentedControl: () => null, FormSelect: () => null,
}));

const ready = { canWithdraw: true, openStores: 0, unresolvedReservations: 0, unresolvedRefunds: 0, openPaymentIssues: 0, unfinishedWebhooks: 0 };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
    return { promise, resolve, reject };
};
const show = () => render(<MemoryRouter><MyPage /></MemoryRouter>);
const startWithdrawal = () => fireEvent.click(screen.getByRole('button', { name: '탈퇴하기' }));
const latestConfirm = () => feedback.confirm.mock.calls.at(-1)[0];
const openConfirm = async () => {
    startWithdrawal();
    await waitFor(() => expect(feedback.confirm).toHaveBeenCalledTimes(1));
    return latestConfirm();
};
const settle = (request, value, fails = false) => act(async () => {
    if (fails) request.reject(value); else request.resolve(value);
    await request.promise.catch(() => {});
});
const changes = [
    ['other account', { user: { id: 8, role: 'USER', name: '회원8' }, sessionRevision: 71 }],
    ['same-account relogin', { sessionRevision: 71 }],
    ['role change', { user: { id: 7, role: 'BUSINESS', name: '회원7' } }],
    ['logout', { user: null, isLoggedIn: false, sessionRevision: 71 }],
];
const expectNoCompletion = () => {
    expect(feedback.logout).not.toHaveBeenCalled();
    expect(feedback.navigate).not.toHaveBeenCalled();
    expect(feedback.message.success).not.toHaveBeenCalled();
};

describe('MyPage withdrawal session readiness gate', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        localStorage.clear();
        useAuthStore.setState({
            user: { id: 7, role: 'USER', name: '회원7', email: 'member7@example.com' },
            isLoggedIn: true, sessionRevision: 70, checkAuth: vi.fn(), logout: feedback.logout,
        });
        memberService.getWithdrawalReadiness.mockResolvedValue(ready);
        memberService.deleteMember.mockResolvedValue({});
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('keeps the server blocked decision and reports its unresolved counters without confirmation or deletion', async () => {
        show();
        memberService.getWithdrawalReadiness.mockResolvedValueOnce({
            canWithdraw: false, openStores: 1, unresolvedReservations: 2, unresolvedRefunds: 3, openPaymentIssues: 4, unfinishedWebhooks: 5,
        });
        startWithdrawal();
        await waitFor(() => expect(feedback.message.warning).toHaveBeenCalledWith(
            '먼저 처리할 항목이 있습니다. 운영 중 가게 1곳, 예약 2건, 환불 3건, 결제 확인 4건, 웹훅 5건',
        ));
        expect(feedback.confirm).not.toHaveBeenCalled();
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeEnabled();
        expectNoCompletion();
    });

    it.each([null, {}, { canWithdraw: 'true' }, { canWithdraw: 1 }])('fails closed for an incomplete readiness response %#', async response => {
        show();
        memberService.getWithdrawalReadiness.mockResolvedValueOnce(response);
        startWithdrawal();
        await waitFor(() => expect(feedback.message.error).toHaveBeenCalledWith(
            '탈퇴 준비 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
        ));
        expect(feedback.confirm).not.toHaveBeenCalled();
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it('reports a current preparation failure, unlocks retry and never deletes without confirmation', async () => {
        show();
        memberService.getWithdrawalReadiness.mockRejectedValueOnce(new Error('readiness offline'));
        startWithdrawal();
        await waitFor(() => expect(feedback.message.error).toHaveBeenCalledWith('readiness offline'));
        expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeEnabled();
        expect(feedback.confirm).not.toHaveBeenCalled();
        const options = await openConfirm();
        expect(options).toMatchObject({ title: '회원 탈퇴', okText: '탈퇴하기', cancelText: '취소', centered: true, okButtonProps: { danger: true } });
        expect(options.content).toContain('거래·환불·분쟁 대응에 필요한 기록은 비식별 상태로 보존됩니다.');
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it('prevents duplicate preparation and duplicate dialogs, and invalidates a cancelled dialog', async () => {
        show();
        const request = deferred();
        memberService.getWithdrawalReadiness.mockReturnValueOnce(request.promise);
        startWithdrawal();
        startWithdrawal();
        expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeDisabled();
        expect(memberService.getWithdrawalReadiness).toHaveBeenCalledTimes(1);
        await settle(request, ready);
        const oldOptions = latestConfirm();
        startWithdrawal();
        expect(memberService.getWithdrawalReadiness).toHaveBeenCalledTimes(1);
        expect(feedback.confirm).toHaveBeenCalledTimes(1);
        act(() => { oldOptions.onCancel(); });
        startWithdrawal();
        await waitFor(() => expect(feedback.confirm).toHaveBeenCalledTimes(2));
        await act(async () => { await oldOptions.onOk(); });
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it.each(changes)('ignores late preparation success after %s', async (_name, change) => {
        show();
        const request = deferred();
        memberService.getWithdrawalReadiness.mockReturnValueOnce(request.promise);
        startWithdrawal();
        act(() => { useAuthStore.setState(change); });
        await settle(request, ready);
        expect(feedback.confirm).not.toHaveBeenCalled();
        expect(feedback.message.error).not.toHaveBeenCalled();
        expect(feedback.message.warning).not.toHaveBeenCalled();
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeEnabled();
        expectNoCompletion();
    });

    it('ignores an old preparation failure without clearing the new session preparation loading', async () => {
        show();
        const oldRequest = deferred();
        const newRequest = deferred();
        memberService.getWithdrawalReadiness.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
        startWithdrawal();
        act(() => { useAuthStore.setState({ sessionRevision: 71 }); });
        startWithdrawal();
        await settle(oldRequest, new Error('old readiness offline'), true);
        expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeDisabled();
        expect(feedback.message.error).not.toHaveBeenCalled();
        expect(feedback.confirm).not.toHaveBeenCalled();
        await settle(newRequest, ready);
        expect(feedback.confirm).toHaveBeenCalledTimes(1);
        expect(memberService.deleteMember).not.toHaveBeenCalled();
    });

    it.each([false, true])('ignores an unmounted preparation response (failure=%s)', async fails => {
        const page = show();
        const request = deferred();
        memberService.getWithdrawalReadiness.mockReturnValueOnce(request.promise);
        startWithdrawal();
        page.unmount();
        await settle(request, fails ? new Error('unmounted readiness') : ready, fails);
        expect(feedback.confirm).not.toHaveBeenCalled();
        expect(feedback.message.error).not.toHaveBeenCalled();
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it.each(changes)('does not send deletion through an old confirmation after %s', async (_name, change) => {
        show();
        const options = await openConfirm();
        act(() => { useAuthStore.setState(change); });
        await act(async () => { await options.onOk(); });
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expect(feedback.message.error).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it('does not send deletion through an unmounted confirmation', async () => {
        const page = show();
        const options = await openConfirm();
        page.unmount();
        await act(async () => { await options.onOk(); });
        expect(memberService.deleteMember).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it.each([
        ['other account', changes[0][1], false],
        ['same-account relogin', changes[1][1], true],
        ['role change', changes[2][1], false],
        ['logout', changes[3][1], true],
    ])('ignores deletion completion or failure in a new %s session', async (_name, change, fails) => {
        show();
        const options = await openConfirm();
        const deletion = deferred();
        memberService.deleteMember.mockReturnValueOnce(deletion.promise);
        let result;
        act(() => { result = options.onOk(); });
        expect(memberService.deleteMember).toHaveBeenCalledTimes(1);
        act(() => { useAuthStore.setState(change); });
        await settle(deletion, fails ? new Error('old deletion failure') : {}, fails);
        await act(async () => { await result; });
        expect(feedback.message.error).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it.each([false, true])('ignores unmounted deletion completion (failure=%s)', async fails => {
        const page = show();
        const options = await openConfirm();
        const deletion = deferred();
        memberService.deleteMember.mockReturnValueOnce(deletion.promise);
        let result;
        act(() => { result = options.onOk(); });
        page.unmount();
        await settle(deletion, fails ? new Error('unmounted deletion') : {}, fails);
        await act(async () => { await result; });
        expect(feedback.message.error).not.toHaveBeenCalled();
        expectNoCompletion();
    });

    it('allows exactly one explicitly confirmed mock deletion and completes only in its original session', async () => {
        show();
        const options = await openConfirm();
        const deletion = deferred();
        memberService.deleteMember.mockReturnValueOnce(deletion.promise);
        let result;
        act(() => { result = options.onOk(); });
        await act(async () => { await options.onOk(); });
        startWithdrawal();
        expect(memberService.deleteMember).toHaveBeenCalledTimes(1);
        expect(memberService.getWithdrawalReadiness).toHaveBeenCalledTimes(1);
        expectNoCompletion();
        await settle(deletion, {});
        await act(async () => { await result; });
        expect(feedback.logout).toHaveBeenCalledTimes(1);
        expect(feedback.navigate).toHaveBeenCalledWith('/', { replace: true, state: { reserveRouteMotion: 'from-left' } });
        expect(feedback.message.success).toHaveBeenCalledWith('탈퇴가 완료되었습니다');
        await act(async () => { await options.onOk(); });
        expect(memberService.deleteMember).toHaveBeenCalledTimes(1);
    });

    it('reports a current confirmed mock deletion failure and allows a fresh readiness check', async () => {
        show();
        const options = await openConfirm();
        memberService.deleteMember.mockRejectedValueOnce(new Error('current deletion offline'));
        await act(async () => { await options.onOk(); });
        expect(feedback.message.error).toHaveBeenCalledWith('current deletion offline');
        expectNoCompletion();
        startWithdrawal();
        await waitFor(() => expect(feedback.confirm).toHaveBeenCalledTimes(2));
        expect(memberService.getWithdrawalReadiness).toHaveBeenCalledTimes(2);
    });
});
