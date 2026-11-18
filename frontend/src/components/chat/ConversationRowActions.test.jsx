import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { expect, it, vi } from 'vitest';
import ConversationRowActions from './ConversationRowActions';

function setup(props = {}) {
    const onVisibilityChange = vi.fn().mockResolvedValue(undefined);
    const onSelect = vi.fn();
    render(<AntApp><ConversationRowActions title="가게 문의" onVisibilityChange={onVisibilityChange} {...props}>
        <button className="reserve-messenger-row" onClick={onSelect}>대화 열기</button>
    </ConversationRowActions></AntApp>);
    const row = screen.getByRole('button', { name: '대화 열기' });
    return { row, root: row.closest('.reserve-messenger-row-actions'), onSelect, onVisibilityChange };
}
function pointer(target, type, x, y, extra = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, ...extra })
        .forEach(([key, value]) => Object.defineProperty(event, key, { value }));
    return fireEvent(target, event);
}

it.each([[-70, 'left'], [70, 'right']])('reveals a reversible action after a horizontal swipe of %s without opening or hiding the conversation', async (distance, side) => {
    const { row, root, onSelect, onVisibilityChange } = setup();
    pointer(row, 'pointerdown', 150, 100);
    pointer(row, 'pointermove', 150 + distance, 101);
    pointer(row, 'pointerup', 150 + distance, 101);
    fireEvent.click(row, { detail: 1 });
    expect(root).toHaveAttribute('data-reveal', side);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onVisibilityChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '가게 문의 숨기기' }));
    await waitFor(() => expect(onVisibilityChange).toHaveBeenCalledExactlyOnceWith(true));
    await waitFor(() => expect(root).not.toHaveAttribute('data-reveal'));
});

it('leaves vertical scrolling and mouse dragging alone', () => {
    const { row, root, onVisibilityChange } = setup();
    pointer(row, 'pointerdown', 150, 100);
    expect(pointer(row, 'pointermove', 153, 150)).toBe(true);
    pointer(row, 'pointermove', 230, 170);
    pointer(row, 'pointerup', 230, 170);
    pointer(row, 'pointerdown', 150, 100, { pointerType: 'mouse' });
    pointer(row, 'pointermove', 50, 100, { pointerType: 'mouse' });
    pointer(row, 'pointerup', 50, 100, { pointerType: 'mouse' });
    expect(root).not.toHaveAttribute('data-reveal');
    expect(onVisibilityChange).not.toHaveBeenCalled();
});

it.each(['pointercancel', 'second pointer'])('cancels a revealed gesture after %s without changing data', kind => {
    const { row, root, onVisibilityChange } = setup();
    pointer(row, 'pointerdown', 150, 100);
    pointer(row, 'pointermove', 60, 100);
    if (kind === 'pointercancel') pointer(row, kind, 60, 100);
    else pointer(row, 'pointerdown', 190, 120, { pointerId: 2, isPrimary: false });
    pointer(row, 'pointerup', 60, 100);
    expect(root).not.toHaveAttribute('data-reveal');
    expect(onVisibilityChange).not.toHaveBeenCalled();
});

it('provides menu, restore and Escape controls without a swipe', async () => {
    const { root, onVisibilityChange } = setup({ hidden: true });
    const menu = screen.getByRole('button', { name: '가게 문의 대화 메뉴' });
    expect(screen.queryByRole('button', { name: '가게 문의 복원' })).not.toBeInTheDocument();
    fireEvent.click(menu);
    const restore = screen.getByRole('button', { name: '가게 문의 복원' });
    restore.focus();
    fireEvent.keyDown(restore, { key: 'Escape' });
    expect(menu).toHaveFocus();
    expect(root).not.toHaveAttribute('data-reveal');
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('button', { name: '가게 문의 복원' }));
    await waitFor(() => expect(onVisibilityChange).toHaveBeenCalledExactlyOnceWith(false));
});

it('closes an open action when another row or control is pressed', () => {
    const { root } = setup();
    fireEvent.click(screen.getByRole('button', { name: '가게 문의 대화 메뉴' }));
    fireEvent.pointerDown(document.body);
    expect(root).not.toHaveAttribute('data-reveal');
});

it('keeps a failed action available and prevents duplicate submissions', async () => {
    let reject;
    const onVisibilityChange = vi.fn(() => new Promise((_, fail) => { reject = fail; }));
    const { root } = setup({ onVisibilityChange });
    fireEvent.click(screen.getByRole('button', { name: '가게 문의 대화 메뉴' }));
    const action = screen.getByRole('button', { name: '가게 문의 숨기기' });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(onVisibilityChange).toHaveBeenCalledOnce();
    await act(async () => reject(new Error('network unavailable')));
    expect(root).toHaveAttribute('data-reveal', 'left');
    expect(await screen.findByText('대화 표시를 변경하지 못했어요. 다시 시도해주세요.')).toBeInTheDocument();
    expect(action).not.toBeDisabled();
});
