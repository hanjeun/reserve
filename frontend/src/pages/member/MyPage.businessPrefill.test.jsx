import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyPage from './MyPage';
import useAuthStore from '../../store/useAuthStore';
import { businessService } from '../../services';

const feedback = vi.hoisted(() => ({
    message: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    confirm: vi.fn(),
}));
vi.mock('../../services', () => ({
    memberService: {},
    businessService: {
        getMyStatus: vi.fn(), update: vi.fn(), submit: vi.fn(), cancel: vi.fn(), resign: vi.fn(),
    },
}));
vi.mock('../../hooks', () => ({
    useMessage: () => feedback,
    useWindowWidth: () => 1200,
}));
vi.mock('../../hooks/useTheme', () => ({
    default: () => ({ theme: 'light', resolvedTheme: 'light', font: 'pretendard', accent: 'blue' }),
    FONT_OPTIONS: [], ACCENT_OPTIONS: [],
}));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/useImagePreview', () => ({
    default: () => ({ handlePreview: vi.fn(), previewNode: null, suppressLinkNavigation: vi.fn() }),
}));
vi.mock('../../components/common', async () => ({
    Button: (await import('../../components/common/Button')).default,
    FormInput: (await import('../../components/common/FormInput')).default,
    PageContainer: ({ children }) => <main>{children}</main>,
    Avatar: () => null,
    Bone: () => <span />,
    SegmentedControl: () => null,
    FormSelect: () => null,
    DataState: ({ state = 'error', title, description, onRetry, retrying }) => (
        <section role={state === 'error' ? 'alert' : undefined}>
            <span>{title}</span>
            {description && <span>{description}</span>}
            {onRetry && <button type="button" onClick={onRetry} disabled={retrying}>다시 불러오기</button>}
        </section>
    ),
}));

const pending = (businessName = '기존 상호') => ({
    id: 11, status: 'PENDING', businessName, businessNumber: '123-45-67890', memo: '기존 메모',
});
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
    return { promise, resolve, reject };
};
const show = () => render(<MemoryRouter><MyPage /></MemoryRouter>);
const openBusiness = async () => {
    const rendered = show();
    fireEvent.click(screen.getByRole('tab', { name: /사업자/ }));
    await screen.findByText('심사 중이에요');
    return rendered;
};
const startEdit = () => fireEvent.click(screen.getByRole('button', { name: '수정하기' }));
const editError = () => screen.queryByText('사업자 신청 내용을 불러오지 못했습니다.');
const settle = (request, value, fails = false) => act(async () => {
    if (fails) request.reject(value); else request.resolve(value);
    await request.promise.catch(() => {});
});

