import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { focusActiveListSearch } from '../listSearchFocus';

const visible = input => {
    Object.defineProperty(input, 'getClientRects', { configurable: true, value: () => [{}] });
    input.scrollIntoView = vi.fn();
};
it('focuses the existing visible list input and ignores retained, disabled and non-list controls', () => {
    render(<><input aria-label="다른 검색" />
        <section hidden><div className="reserve-filter-toolbar"><input aria-label="이전 작업 검색" /></div></section>
        <section inert><div className="reserve-filter-toolbar"><input aria-label="잠긴 작업 검색" /></div></section>
        <div className="reserve-filter-toolbar"><input disabled aria-label="불가 검색" /><input aria-label="현재 목록 검색" defaultValue="기존 검색어" /></div></>);
    for (const label of ['다른 검색', '이전 작업 검색', '잠긴 작업 검색', '불가 검색', '현재 목록 검색']) visible(screen.getByLabelText(label));
    const input = screen.getByLabelText('현재 목록 검색');
    expect(focusActiveListSearch(true)).toBe(true);
    expect(input).toHaveFocus(); expect(input).toHaveValue('기존 검색어');
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
});
it('does not focus a collapsed CSS panel or invent navigation when no list input is ready', () => {
    render(<div className="reserve-filter-toolbar"><input aria-label="아직 보이지 않는 목록 검색" /></div>);
    const input = screen.getByLabelText('아직 보이지 않는 목록 검색');
    input.scrollIntoView = vi.fn();
    expect(input.getClientRects()).toHaveLength(0);
    expect(focusActiveListSearch()).toBe(false);
    expect(input).not.toHaveFocus(); expect(input.scrollIntoView).not.toHaveBeenCalled();
});
it('retains normal scrolling for the same visible list control when reduced motion is off', () => {
    render(<div className="reserve-filter-toolbar"><input aria-label="현재 목록 검색" /></div>);
    const input = screen.getByLabelText('현재 목록 검색'); visible(input);
    expect(focusActiveListSearch(false)).toBe(true);
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
});
