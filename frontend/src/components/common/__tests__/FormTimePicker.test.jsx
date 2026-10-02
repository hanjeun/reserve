import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import FormTimePicker from '../FormTimePicker';
import { buildStoreFormData } from '../../../utils/form';

vi.mock('antd', async () => {
    const ReactModule = await import('react');
    return {
        Form: { Item: { useStatus: () => ({ status: undefined }) } },
        Modal: ({ open, children, title }) => open ? ReactModule.createElement(
            'div', { role: 'dialog', 'aria-label': title.props.children }, children,
        ) : null,
    };
});

const time = (value, date = '2000-01-01') => dayjs(`${date}T${value}:00`);
const selected = label => within(screen.getByRole('listbox', { name: label })).getByRole('option', { selected: true });

describe('FormTimePicker', () => {
    beforeEach(() => vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(220));
    afterEach(() => vi.restoreAllMocks());

    it('keeps a changed single time in the modal until confirmation and discards cancellation', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker value={time('09:15')} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '09:15' }));
        await user.click(screen.getByRole('listbox', { name: '분' }));
        await user.keyboard('{ArrowDown}');
        expect(selected('분')).toHaveTextContent('16');
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '취소' }));
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '09:15' }));
        expect(selected('분')).toHaveTextContent('15');
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].format('HH:mm')).toBe('09:15');
        expect(onChange.mock.calls[0][1]).toBe('09:15');
    });

    it.each([['00:07', '오전'], ['12:07', '오후']])('preserves midnight/noon for %s', async (value, period) => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker value={time(value)} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: value }));
        expect(selected('오전·오후')).toHaveTextContent(period);
        expect(selected('시')).toHaveTextContent('12');
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].format('HH:mm')).toBe(value);
    });

    it('switches the period without changing the minute or the hour shown on the wheel', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker value={time('00:07')} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '00:07' }));
        await user.click(within(screen.getByRole('listbox', { name: '오전·오후' })).getByRole('option', { name: '오후' }));
        expect(selected('시')).toHaveTextContent('12');
        expect(selected('분')).toHaveTextContent('07');
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][1]).toBe('12:07');
    });

    it('requires both ends of an empty range to be confirmed before updating the form', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker.RangePicker onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작 시간.*종료 시간/ }));
        await user.click(screen.getByRole('button', { name: '다음' }));
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /종료 시간.*선택 전/ })).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].map(item => item.format('HH:mm'))).toEqual(['09:00', '10:00']);
    });

    it('sorts a reversed range by HH:mm even when its Dayjs dates differ', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker.RangePicker value={[time('13:20', '2026-10-02'), time('18:20', '2026-09-01')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /13:20.*18:20/ }));
        await user.click(screen.getByRole('button', { name: /종료 시간.*18:20/ }));
        await user.click(within(screen.getByRole('listbox', { name: '오전·오후' })).getByRole('option', { name: '오전' }));
        await user.click(within(screen.getByRole('listbox', { name: '시' })).getByRole('option', { name: '09' }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].map(item => item.format('HH:mm'))).toEqual(['09:20', '13:20']);
        expect(onChange.mock.calls[0][1]).toEqual(['09:20', '13:20']);
        const payload = buildStoreFormData({ times: onChange.mock.calls[0][0] });
        expect(payload.get('openTime')).toBe('09:20');
        expect(payload.get('closeTime')).toBe('13:20');
    });

    it('adds unique session times, removes a session and commits only the final list', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker multiple value={[time('13:00')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '13:00' }));
        await user.click(screen.getByRole('listbox', { name: '시' }));
        await user.keyboard('{End}');
        await user.click(screen.getByRole('button', { name: '12:00 회차 추가' }));
        await user.click(screen.getByRole('button', { name: '12:00 회차 추가' }));
        expect(screen.getAllByRole('button', { name: '12:00 회차 삭제' })).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: '13:00 회차 삭제' }));
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][1]).toEqual(['12:00']);
        expect(buildStoreFormData({ sessionTimes: onChange.mock.calls[0][0] }).getAll('sessionTimes')).toEqual(['12:00']);
    });

    it('takes a native scroll selection and supports keyboard boundaries without losing focus', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '시간 선택' }));
        const minutes = screen.getByRole('listbox', { name: '분' });
        fireEvent.scroll(minutes, { target: { scrollTop: 44 * 37 } });
        expect(selected('분')).toHaveTextContent('37');
        minutes.focus();
        await user.keyboard('{End}{ArrowDown}');
        expect(selected('분')).toHaveTextContent('59');
        expect(minutes).toHaveFocus();
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][1]).toBe('09:59');
    });

    it.each([['single', null], ['range', null], ['multiple', []]])('clears %s with the existing empty-value contract', async (mode, empty) => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const Picker = mode === 'range' ? FormTimePicker.RangePicker : FormTimePicker;
        render(<Picker multiple={mode === 'multiple'} onChange={onChange} />);
        await user.click(screen.getAllByRole('button')[0]);
        await user.click(screen.getByRole('button', { name: '전체 해제' }));
        expect(onChange.mock.calls[0][0]).toEqual(empty);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps the form label linked to a disabled trigger and opens no modal', async () => {
        const user = userEvent.setup();
        render(<><label htmlFor="times">영업 시간</label><FormTimePicker.RangePicker id="times" disabled /></>);
        const trigger = screen.getByLabelText('영업 시간');
        expect(trigger).toBeDisabled();
        await user.click(trigger);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('clears a controlled form value set back to undefined without retaining an internal copy', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const { rerender } = render(<FormTimePicker.RangePicker value={undefined} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작 시간.*종료 시간/ }));
        await user.click(screen.getByRole('button', { name: '다음' }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        rerender(<FormTimePicker.RangePicker value={onChange.mock.calls[0][0]} onChange={onChange} />);
        expect(screen.getByRole('button', { name: /09:00.*10:00/ })).toBeInTheDocument();
        rerender(<FormTimePicker.RangePicker value={undefined} onChange={onChange} />);
        expect(screen.getByRole('button', { name: /시작 시간.*종료 시간/ })).toBeInTheDocument();
    });
});
