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

    it.each(['00:07', '12:07', '23:07'])('uses the same 24-hour time on the wheel and final value for %s', async value => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker value={time(value)} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: value }));
        expect(screen.queryByRole('listbox', { name: '오전·오후' })).not.toBeInTheDocument();
        expect(selected('시')).toHaveTextContent(value.slice(0, 2));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].format('HH:mm')).toBe(value);
    });

    it('selects an afternoon hour directly without changing the minute', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker value={time('00:07')} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '00:07' }));
        await user.click(within(screen.getByRole('listbox', { name: '시' })).getByRole('option', { name: '18' }));
        expect(selected('시')).toHaveTextContent('18');
        expect(selected('분')).toHaveTextContent('07');
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][1]).toBe('18:07');
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

    it('does not commit a zero-length range when the initial end cursor cannot advance past 23', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker.RangePicker onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작 시간.*종료 시간/ }));
        await user.click(within(screen.getByRole('listbox', { name: '시' })).getByRole('option', { name: '23' }));
        await user.click(screen.getByRole('button', { name: '다음' }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        await user.click(within(screen.getByRole('listbox', { name: '분' })).getByRole('option', { name: '01' }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][1]).toEqual(['23:00', '23:01']);
    });

    it('rejects a reversed range instead of silently swapping the business opening and closing times', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker.RangePicker value={[time('13:20', '2026-10-02'), time('18:20', '2026-09-01')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /13:20.*18:20/ }));
        await user.click(screen.getByRole('button', { name: /종료 시간.*18:20/ }));
        await user.click(within(screen.getByRole('listbox', { name: '시' })).getByRole('option', { name: '09' }));
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        expect(screen.getByText(/종료 시간은 시작 시간보다 뒤여야/)).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
        await user.click(within(screen.getByRole('listbox', { name: '시' })).getByRole('option', { name: '19' }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].map(item => item.format('HH:mm'))).toEqual(['13:20', '19:20']);
        expect(onChange.mock.calls[0][1]).toEqual(['13:20', '19:20']);
        const payload = buildStoreFormData({ times: onChange.mock.calls[0][0] });
        expect(payload.get('openTime')).toBe('13:20');
        expect(payload.get('closeTime')).toBe('19:20');
    });

    it('synchronizes typed range times with the wheels, rejects invalid input and keeps cancel reversible', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker.RangePicker value={[time('09:15'), time('10:45')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /09:15.*10:45/ }));
        const start = screen.getByRole('textbox', { name: '시작 시간 직접 입력' });
        await user.clear(start);
        await user.type(start, '2359');
        expect(selected('시')).toHaveTextContent('23');
        expect(selected('분')).toHaveTextContent('59');
        const end = screen.getByRole('textbox', { name: '종료 시간 직접 입력' });
        await user.clear(end);
        await user.type(end, '24:60');
        expect(end).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        expect(onChange).not.toHaveBeenCalled();
        await user.clear(end);
        await user.type(end, '00:07');
        expect(selected('시')).toHaveTextContent('00');
        expect(selected('분')).toHaveTextContent('07');
        await user.click(screen.getByRole('button', { name: '취소' }));
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: /09:15.*10:45/ }));
        expect(screen.getByRole('textbox', { name: '시작 시간 직접 입력' })).toHaveValue('09:15');
        expect(screen.getByRole('textbox', { name: '종료 시간 직접 입력' })).toHaveValue('10:45');
    });

    it('adds unique session times, removes a session and commits only the final list', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormTimePicker multiple value={[time('13:00')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '13:00' }));
        await user.click(screen.getByRole('listbox', { name: '시' }));
        await user.keyboard('{End}');
        await user.click(screen.getByRole('button', { name: '23:00 회차 추가' }));
        await user.click(screen.getByRole('button', { name: '23:00 회차 추가' }));
        expect(screen.getAllByRole('button', { name: '23:00 회차 삭제' })).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: '13:00 회차 삭제' }));
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][1]).toEqual(['23:00']);
        expect(buildStoreFormData({ sessionTimes: onChange.mock.calls[0][0] }).getAll('sessionTimes')).toEqual(['23:00']);
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

    it('keeps form validation on the editable fields and the error description on the trigger', async () => {
        const user = userEvent.setup();
        render(<FormTimePicker.RangePicker aria-invalid="true" aria-describedby="times-error" />);
        const trigger = screen.getByRole('button', { name: /시작 시간.*종료 시간/ });
        expect(trigger).not.toHaveAttribute('aria-invalid');
        expect(trigger).toHaveAttribute('aria-describedby', 'times-error');
        await user.click(trigger);
        for (const input of screen.getAllByRole('textbox')) {
            expect(input).toHaveAttribute('aria-invalid', 'true');
            expect(input).toHaveAttribute('aria-describedby', 'times-error');
        }
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
