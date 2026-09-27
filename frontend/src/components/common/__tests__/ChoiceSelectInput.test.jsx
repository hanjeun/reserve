import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FormSelect from '../FormSelect';
import FilterSelect from '../FilterSelect';

const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];

describe.each([{ label: 'form', Select: FormSelect }, { label: 'filter', Select: FilterSelect }])('$label select input intent', ({ Select }) => {
    const mount = props => render(createElement(Select, props));
    it('keeps a choice-only combobox focusable without requesting a virtual keyboard', async () => {
        const user = userEvent.setup();
        const change = vi.fn();
        mount({ 'aria-label': '항목 선택', defaultValue: 'a', options, onChange: change });
        const input = screen.getByRole('combobox', { name: '항목 선택' });
        expect(input).toHaveAttribute('readonly');
        expect(input).toHaveAttribute('inputmode', 'none');
        await user.tab();
        expect(input).toHaveFocus();
        // rc-select은 which로 방향키를 구분한다. jsdom/userEvent의 which=0과 실제 키 이벤트를 구분한다.
        fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 40, which: 40 });
        fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 40, which: 40 });
        fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, which: 13 });
        await waitFor(() => expect(change).toHaveBeenCalledWith('b', expect.objectContaining({ value: 'b' })));
        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it.each([true, { optionFilterProp: 'label' }])('preserves deliberate search typing for %j', async showSearch => {
        const user = userEvent.setup();
        mount({ 'aria-label': '검색 선택', options, showSearch });
        const input = screen.getByRole('combobox', { name: '검색 선택' });
        expect(input).not.toHaveAttribute('readonly');
        expect(input).not.toHaveAttribute('inputmode', 'none');
        await user.type(input, 'Beta');
        expect(input).toHaveValue('Beta');
    });

    it.each(['multiple', 'tags'])('preserves the existing editable %s mode', mode => {
        mount({ 'aria-label': '여러 항목 선택', options, mode });
        expect(screen.getByRole('combobox')).not.toHaveAttribute('readonly');
        expect(screen.getByRole('combobox')).not.toHaveAttribute('inputmode', 'none');
    });

    it('honors an explicitly choice-only multiple mode and disabled state', () => {
        const { rerender } = mount({ options, mode: 'multiple', showSearch: false });
        expect(screen.getByRole('combobox')).toHaveAttribute('readonly');
        expect(screen.getByRole('combobox')).toHaveAttribute('inputmode', 'none');
        rerender(createElement(Select, { options, disabled: true }));
        expect(screen.getByRole('combobox')).toBeDisabled();
        fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown', keyCode: 40, which: 40 });
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    });
});
