import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { expect, it, vi } from 'vitest';
import ConversationRowActions from './ConversationRowActions';

function setup(props = {}) {
    const onVisibilityChange = vi.fn().mockResolvedValue(undefined);
    const onSelect = vi.fn();
    render(<ConfigProvider theme={{ token: { motion: false } }}>
        <AntApp><ConversationRowActions title="가게 문의" onVisibilityChange={onVisibilityChange} {...props}>
            <button className="reserve-messenger-row" onClick={onSelect}>대화 열기</button>
        </ConversationRowActions></AntApp>
    </ConfigProvider>);
    const row = screen.getByRole('button', { name: '대화 열기' });
    const root = row.closest('.reserve-messenger-row-actions');
    Object.defineProperty(root, 'clientWidth', { value: 360 });
    return { row, root, onSelect, onVisibilityChange };
}
function pointer(target, type, x, y, extra = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, ...extra })
        .forEach(([key, value]) => Object.defineProperty(event, key, { value }));
    return fireEvent(target, event);
}

it.each([['touch', -70, 'left'], ['touch', 70, 'right'], ['mouse', -70, 'left'], ['mouse', 70, 'right']])(
    'reveals the matching action after a %s drag of %s', async (pointerType, distance, side) => {
        const onLeave = vi.fn();
        const { row, root, onSelect, onVisibilityChange } = setup({ onLeave });
        pointer(row, 'pointerdown', 150, 100, { pointerType, button: 0 });
        pointer(row, 'pointermove', 150 + distance, 101, { pointerType });
        if (pointerType === 'touch') pointer(row, 'lostpointercapture', 150 + distance, 101);
        expect(root).toHaveAttribute('data-dragging', 'true');
        expect(root.style.getPropertyValue('--reserve-messenger-row-drag-offset')).toBe(`${distance}px`);
        expect(screen.queryByRole('button', { name: '가게 문의 숨기기' })).not.toBeInTheDocument();
        pointer(root, 'pointerup', 150 + distance, 101, { pointerType });
        fireEvent.click(row, { detail: 1 });
        expect(root).toHaveAttribute('data-reveal', side);
        expect(root).not.toHaveAttribute('data-dragging');
        expect(onSelect).not.toHaveBeenCalled();
        expect(onVisibilityChange).not.toHaveBeenCalled();
        expect(onLeave).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: side === 'left' ? '가게 문의 숨기기' : '가게 문의 채팅방 나가기' })).toBeVisible();
        expect(screen.queryByRole('button', { name: side === 'left' ? '가게 문의 채팅방 나가기' : '가게 문의 숨기기' })).toBeNull();
        if (side === 'left') {
            fireEvent.click(screen.getByRole('button', { name: '가게 문의 숨기기' }));
            await waitFor(() => expect(onVisibilityChange).toHaveBeenCalledExactlyOnceWith(true));
        }
    });

it.each([[245, '채팅방에서 나갈까요?', '나가기'], [-245, '대화를 목록에서 숨길까요?', '숨기기']])(
    'requires an explicit decision after a full swipe of %s', async (distance, heading, label) => {
        const onLeave = vi.fn().mockResolvedValue(undefined);
        const { row, root, onVisibilityChange } = setup({ onLeave });
        const drag = () => {
            pointer(row, 'pointerdown', 275, 100);
            pointer(row, 'pointermove', 275 + distance, 100);
            expect(screen.queryByRole('dialog')).toBeNull();
            pointer(root, 'pointerup', 275 + distance, 100);
        };
        drag();
        await waitFor(() => expect(screen.getByRole('dialog', { name: heading })).toBeVisible());
        expect(onLeave).not.toHaveBeenCalled();
        expect(onVisibilityChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '취소' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(onLeave).not.toHaveBeenCalled();
        expect(onVisibilityChange).not.toHaveBeenCalled();
        drag();
        fireEvent.click(await screen.findByRole('button', { name: label, exact: true }));
        await waitFor(() => expect(distance > 0 ? onLeave : onVisibilityChange).toHaveBeenCalledOnce());
    });

it('keeps the system notification action on the visibility side', () => {
    const { row, root } = setup();
    pointer(row, 'pointerdown', 70, 100);
    pointer(row, 'pointermove', 315, 100);
    pointer(root, 'pointerup', 315, 100);
    expect(root).not.toHaveAttribute('data-reveal');
    expect(screen.queryByRole('button', { name: /나가기/ })).toBeNull();
});

it.each(['touch', 'mouse'])('leaves vertical %s movement alone and keeps a click available', pointerType => {
    const { row, root, onSelect, onVisibilityChange } = setup();
    pointer(row, 'pointerdown', 150, 100, { pointerType, button: 0 });
    expect(pointer(row, 'pointermove', 153, 150, { pointerType })).toBe(true);
    pointer(row, 'pointermove', 230, 170, { pointerType });
    pointer(row, 'pointerup', 230, 170, { pointerType });
    fireEvent.click(row, { detail: 1 });
    expect(root).not.toHaveAttribute('data-reveal');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onVisibilityChange).not.toHaveBeenCalled();
});

it.each(['pointercancel', 'lostpointercapture', 'second pointer'])('cancels a revealed gesture after %s without changing data', kind => {
    const { row, root, onVisibilityChange } = setup();
    pointer(row, 'pointerdown', 150, 100);
    pointer(row, 'pointermove', 60, 100);
    if (kind !== 'second pointer') pointer(root, kind, 60, 100);
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
