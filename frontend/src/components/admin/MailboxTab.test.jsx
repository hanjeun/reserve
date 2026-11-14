import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '../../api/axios';
import MailboxTab from './MailboxTab';

const { message, confirm } = vi.hoisted(() => ({ message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }, confirm: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('../../hooks', async importOriginal => ({
    ...(await importOriginal()), useMessage: () => ({ message, confirm }), useWindowWidth: () => 1280,
}));

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
    expect(await screen.findByRole('button', { name: '첨부 사진 크게 보기' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '답변하기' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), '예약을 확인했어요.');
    await user.click(within(dialog).getByRole('button', { name: '미리보기' }));
    expect(within(dialog).getByText('Re: 합성 예약 문의')).toBeInTheDocument();
    expect(await within(dialog).findByTitle('발송될 메일 디자인')).toHaveAttribute('srcdoc', expect.stringContaining('RESERVE 답변'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/api/admin/mail/preview');
    await user.click(within(dialog).getByRole('button', { name: '수정하기' }));
    expect(within(dialog).getByRole('textbox')).toHaveValue('예약을 확인했어요.');
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
