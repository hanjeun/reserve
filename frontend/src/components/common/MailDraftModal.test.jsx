import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import MailDraftModal from './MailDraftModal';

const HTML = '<!DOCTYPE html><html><head></head><body>RESERVE 합성 메일</body></html>';
function setup(loadPreview) {
    const onSend = vi.fn();
    render(<MemoryRouter><MailDraftModal title="메일" open onClose={vi.fn()} validate={() => true}
        onSend={onSend} previewFields={[]} loadPreview={loadPreview}><input aria-label="본문" /></MailDraftModal></MemoryRouter>);
    return { onSend, user: userEvent.setup() };
}

it('requires the full preview before sending and allows retry without losing the draft', async () => {
    const loadPreview = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(HTML);
    const { onSend, user } = setup(loadPreview);
    await user.click(await screen.findByRole('button', { name: '미리보기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('메일 미리보기를 불러오지 못했어요.');
    expect(onSend).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByTitle('발송될 메일 디자인')).toHaveAttribute('sandbox', '');
    expect(screen.getByTitle('발송될 메일 디자인').getAttribute('srcdoc')).toContain("default-src 'none'");
    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith([]);
});

it('discards a late preview when the user returns to editing', async () => {
    let resolve;
    const loadPreview = vi.fn(() => new Promise(done => { resolve = done; }));
    const { onSend, user } = setup(loadPreview);
    await user.click(await screen.findByRole('button', { name: '미리보기' }));
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '수정하기' }));
    expect(loadPreview.mock.calls[0][0].aborted).toBe(true);
    await act(async () => resolve(HTML));
    expect(screen.getByRole('textbox', { name: '본문' })).toBeInTheDocument();
    expect(screen.queryByTitle('발송될 메일 디자인')).not.toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
});
