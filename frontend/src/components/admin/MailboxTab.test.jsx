import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { deleteMailDraft, listMailDrafts, readMailDraft, saveMailDraft } from '../../utils/mailDraftStorage';
import MailboxTab from './MailboxTab';

const { message, confirm } = vi.hoisted(() => ({ message: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }, confirm: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../../utils/mailDraftStorage', () => ({
    deleteMailDraft: vi.fn(), listMailDrafts: vi.fn(), readMailDraft: vi.fn(), saveMailDraft: vi.fn(),
}));
vi.mock('../../hooks', async importOriginal => ({
    ...(await importOriginal()), useMessage: () => ({ message, confirm }), useWindowWidth: () => 1280,
}));

const auth = useAuthStore.getState();
beforeEach(() => vi.clearAllMocks());
afterEach(() => { useAuthStore.setState(auth); vi.restoreAllMocks(); });

it('opens, replies to and trashes a received inquiry independently of sent mail', async () => {
    let inquiry = { id: 9, memberEmail: 'guest@example.test', title: '합성 예약 문의', content: '합성 문의 내용',
        status: 'PENDING', statusDisplayName: '답변 대기', categoryDisplayName: '기타 문의', inboundEmail: true,
        replySubject: 'Re: 합성 예약 문의', createdAt: '2026-11-12 12:00' };
    const sent = { id: 9, toEmail: 'sent@example.test', subject: '합성 발송 기록', body: '합성 발송 내용', sentAt: '2026-11-12T12:01:00' };
    api.get.mockImplementation(async url => {
        if (url.endsWith('/photos')) return [url.startsWith('/api/inquiries') ? 81 : 91];
        const content = [url === '/api/inquiries/admin/all' ? inquiry : sent].filter(Boolean);
        return { content, page: { totalElements: content.length } };
    });
    api.post.mockImplementation(async (_url, { answer }) => {
        if (_url.endsWith('/preview')) return { html: '<!DOCTYPE html><html><head></head><body>RESERVE 답변</body></html>' };
        inquiry = { ...inquiry, status: 'ANSWERED', statusDisplayName: '답변 완료', answer };
        return inquiry;
    });
    api.delete.mockImplementation(async () => { inquiry = null; });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/admin?tab=mailbox']}>
        <QueryClientProvider client={client}><MailboxTab /></QueryClientProvider>
    </MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: /합성 예약 문의/ }));
    expect(screen.getByText('지원 이메일')).toBeInTheDocument();
    expect(screen.getByText('답변 대기', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('답변 대기', { exact: true }).closest('.ant-badge')).toBeNull();
    expect(await screen.findByRole('button', { name: '첨부 사진 크게 보기' })).toBeInTheDocument();
    const reply = screen.getByRole('button', { name: '답변하기' });
    expect(reply).toHaveClass('reserve-btn--ghost-sm-primary');
    expect(reply.querySelector('svg')).toBeInTheDocument();
    await user.click(reply);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: '답변' }), '예약을 확인했어요.');
    await user.click(within(dialog).getByRole('button', { name: '미리보기' }));
    expect(within(dialog).getByText('Re: 합성 예약 문의')).toBeInTheDocument();
    expect(await within(dialog).findByTitle('발송될 메일 디자인')).toHaveAttribute('srcdoc', expect.stringContaining('RESERVE 답변'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/api/admin/mail/preview');
    await user.click(within(dialog).getByRole('button', { name: '수정하기' }));
    expect(within(dialog).getByRole('textbox', { name: '답변' })).toHaveValue('예약을 확인했어요.');
    await user.click(within(dialog).getByRole('button', { name: '미리보기' }));
    await user.click(within(dialog).getByRole('button', { name: '답변 보내기' }));
    await waitFor(() => expect(message.success).toHaveBeenCalledWith('문의 답변 메일을 보냈어요.'));
    expect(api.post).toHaveBeenCalledWith('/api/inquiries/admin/9/reply', { answer: '예약을 확인했어요.' });
    expect(screen.queryByRole('button', { name: '답변하기' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '휴지통' }));
    await act(async () => confirm.mock.lastCall[0].onOk());
    expect(api.delete).toHaveBeenCalledWith('/api/inquiries/admin/9');
    expect(await screen.findByText('받은 문의가 없어요.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '보낸 메일' }));
    await user.click(await screen.findByRole('button', { name: /합성 발송 기록/ }));
    expect(await screen.findByRole('button', { name: '첨부 사진 크게 보기' })).toBeInTheDocument();
    expect(screen.queryByText('합성 문의 내용')).not.toBeInTheDocument();
});

it('saves a new mail with photos locally, reopens it from Sent, and clears it on confirmed send', async () => {
    useAuthStore.setState({ user: { id: 7, role: 'ADMIN' }, isLoggedIn: true });
    const photo = new File(['draft-image'], 'draft.png', { type: 'image/png' });
    let draft;
    saveMailDraft.mockImplementation(async (_owner, record) => { draft = { ...record, id: 'fixture-draft' }; });
    readMailDraft.mockImplementation(async () => draft);
    deleteMailDraft.mockImplementation(async () => { draft = null; });
    listMailDrafts.mockImplementation(async () => draft ? [{ id: draft.id, ...draft.form, bodyPreview: draft.form.body, savedAt: Date.now() }] : []);
    api.get.mockResolvedValue({ content: [], page: { totalElements: 0 } });
    let sendAttempts = 0;
    api.post.mockImplementation(async url => {
        if (url.endsWith('/preview')) return { html: '<!DOCTYPE html><html><head></head><body>RESERVE</body></html>' };
        if (++sendAttempts === 1) throw new Error('offline');
        return {};
    });
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mail-draft');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/admin?tab=mailbox']}>
        <QueryClientProvider client={client}><ConfigProvider theme={{ token: { motion: false } }}><MailboxTab /></ConfigProvider></QueryClientProvider>
    </MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: '새 메일' }));
    const modal = () => within(screen.getByRole('dialog'));
    fireEvent.change(modal().getByRole('textbox', { name: '받는 사람' }), { target: { value: 'guest@example.test' } });
    fireEvent.change(modal().getByRole('textbox', { name: '제목' }), { target: { value: '합성 발송 초안' } });
    fireEvent.change(modal().getByRole('textbox', { name: '내용' }), { target: { value: '작성한 본문' } });
    await user.click(modal().getByRole('checkbox', { name: /광고·홍보/ }));
    expect(modal().getByRole('textbox', { name: '받는 사람' })).toBeEnabled();
    await user.upload(screen.getByRole('dialog').querySelector('input[type=file]'), photo);
    await user.click(modal().getByRole('button', { name: '임시저장' }));
    expect(await screen.findByText('임시 저장됨')).toBeInTheDocument();
    expect(saveMailDraft).toHaveBeenCalledExactlyOnceWith(7, {
        id: undefined, form: { toEmail: 'guest@example.test', subject: '합성 발송 초안', body: '작성한 본문', marketing: true }, photos: [photo],
    });
    expect(api.post).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: /임시 저장됨.*합성 발송 초안/ }));
    await waitFor(() => expect(modal().getByRole('textbox', { name: '받는 사람' })).toHaveValue('guest@example.test'));
    expect(modal().getByRole('checkbox', { name: /광고·홍보/ })).toBeChecked();
    expect(modal().getByRole('textbox', { name: '내용' })).toHaveValue('작성한 본문');
    expect(createUrl).toHaveBeenLastCalledWith(photo);
    await user.click(modal().getByRole('button', { name: '미리보기' }));
    await modal().findByTitle('발송될 메일 디자인');
    expect(deleteMailDraft).not.toHaveBeenCalled();
    await user.click(modal().getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('메일 발송에 실패했어요.'));
    expect(deleteMailDraft).not.toHaveBeenCalled();
    await user.click(modal().getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(deleteMailDraft).toHaveBeenCalledExactlyOnceWith(7, 'fixture-draft'));
    await waitFor(() => expect(screen.queryByText('임시 저장됨')).not.toBeInTheDocument());
});

