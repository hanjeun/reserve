import { createRef, useLayoutEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider, Dropdown } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tooltip from './Tooltip';
import Button from './Button';
import StatusHint from './StatusHint';
import { uiIconConfig } from './uiIconConfig';
import { CopyOutlined } from './icons';

const settle = async () => { await act(async () => { vi.advanceTimersByTime(500); }); };
const pointer = (target, type, pointerType, coordinates = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ pointerType, pointerId: 1, clientX: 0, clientY: 0, ...coordinates })) Object.defineProperty(event, key, { value });
    fireEvent(target, event);
};
const setup = child => render(<ConfigProvider {...uiIconConfig} theme={{ token: { motion: false } }}>{child}</ConfigProvider>);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function FocusHandoff() {
    const [open, setOpen] = useState(false);
    const target = useRef(null);
    useLayoutEffect(() => { if (open) target.current.focus(); }, [open]);
    return <><Tooltip title="소식 작성"><button onClick={() => setOpen(true)}>작성</button></Tooltip>
        {open && <div role="dialog"><button ref={target}>작성 본문</button></div>}</>;
}

describe('shared explanation tooltips', () => {
    it('moves keyboard focus into an opening dialog without flushing during its layout', async () => {
        const errors = vi.spyOn(console, 'error');
        try {
            setup(<FocusHandoff />);
            fireEvent.keyDown(document, { key: 'Tab' });
            act(() => screen.getByRole('button', { name: '작성', exact: true }).focus());
            await settle();
            expect(screen.getByRole('tooltip')).toBeVisible();
            fireEvent.click(screen.getByRole('button', { name: '작성', exact: true }));
            await settle();
            expect(screen.getByRole('button', { name: '작성 본문' })).toHaveFocus();
            expect(screen.queryByRole('tooltip')).toBeNull();
            expect(errors.mock.calls.filter(args => String(args[0]).includes('flushSync'))).toEqual([]);
        } finally { errors.mockRestore(); }
    });
    it('opens on mouse hover and closes on leave without changing the action or ref', async () => {
        const click = vi.fn(), ref = createRef();
        setup(<Tooltip title="작성 설명"><button ref={ref} onClick={click}>작성</button></Tooltip>);
        const button = screen.getByRole('button', { name: '작성' });
        fireEvent.mouseEnter(button); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('작성 설명');
        expect(ref.current).toBe(button);
        fireEvent.mouseLeave(button); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        fireEvent.click(button);
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('keeps keyboard descriptions and Escape dismissal while preserving child key handlers', async () => {
        const key = vi.fn();
        setup(<Tooltip title="메뉴 설명"><button onKeyDown={key}>메뉴</button></Tooltip>);
        const button = screen.getByRole('button', { name: '메뉴' });
        fireEvent.keyDown(document, { key: 'Tab' });
        fireEvent.focus(button); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('메뉴 설명');
        fireEvent.keyDown(button, { key: 'Escape' }); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(key).toHaveBeenCalledTimes(1);
        fireEvent.blur(button); fireEvent.focus(button); await settle();
        expect(screen.getByRole('tooltip')).toBeVisible();
        fireEvent.blur(button); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('suppresses delayed hover and retained focus after touch while allowing the click', async () => {
        const click = vi.fn();
        setup(<Tooltip title="정렬 설명"><button aria-label="정렬" onClick={click}>정렬</button></Tooltip>);
        const button = screen.getByRole('button', { name: '정렬' });
        fireEvent.mouseEnter(button);
        pointer(button, 'pointerdown', 'touch');
        fireEvent.focus(button);
        pointer(button, 'pointerup', 'touch');
        fireEvent.click(button);
        fireEvent.mouseEnter(button); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(button).toHaveAttribute('aria-label', '정렬');
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('does not reopen a delayed hover after Escape until the next entry', async () => {
        setup(<Tooltip title="사진 설명"><button>사진</button></Tooltip>);
        const button = screen.getByRole('button', { name: '사진' });
        fireEvent.mouseEnter(button);
        fireEvent.keyDown(button, { key: 'Escape' }); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        fireEvent.mouseLeave(button); fireEvent.mouseEnter(button); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('사진 설명');
    });

    it('restores real mouse hover after touch without resurrecting an old popup', async () => {
        setup(<Tooltip title="지역 설명"><button>지역</button></Tooltip>);
        const button = screen.getByRole('button', { name: '지역' });
        fireEvent.mouseEnter(button); await settle();
        expect(screen.getByRole('tooltip')).toBeVisible();
        pointer(button, 'pointerdown', 'touch'); pointer(button, 'pointerup', 'touch'); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        fireEvent.mouseLeave(button);
        pointer(document, 'pointermove', 'mouse'); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        fireEvent.mouseEnter(button); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('지역 설명');
    });

    it('forwards an outer Dropdown click through the tooltip to its actual trigger', async () => {
        const click = vi.fn();
        setup(<Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: '수정' }] }}>
            <Tooltip title="게시물 메뉴 설명"><button onClick={click}>게시물 메뉴</button></Tooltip>
        </Dropdown>);
        const button = screen.getByRole('button', { name: '게시물 메뉴' });
        pointer(button, 'pointerdown', 'touch'); fireEvent.click(button); await settle();
        expect(screen.getByRole('menuitem', { name: '수정' })).toBeVisible();
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('automatically explains icon-only common buttons without a second native title', async () => {
        setup(<Button icon={<CopyOutlined />} aria-label="내용 복사" title="이전 브라우저 설명" />);
        const button = screen.getByRole('button', { name: '내용 복사' });
        expect(button).not.toHaveAttribute('title');
        fireEvent.mouseEnter(button); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('내용 복사');
    });

    it('retains important status reasons as touch-readable text and keeps status tags nonclosable', () => {
        setup(<StatusHint label="정지" description="사유: 확인이 필요해요." color="orange" />);
        const reason = screen.getByText('사유: 확인이 필요해요.');
        pointer(document, 'pointerdown', 'touch');
        expect(reason).toHaveAttribute('data-touch', 'true');
        expect(screen.getByLabelText('정지, 사유: 확인이 필요해요.')).toHaveAttribute('tabindex', '0');
        expect(document.querySelector('.ant-tag-close-icon')).toBeNull();
    });
});

it('shows a held touch description only until release and consumes that gesture click', async () => {
    const click = vi.fn();
    setup(<Tooltip title="신고 검토 설명"><button onClick={click}>검토</button></Tooltip>);
    const button = screen.getByRole('button', { name: '검토' });
    pointer(button, 'pointerdown', 'touch');
    await act(async () => { vi.advanceTimersByTime(499); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('신고 검토 설명');
    pointer(document, 'pointerup', 'touch'); await settle();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(button);
    expect(click).not.toHaveBeenCalled();
    pointer(button, 'pointerdown', 'touch'); pointer(document, 'pointerup', 'touch'); fireEvent.click(button);
    expect(click).toHaveBeenCalledTimes(1);
});

it.each(['move', 'scroll', 'cancel'])('cancels a pending long press on %s without blocking a short tap', async reason => {
    const click = vi.fn();
    setup(<Tooltip title="상태 설명"><button onClick={click}>상태</button></Tooltip>);
    const button = screen.getByRole('button', { name: '상태' });
    pointer(button, 'pointerdown', 'touch');
    if (reason === 'move') pointer(document, 'pointermove', 'touch', { clientY: 20 });
    if (reason === 'scroll') fireEvent.scroll(window);
    if (reason === 'cancel') pointer(document, 'pointercancel', 'touch');
    await settle();
    expect(screen.queryByRole('tooltip')).toBeNull();
    pointer(button, 'pointerdown', 'touch'); pointer(document, 'pointerup', 'touch'); fireEvent.click(button);
    expect(click).toHaveBeenCalledTimes(1);
});

it('keeps native link long presses and does not open a dropdown after a held button', async () => {
    const view = setup(<Tooltip title="외부 링크 설명"><a href="/help">도움말</a></Tooltip>);
    pointer(screen.getByRole('link'), 'pointerdown', 'touch'); await settle();
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.unmount();
    setup(<Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: '수정' }] }}>
        <Tooltip title="관리 설명"><button>관리</button></Tooltip></Dropdown>);
    const button = screen.getByRole('button', { name: '관리' });
    pointer(button, 'pointerdown', 'touch'); await settle();
    expect(screen.getByRole('tooltip')).toHaveTextContent('관리 설명');
    pointer(button, 'pointerup', 'touch'); fireEvent.click(button); await settle();
    expect(screen.queryByRole('menuitem')).toBeNull();
});

it('does not explain mouse focus or resurrect a tooltip after it becomes unavailable', async () => {
    const view = setup(<Tooltip title="도구 설명"><button>도구</button></Tooltip>);
    const button = screen.getByRole('button', { name: '도구' });
    pointer(button, 'pointerdown', 'mouse'); fireEvent.focus(button); await settle();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(button); await settle();
    expect(screen.getByRole('tooltip')).toHaveTextContent('도구 설명');
    view.rerender(<ConfigProvider {...uiIconConfig} theme={{ token: { motion: false } }}><Tooltip title="도구 설명" disabled><button>도구</button></Tooltip></ConfigProvider>);
    await settle(); expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(<ConfigProvider {...uiIconConfig} theme={{ token: { motion: false } }}><Tooltip title="도구 설명"><button>도구</button></Tooltip></ConfigProvider>);
    await settle(); expect(screen.queryByRole('tooltip')).toBeNull();
});
