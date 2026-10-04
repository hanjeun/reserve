import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResponsiveModal from './ResponsiveModal';

const Harness = () => {
    const [open, setOpen] = useState(false);
    return <>
        <button onClick={() => setOpen(true)}>상세 열기</button>
        <ResponsiveModal open={open} title="예약 상세" footer={null} onCancel={() => setOpen(false)}
            styles={{ wrapper: { position: 'fixed' } }}>
            <input aria-label="메모" />
            <button onClick={() => setOpen(false)}>완료</button>
        </ResponsiveModal>
    </>;
};

describe('ResponsiveModal focus and viewport boundary', () => {
    beforeEach(() => {
        vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
            matches: query === '(max-width: 575px)' || query === '(prefers-reduced-motion: reduce)', media: query,
            addEventListener: vi.fn(), removeEventListener: vi.fn(),
        }));
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 300, height: 600, top: 0, left: 0, right: 300, bottom: 600,
        });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('focuses the title, keeps Tab and Shift+Tab inside, then restores the trigger', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: '상세 열기' });
        await user.click(trigger);
        const title = screen.getByText('예약 상세');
        await waitFor(() => expect(title).toHaveFocus());
        expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
        await user.tab();
        expect(screen.getByRole('textbox', { name: '메모' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: '완료' })).toHaveFocus();
        await user.tab();
        // user-event blurs the last control to body without the browser's focusin notification.
        fireEvent.focusIn(document.body);
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        await user.tab({ shift: true });
        expect(screen.getByRole('button', { name: '완료' })).toHaveFocus();
        await user.click(screen.getByRole('button', { name: '완료' }));
        await waitFor(() => expect(trigger).toHaveFocus());
        await user.click(trigger);
        await waitFor(() => expect(screen.getByText('예약 상세')).toHaveFocus());
    });

    it('forwards close callbacks and form mask policy while retaining user input focus', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        const afterOpenChange = vi.fn();
        render(<ResponsiveModal open title="메일 작성" mobileSize="form" mask={{ closable: false }}
            footer={null} onCancel={onCancel} afterOpenChange={afterOpenChange}>
            <input aria-label="받는 사람" />
        </ResponsiveModal>);
        const input = screen.getByRole('textbox', { name: '받는 사람' });
        await waitFor(() => expect(afterOpenChange).toHaveBeenCalledWith(true));
        await user.click(input);
        expect(input).toHaveFocus();
        const wrapper = screen.getByRole('dialog').closest('.ant-modal-wrap');
        fireEvent.mouseDown(wrapper);
        fireEvent.click(wrapper);
        expect(onCancel).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Escape', keyCode: 27 });
        expect(onCancel).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(afterOpenChange).toHaveBeenCalledWith(true));
        expect(input).toHaveFocus();
    });

    it('fits a form to the visible keyboard viewport and removes listeners on close', async () => {
        const viewport = new EventTarget();
        viewport.height = 760;
        viewport.offsetTop = 0;
        const removeListener = vi.spyOn(viewport, 'removeEventListener');
        vi.stubGlobal('visualViewport', viewport);
        const view = render(<ResponsiveModal open title="문의 작성" mobileSize="form" footer={null} />);
        const root = screen.getByRole('dialog').closest('.ant-modal-root');
        await waitFor(() => expect(root.style.getPropertyValue('--reserve-modal-viewport-height')).toBe('760px'));
        viewport.height = 360;
        viewport.offsetTop = 180;
        act(() => viewport.dispatchEvent(new Event('resize')));
        await waitFor(() => expect(root.style.getPropertyValue('--reserve-modal-viewport-height')).toBe('360px'));
        expect(root.style.getPropertyValue('--reserve-modal-viewport-top')).toBe('180px');
        view.rerender(<ResponsiveModal open={false} title="문의 작성" mobileSize="form" footer={null} />);
        expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
        expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
        expect(root.style.getPropertyValue('--reserve-modal-viewport-height')).toBe('');
    });

    it('keeps an opted-out decision modal centered and honors its explicit motion', async () => {
        render(<ResponsiveModal open title="신고 처리 확인" mobileSheet={false}
            centered transitionName="" footer={null} />);
        const dialog = screen.getByRole('dialog');
        expect(dialog.closest('.ant-modal-root')).not.toHaveClass('reserve-modal-sheet-root');
        expect(dialog.closest('.ant-modal-wrap')).toHaveClass('ant-modal-centered');
        await waitFor(() => expect(screen.getByText('신고 처리 확인')).toHaveFocus());
    });
});