it('keeps the received mail pagination and focus across a delayed page request', async () => {
    let resolvePage;
    const mail = (id, title) => ({ id, title, content: '합성 문의 내용', memberEmail: 'guest@example.test', status: 'PENDING' });
    api.get.mockImplementation((_url, { params }) => params.page === 0
        ? Promise.resolve({ content: [mail(7, '첫 문의')], totalElements: 21 })
        : new Promise(resolve => { resolvePage = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<MemoryRouter initialEntries={['/admin?tab=mailbox']}>
        <QueryClientProvider client={client}><MailboxTab /></QueryClientProvider>
    </MemoryRouter>);

    await screen.findByText('첫 문의');
    const pager = container.querySelector('.ant-pagination');
    const nextPage = pager.querySelector('.ant-pagination-item-2');
    nextPage.focus();
    fireEvent.click(nextPage);
    await waitFor(() => expect(resolvePage).toBeTypeOf('function'));
    expect(screen.queryByText('첫 문의')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-pagination')).toBe(pager);
    expect(nextPage).toHaveFocus();

    await act(async () => resolvePage({ content: [mail(8, '둘째 문의')], totalElements: 21 }));
    await screen.findByText('둘째 문의');
    expect(container.querySelector('.ant-pagination')).toBe(pager);
    expect(nextPage).toHaveFocus();
});
