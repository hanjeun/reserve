import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ListSearchField from './ListSearchField';

function Confirmed({ applied = '', read }) {
    const [value, setValue] = useState(applied);
    return <ListSearchField value={value} placeholder="목록 검색" onSubmit={term => { setValue(term); read(term); }} />;
}

describe('확정형 목록 검색', () => {
    it('입력과 포커스 이탈에는 조회하지 않고 Enter로 정규화한 조건을 한 번 적용해요', async () => {
        const user = userEvent.setup(), read = vi.fn();
        render(<Confirmed read={read} />);
        const input = screen.getByRole('searchbox', { name: '목록 검색' });
        await user.type(input, '  공방  ');
        await user.tab();
        expect(read).not.toHaveBeenCalled();
        expect(screen.queryByRole('status')).toBeNull();
        expect(input).not.toHaveAttribute('aria-describedby');
        await user.click(input); await user.keyboard('{Enter}');
        expect(read).toHaveBeenCalledExactlyOnceWith('공방');
        expect(input).toHaveValue('공방'); expect(input).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(read).toHaveBeenCalledTimes(1);
    });

    it('한글 조합 Enter를 막고 검색 아이콘으로 최종 값을 적용해요', () => {
        const read = vi.fn(); render(<Confirmed read={read} />);
        const input = screen.getByRole('searchbox');
        fireEvent.compositionStart(input);
        fireEvent.change(input, { target: { value: '가게' } });
        expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })).toBe(false);
        fireEvent.submit(screen.getByRole('search'));
        expect(read).not.toHaveBeenCalled();
        fireEvent.compositionEnd(input);
        fireEvent.click(screen.getByRole('button', { name: '검색', exact: true }));
        expect(read).toHaveBeenCalledExactlyOnceWith('가게');
    });

    it('Escape와 같은 조건의 재실행은 요청하지 않고 지우기는 빈 조건을 한 번 적용해요', async () => {
        const user = userEvent.setup(), read = vi.fn();
        render(<Confirmed applied="공방" read={read} />);
        const input = screen.getByRole('searchbox');
        await user.type(input, ' 예약'); await user.keyboard('{Escape}');
        expect(input).toHaveValue('공방'); expect(read).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
        expect(read).toHaveBeenCalledExactlyOnceWith(''); expect(input).toHaveValue('');
    });

    it('외부 조건 변경은 입력을 복원하고 같은 조건의 갱신은 미확정 입력을 유지해요', () => {
        const submit = vi.fn();
        const { rerender } = render(<ListSearchField value="공방" onSubmit={submit} placeholder="목록 검색" />);
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: '새 입력' } });
        rerender(<ListSearchField value="공방" onSubmit={submit} placeholder="목록 검색" />);
        expect(input).toHaveValue('새 입력');
        rerender(<ListSearchField value="카페" onSubmit={submit} placeholder="목록 검색" />);
        expect(screen.getByRole('searchbox')).toBe(input); expect(input).toHaveValue('카페');
        expect(submit).not.toHaveBeenCalled();
    });

    it('받아온 명단의 로컬 검색은 입력 즉시 처리해요', () => {
        const change = vi.fn(); render(<ListSearchField value="" onChange={change} placeholder="이름 검색" />);
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: '예시' } });
        expect(change).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: '검색', exact: true })).toBeNull();
    });
});
