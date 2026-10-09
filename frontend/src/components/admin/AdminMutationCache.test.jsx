import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessVerificationTab from './BusinessVerificationTab';
import MailboxTab from './MailboxTab';
import api from '../../api/axios';
import { adminKeys } from '../../hooks/queryKeys';
import { API_ENDPOINTS } from '../../constants';

const state = vi.hoisted(() => ({
    confirm: vi.fn(), message: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../../hooks', async () => ({
    useMessage: () => ({ message: state.message, confirm: state.confirm }),
    useWindowWidth: () => 1024,
    useQueryParamsState: (defaults) => [defaults, vi.fn()],
    useFormErrors: (await import('../../hooks/useFormErrors')).default,
}));
vi.mock('../../hooks/useDebounce', () => ({ default: value => value }));
vi.mock('../common', () => ({
    Button: ({ children, onClick, disabled }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
    AdminTableSkeleton: () => <span>조회 중</span>,
    DataTable: ({ columns, dataSource }) => <>{dataSource.map(row => <div key={row.id}>{columns.find(c => c.key === 'actions').render(null, row)}</div>)}</>,
    DataState: ({ onRetry }) => <button onClick={onRetry}>다시 불러오기</button>,
    FilterToolbar: () => null,
    RefreshButton: ({ onReload }) => <button onClick={onReload}>새로고침</button>,
    FormField: ({ children, label, error }) => <label>{label}{children}{error && <span role="alert">{error}</span>}</label>,
    FormInput: ({ value, onChange, placeholder }) => <input value={value} onChange={onChange} placeholder={placeholder} />,
    FormTextArea: ({ value, onChange, placeholder }) => <textarea value={value} onChange={onChange} placeholder={placeholder} />,
    FormModal: ({ open, children, onSubmit }) => open && <section role="dialog" aria-label="새 메일 작성">{children}<button onClick={onSubmit}>보내기</button></section>,
    ModalLoading: () => null,
}));

const clients = new Set();
function mount(node) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.add(client);
    render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
    return client;
}
beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockReset(); api.post.mockReset(); api.delete.mockReset();
    api.post.mockResolvedValue(null); api.delete.mockResolvedValue(null);
});
afterEach(() => { for (const client of clients) client.clear(); clients.clear(); });

const business = { id: 73, memberId: 31, memberName: '시험 회원', businessName: '시험 가게', status: 'PENDING' };
const dependentKeys = [adminKeys.members(), adminKeys.auditLogs(), adminKeys.dashboardStats()];
function businessClient(row = business) {
    api.get.mockResolvedValue({ content: [row], page: { totalElements: 1 } });
    const client = mount(<BusinessVerificationTab mode={row.status === 'APPROVED' ? 'all' : 'pending'} />);
    for (const key of dependentKeys) client.setQueryData(key, { retained: true });
    return client;
}
async function confirmDecision() {
    expect(state.confirm).toHaveBeenCalledOnce();
    await act(async () => { await state.confirm.mock.calls[0][0].onOk(); });
}
async function expectAdminRefresh(client) {
    await waitFor(() => {
        for (const key of dependentKeys) expect(client.getQueryState(key).isInvalidated).toBe(true);
    });
}

describe('admin decisions with real mutation and query caches', () => {
    it('refreshes related member, audit and dashboard data after approval', async () => {
        const client = businessClient();
        fireEvent.click(await screen.findByRole('button', { name: /승인$/ }));
        await confirmDecision();
        expect(api.post).toHaveBeenCalledWith(API_ENDPOINTS.BUSINESS.ADMIN_APPROVE(73));
        await expectAdminRefresh(client);
    });
    it('requires a reason before rejection and refreshes dependent caches after success', async () => {
        const client = businessClient();
        fireEvent.click(await screen.findByRole('button', { name: /거절$/ }));
        fireEvent.click(await screen.findByRole('button', { name: /거절 처리$/ }));
        expect(api.post).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('거절 사유를 입력해주세요.');
        fireEvent.change(screen.getByPlaceholderText('예: 사업자등록증 이미지가 잘 보이지 않아요.'), { target: { value: '  등록증 재확인  ' } });
        fireEvent.click(screen.getByRole('button', { name: /거절 처리$/ }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith(API_ENDPOINTS.BUSINESS.ADMIN_REJECT(73), { reason: '등록증 재확인' }));
        await expectAdminRefresh(client);
    });
    it('uses the member identifier when revoking an approved application', async () => {
        const client = businessClient({ ...business, status: 'APPROVED' });
        fireEvent.click(await screen.findByRole('button', { name: /자격취소$/ }));
        await confirmDecision();
        expect(api.post).toHaveBeenCalledWith(API_ENDPOINTS.BUSINESS.ADMIN_REVOKE(31));
        await expectAdminRefresh(client);
    });
    it('retains caches and reports failure when approval is rejected by the server', async () => {
        const client = businessClient();
        api.post.mockRejectedValueOnce(new Error('permission denied'));
        fireEvent.click(await screen.findByRole('button', { name: /승인$/ }));
        await act(async () => { await expect(state.confirm.mock.calls[0][0].onOk()).rejects.toThrow('permission denied'); });
        expect(state.message.error).toHaveBeenCalledWith('permission denied');
        expect(state.message.success).not.toHaveBeenCalled();
        for (const key of dependentKeys) expect(client.getQueryState(key).isInvalidated).toBe(false);
    });
});

function fillMail() {
    fireEvent.change(screen.getByPlaceholderText('example@email.com'), { target: { value: 'reader@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('메일 제목'), { target: { value: '시험 안내' } });
    fireEvent.change(screen.getByPlaceholderText('메일 내용을 입력하세요...'), { target: { value: '안내 내용' } });
}
it('closes a successful nonmarketing mail draft and refreshes the sent cache', async () => {
    api.get.mockResolvedValue({ content: [], page: { totalElements: 0 } });
    const client = mount(<MailboxTab />);
    const retainedKey = [...adminKeys.sentMails(), 2, 'retained'];
    client.setQueryData(retainedKey, { mails: [] });
    fireEvent.click(await screen.findByRole('button', { name: /새 메일$/ }));
    fillMail();
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith(API_ENDPOINTS.MAIL.COMPOSE, { toEmail: 'reader@example.com', subject: '시험 안내', body: '안내 내용', marketing: false });
    expect(client.getQueryState(retainedKey).isInvalidated).toBe(true);
});
it('clears the selected trashed mail and refreshes both sent and trash caches', async () => {
    api.get.mockResolvedValue({ content: [{ id: 82, toEmail: 'reader@example.com', subject: '보관 메일', body: '보관 내용', sentAt: '2026-10-02T12:00:00' }], page: { totalElements: 1 } });
    const client = mount(<MailboxTab />);
    const sentKey = [...adminKeys.sentMails(), 2, 'retained'];
    client.setQueryData(sentKey, { mails: [] });
    client.setQueryData(adminKeys.trash(), { mails: [] });
    fireEvent.click(await screen.findByText('보관 메일'));
    fireEvent.click(screen.getByRole('button', { name: /휴지통$/ }));
    await confirmDecision();
    expect(api.delete).toHaveBeenCalledWith(API_ENDPOINTS.MAIL.TRASH_SENT(82));
    expect(screen.queryByRole('button', { name: /휴지통$/ })).not.toBeInTheDocument();
    expect(client.getQueryState(sentKey).isInvalidated).toBe(true);
    expect(client.getQueryState(adminKeys.trash()).isInvalidated).toBe(true);
});
