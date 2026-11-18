import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SegmentedControl from '../SegmentedControl';
import SegmentedGrid from '../SegmentedGrid';

const options = [
    { value: 'first', label: '첫 항목' },
    { value: 'disabled', label: '비활성 항목', disabled: true },
    { value: 'last', label: '마지막 항목' },
];

function ControlledChoice({ Choice, initialValue = 'first', onChange, ...props }) {
    const [value, setValue] = useState(initialValue);
    return <Choice options={options} value={value} onChange={next => { setValue(next); onChange?.(next); }} {...props} />;
}

describe.each([
    { name: '한 줄 선택', Choice: SegmentedControl },
    { name: '그리드 선택', Choice: SegmentedGrid },
])('$name 키보드 조작', ({ Choice }) => {
    it('선택한 항목으로 한 번만 진입하고 다음 Tab은 그룹을 벗어나요', async () => {
        const user = userEvent.setup();
        render(<><button>이전 도구</button><ControlledChoice Choice={Choice} initialValue="last" aria-label="목록 분류" /><button>다음 도구</button></>);
        await user.tab();
        expect(screen.getByRole('button', { name: '이전 도구' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('radio', { name: '마지막 항목', checked: true })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: '다음 도구' })).toHaveFocus();
        await user.tab({ shift: true });
        expect(screen.getByRole('radio', { name: '마지막 항목' })).toHaveFocus();
    });

    it('방향키는 비활성 항목을 건너뛰고 양 끝에서 순환해요', async () => {
        const user = userEvent.setup();
        const change = vi.fn();
        render(<ControlledChoice Choice={Choice} onChange={change} />);
        await user.tab();
        for (const [key, name, value] of [
            ['ArrowRight', '마지막 항목', 'last'], ['ArrowDown', '첫 항목', 'first'],
            ['ArrowLeft', '마지막 항목', 'last'], ['ArrowUp', '첫 항목', 'first'],
        ]) {
            await user.keyboard(`{${key}}`);
            expect(screen.getByRole('radio', { name, checked: true })).toHaveFocus();
            expect(change).toHaveBeenLastCalledWith(value);
        }
        expect(screen.getByRole('radio', { name: '비활성 항목' })).toBeDisabled();
        expect(change).toHaveBeenCalledTimes(4);
    });

    it('Home과 End는 처음·마지막 활성 항목을 선택하며 현재 선택을 중복 실행하지 않아요', async () => {
        const user = userEvent.setup();
        const change = vi.fn();
        render(<ControlledChoice Choice={Choice} onChange={change} />);
        await user.tab();
        await user.keyboard('{End}');
        expect(screen.getByRole('radio', { name: '마지막 항목', checked: true })).toHaveFocus();
        await user.keyboard('{End}{Home}');
        expect(screen.getByRole('radio', { name: '첫 항목', checked: true })).toHaveFocus();
        expect(change.mock.calls).toEqual([['last'], ['first']]);
    });

    it('선택이 없거나 선택이 비활성이면 첫 활성 항목에 진입해요', () => {
        const { rerender } = render(<Choice options={options} onChange={vi.fn()} />);
        expect(screen.getByRole('radio', { name: '첫 항목' })).toHaveAttribute('tabindex', '0');
        expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(3);
        rerender(<Choice options={options} value="disabled" onChange={vi.fn()} />);
        expect(screen.getByRole('radio', { name: '첫 항목' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('radio', { name: '비활성 항목' })).toHaveAttribute('tabindex', '-1');
    });

    it('그룹이 비활성이면 Tab과 키보드 변경을 막아요', async () => {
        const user = userEvent.setup();
        const change = vi.fn();
        render(<><Choice options={options} value="first" onChange={change} disabled /><button>다음 도구</button></>);
        await user.tab();
        expect(screen.getByRole('button', { name: '다음 도구' })).toHaveFocus();
        for (const radio of screen.getAllByRole('radio')) {
            expect(radio).toBeDisabled();
            expect(radio).toHaveAttribute('tabindex', '-1');
            fireEvent.keyDown(radio, { key: 'ArrowRight' });
        }
        expect(change).not.toHaveBeenCalled();
    });

    it('외부 선택 변경과 개별 비활성화에 맞춰 Tab 진입점을 갱신해요', () => {
        const change = vi.fn();
        const { rerender } = render(<Choice options={options} value="first" onChange={change} />);
        rerender(<Choice options={options} value="last" onChange={change} />);
        expect(screen.getByRole('radio', { name: '마지막 항목' })).toHaveAttribute('tabindex', '0');
        rerender(<Choice options={options.map(option => ({ ...option, disabled: true }))} value="last" onChange={change} />);
        expect(screen.getAllByRole('radio').every(radio => radio.tabIndex === -1)).toBe(true);
        expect(change).not.toHaveBeenCalled();
    });

    it('그룹 이름과 id를 전달하고 제목 요소로도 이름을 연결해요', () => {
        const { rerender } = render(<Choice id="choice" options={options} onChange={vi.fn()} aria-label="문의 유형" />);
        expect(screen.getByRole('radiogroup', { name: '문의 유형' })).toHaveAttribute('id', 'choice');
        rerender(<><h3 id="choice-title">조회 기간</h3><Choice id="choice" options={options} onChange={vi.fn()} aria-labelledby="choice-title" /></>);
        expect(screen.getByRole('radiogroup', { name: '조회 기간' })).toHaveAttribute('id', 'choice');
    });

    it('수정 키를 동반한 단축키는 선택 변경으로 가로채지 않아요', async () => {
        const user = userEvent.setup();
        const change = vi.fn();
        render(<ControlledChoice Choice={Choice} onChange={change} />);
        await user.tab();
        await user.keyboard('{Control>}{ArrowRight}{/Control}');
        expect(screen.getByRole('radio', { name: '첫 항목', checked: true })).toHaveFocus();
        expect(change).not.toHaveBeenCalled();
    });
});