describe('MyPage business edit prefill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        useAuthStore.setState({
            user: { id: 7, role: 'USER', name: '회원7', email: 'member7@example.com' },
            isLoggedIn: true, sessionRevision: 70, checkAuth: vi.fn(),
        });
        businessService.getMyStatus.mockResolvedValue(pending());
        businessService.update.mockResolvedValue({});
        businessService.cancel.mockResolvedValue({});
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('keeps the pending application closed on failure and retries with actual existing fields', async () => {
        await openBusiness();
        businessService.getMyStatus.mockRejectedValueOnce(new Error('offline'));
        startEdit();
        await screen.findByText('사업자 신청 내용을 불러오지 못했습니다.');
        expect(screen.getByText('심사 중이에요')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('상호명 *')).toBeNull();
        expect(screen.queryByText('신청 내용 수정')).toBeNull();
        expect(businessService.update).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByPlaceholderText('상호명 *')).toHaveValue('기존 상호');
        expect(screen.getByPlaceholderText('사업자 등록번호 (선택)')).toHaveValue('123-45-67890');
        expect(screen.getByPlaceholderText('추가 메모 (선택)')).toHaveValue('기존 메모');
        expect(editError()).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));
        await waitFor(() => expect(businessService.update).toHaveBeenCalledWith({
            businessName: '기존 상호', businessNumber: '123-45-67890', memo: '기존 메모', licenseImage: undefined,
        }));
    }, 10_000);

    it('labels prefill loading, prevents duplicate requests and mounts the form only on success', async () => {
        await openBusiness();
        const request = deferred();
        businessService.getMyStatus.mockReturnValueOnce(request.promise);
        startEdit();
        expect(screen.getByRole('status', { name: '사업자 신청 내용을 불러오는 중' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
        startEdit();
        expect(businessService.getMyStatus).toHaveBeenCalledTimes(2);
        expect(screen.queryByPlaceholderText('상호명 *')).toBeNull();
        await settle(request, pending());
        expect(await screen.findByPlaceholderText('상호명 *')).toHaveValue('기존 상호');
        expect(screen.queryByRole('status', { name: '사업자 신청 내용을 불러오는 중' })).toBeNull();
    });

    it.each([null, { status: 'APPROVED', businessName: '승인된 상호' }, pending('  ')])(
        'does not open an empty edit form for an unavailable or incomplete response %#', async current => {
            await openBusiness();
            businessService.getMyStatus.mockResolvedValueOnce(current);
            startEdit();
            await screen.findByText('사업자 신청 내용을 불러오지 못했습니다.');
            expect(screen.queryByPlaceholderText('상호명 *')).toBeNull();
            expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
            expect(businessService.update).not.toHaveBeenCalled();
        },
    );

    it.each([false, true])('ignores a late prefill after application cancellation (failure=%s)', async fails => {
        await openBusiness();
        const request = deferred();
        businessService.getMyStatus.mockReturnValueOnce(request.promise);
        startEdit();
        fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
        await act(async () => { await feedback.confirm.mock.calls[0][0].onOk(); });
        const name = await screen.findByPlaceholderText('상호명 *');
        fireEvent.change(name, { target: { value: '새 신청의 입력' } });
        await settle(request, fails ? new Error('late offline') : pending('오래된 상호'), fails);
        expect(name).toHaveValue('새 신청의 입력');
        expect(screen.queryByText('신청 내용 수정')).toBeNull();
        expect(editError()).toBeNull();
        expect(businessService.update).not.toHaveBeenCalled();
    });

    it('prevents an error retry while application cancellation is in flight', async () => {
        await openBusiness();
        businessService.getMyStatus.mockRejectedValueOnce(new Error('offline'));
        startEdit();
        await screen.findByText('사업자 신청 내용을 불러오지 못했습니다.');
        const cancellation = deferred();
        businessService.cancel.mockReturnValueOnce(cancellation.promise);
        fireEvent.click(screen.getByRole('button', { name: '신청 취소' }));
        let cancelPromise;
        act(() => { cancelPromise = feedback.confirm.mock.calls[0][0].onOk(); });
        // Cancelling invalidates the failed prefill and removes its retry action.
        expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
        expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
        startEdit();
        expect(businessService.getMyStatus).toHaveBeenCalledTimes(2);
        await settle(cancellation, {});
        await act(async () => { await cancelPromise; });
        expect(await screen.findByPlaceholderText('상호명 *')).toHaveValue('');
    });

    it.each([
        ['other account', { user: { id: 8, role: 'USER', name: '회원8' }, sessionRevision: 71 }],
        ['same-account relogin', { sessionRevision: 71 }],
    ])('hides an already opened edit form in a new %s session', async (_name, auth) => {
        await openBusiness();
        startEdit();
        const oldName = await screen.findByPlaceholderText('상호명 *');
        fireEvent.change(oldName, { target: { value: '이전 세션의 수정 입력' } });
        act(() => { useAuthStore.setState(auth); });
        expect(screen.queryByPlaceholderText('상호명 *')).toBeNull();
        expect(screen.queryByText('신청 내용 수정')).toBeNull();
        expect(screen.getByText('심사 중이에요')).toBeInTheDocument();
        expect(businessService.update).not.toHaveBeenCalled();
        businessService.getMyStatus.mockResolvedValueOnce(pending('현재 회원의 상호'));
        startEdit();
        expect(await screen.findByPlaceholderText('상호명 *')).toHaveValue('현재 회원의 상호');
    });

    it.each([
        ['other account', { user: { id: 8, role: 'USER', name: '회원8' }, sessionRevision: 71 }, false],
        ['same-account relogin', { sessionRevision: 71 }, true],
    ])('isolates a late response from a new %s prefill', async (_name, auth, fails) => {
        await openBusiness();
        const oldRequest = deferred();
        const newRequest = deferred();
        businessService.getMyStatus.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
        startEdit();
        act(() => { useAuthStore.setState(auth); });
        expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
        startEdit();
        await settle(oldRequest, fails ? new Error('old session failure') : pending('이전 회원 상호'), fails);
        expect(screen.getByRole('status', { name: '사업자 신청 내용을 불러오는 중' })).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('상호명 *')).toBeNull();
        expect(editError()).toBeNull();
        await settle(newRequest, pending('현재 세션 상호'));
        expect(await screen.findByPlaceholderText('상호명 *')).toHaveValue('현재 세션 상호');
    });

    it('ignores an unmounted prefill without disrupting a newly mounted request', async () => {
        const first = await openBusiness();
        const oldRequest = deferred();
        businessService.getMyStatus.mockReturnValueOnce(oldRequest.promise);
        startEdit();
        first.unmount();
        await openBusiness();
        const newRequest = deferred();
        businessService.getMyStatus.mockReturnValueOnce(newRequest.promise);
        startEdit();
        await settle(oldRequest, pending('언마운트된 상호'));
        expect(screen.getByRole('status', { name: '사업자 신청 내용을 불러오는 중' })).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('상호명 *')).toBeNull();
        expect(editError()).toBeNull();
        await settle(newRequest, pending('다시 연 신청'));
        expect(await screen.findByPlaceholderText('상호명 *')).toHaveValue('다시 연 신청');
    });
});
