import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import InquiryModal from './InquiryModal';

vi.mock('../../api/axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../../hooks', async importOriginal => ({
    ...(await importOriginal()), useMessage: () => ({ message: { success: vi.fn(), error: vi.fn() } }),
}));

afterEach(() => vi.unstubAllGlobals());

it('previews a guest inquiry and its photo before sending the multipart request', async () => {
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
        static createObjectURL() { return 'blob:https://example.test/photo'; }
        static revokeObjectURL() {}
    });
    api.post.mockResolvedValue({ html: '<!DOCTYPE html><html><head></head><body>RESERVE · 합성 메일 디자인</body></html>' });
    const user = userEvent.setup();
    render(<MemoryRouter><InquiryModal open onClose={vi.fn()} /></MemoryRouter>);
    const dialog = await screen.findByRole('dialog');
    const form = within(dialog);
    await user.type(form.getByPlaceholderText('이름'), '합성 문의자');
    await user.type(form.getByPlaceholderText('example@email.com'), 'guest@example.test');
    await user.type(form.getByPlaceholderText('문의 제목을 입력하세요'), '사진 문의');
    await user.type(form.getByPlaceholderText('문의하실 내용을 자세히 적어주세요.'), '첨부를 확인해주세요.');
    await user.upload(dialog.querySelector('input[type="file"]'), new File(['photo'], 'inquiry.png', { type: 'image/png' }));

    await user.click(form.getByRole('button', { name: '미리보기' }));
    expect(form.getByText('guest@example.test')).toBeInTheDocument();
    expect(form.getByRole('button', { name: '첨부 사진 크게 보기' })).toBeInTheDocument();
    expect(await form.findByTitle('발송될 메일 디자인')).toHaveAttribute('sandbox', '');
    expect(form.getByTitle('발송될 메일 디자인').getAttribute('srcdoc')).toContain('합성 메일 디자인');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/api/inquiries/preview');
    expect(api.post.mock.calls[0][1]).not.toBeInstanceOf(FormData);
    await user.click(form.getByRole('button', { name: '수정하기' }));
    expect(form.getByPlaceholderText('문의 제목을 입력하세요')).toHaveValue('사진 문의');
    await user.click(form.getByRole('button', { name: '미리보기' }));
    await user.click(form.getByRole('button', { name: '보내기' }));
    expect(api.post).toHaveBeenCalledTimes(3);
    const [endpoint, data] = api.post.mock.lastCall;
    expect(endpoint).toBe('/api/inquiries');
    expect(data.get('request').type).toBe('application/json');
    expect(data.getAll('photos')).toEqual([expect.objectContaining({ name: 'inquiry.png', type: 'image/png' })]);
});
