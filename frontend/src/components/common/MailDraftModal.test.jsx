import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it.each([
    { label: '미리보기', widths: [100, 100], from: 0, to: 1, order: [1, 0] },
    { label: '삭제', widths: [100, 100], from: 0, to: 1, order: [1, 0] },
    { label: '삭제', widths: [136, 88, 88], from: 2, to: 0, order: [2, 0, 1] },
    { label: '미리보기', widths: [136, 88, 88], from: 2, to: 1, order: [0, 2, 1], dropNearEdge: true },
])('moves photo $from to $to from its $label half with widths $widths', async ({ label, widths, from, to, order, dropNearEdge }) => {
    const { onSend, user } = setup(vi.fn().mockResolvedValue(HTML));
    const files = widths.map((_, index) => new File(['photo'], `photo-${index}.png`, { type: 'image/png' }));
    const picker = await screen.findByLabelText('첨부 사진 선택');
    const list = picker.closest('.ant-upload-list-picture-card');
    const items = () => [...list.querySelectorAll('.reserve-sortable-upload-item')];
    const gap = 8;
    const photoRects = widths.map((width, index) => {
        const left = widths.slice(0, index).reduce((sum, size) => sum + size + gap, 0);
        const height = index === 0 && widths.length === 3 ? 64 : 100;
        return { x: left, y: 0, left, top: 0, width, height, right: left + width, bottom: height };
    });
    const measure = HTMLElement.prototype.getBoundingClientRect;
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return photoRects[items().indexOf(this)] ?? measure.call(this);
    });
    try {
        await user.upload(picker, files);
        if (widths.length === 3) expect(list.closest('.reserve-picture-upload')).toHaveClass('reserve-picture-upload--trigger-hidden');
        const action = await screen.findByRole('button', { name: `${files[from].name} ${label}` });
        const nodes = items();
        const source = nodes[from];
        const destination = nodes[to];
        const rect = photoRects[from];
        const targetRect = photoRects[to];
        const startX = rect.left + rect.width * (label === '미리보기' ? 0.25 : 0.75);
        const endX = dropNearEdge ? targetRect.right - 8 : startX + targetRect.left + targetRect.width / 2 - rect.left - rect.width / 2;
        const touch = clientX => [{ identifier: 1, clientX, clientY: 40, target: action }];
        fireEvent.touchStart(action, { touches: touch(startX), changedTouches: touch(startX) });
        expect(source).not.toHaveClass('is-dragging');
        await waitFor(() => expect(source).toHaveClass('is-dragging'));
        fireEvent.touchMove(action, { touches: touch(endX), changedTouches: touch(endX) });
        await waitFor(() => expect(destination.style.transform).toContain('translate3d('));
        const displacement = destination.style.transform;
        fireEvent.touchEnd(action, { touches: [], changedTouches: touch(endX) });
        fireEvent.click(action, { detail: 1 });
        await waitFor(() => expect(items()).toEqual(order.map(index => nodes[index])));
        expect(document.querySelector('.reserve-image-preview')).not.toBeInTheDocument();
        expect(displacement).toContain(`translate3d(${(rect.width + gap) * Math.sign(from - to)}px,`);
    } finally {
        bounds.mockRestore();
    }

    await user.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByTitle('발송될 메일 디자인');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith(order.map(index => files[index]));
});
