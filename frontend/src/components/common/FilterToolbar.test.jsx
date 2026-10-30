import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FilterToolbar from './FilterToolbar';
import { LiveUpdatesContext } from '../../hooks/useLiveUpdatesStatus';

const select = {
    key: 'status',
    ariaLabel: '상태 필터',
    value: 'ALL',
    onChange: vi.fn(),
    options: [
        { value: 'ALL', label: '전체 상태' },
        { value: 'OPEN', label: '대기 중' },
    ],
};

describe('FilterToolbar', () => {
    it('keeps the search and refresh slots in the first-loading skeleton until the real toolbar is ready', () => {
        const props = { search: { value: '공방', onChange: vi.fn(), placeholder: '가게 검색' }, onReload: vi.fn() };
        const { container, rerender } = render(<FilterToolbar {...props} initialLoading />);
        const skeleton = container.querySelector('.reserve-filter-toolbar');
        expect(skeleton).toHaveAttribute('aria-hidden', 'true');
        const row = skeleton.querySelector('.reserve-filter-toolbar-secondary');
        expect(row.children).toHaveLength(2);
        expect(row.lastElementChild).toHaveClass('reserve-filter-toolbar-refresh');
        expect(screen.queryByPlaceholderText('가게 검색')).toBeNull();
        expect(screen.queryByRole('button', { name: '새로고침' })).toBeNull();
        rerender(<FilterToolbar {...props} />);
        expect(screen.getByPlaceholderText('가게 검색')).toHaveValue('공방');
        expect(screen.getByRole('button', { name: '새로고침' })).toBeEnabled();
    });

    it('reuses the compact menu toolbar for filtered list pages', () => {
        const { container } = render(
            <FilterToolbar
                selects={[select]}
                count={12}
                search={{ value: '', onChange: vi.fn(), placeholder: '이름으로 검색' }}
                onReload={vi.fn()}
            />,
        );

        expect(container.querySelector('.reserve-explore-filters')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '상태 필터' })).toHaveTextContent('전체 상태');
        expect(screen.getByText('12건')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('이름으로 검색')).toBeEnabled();
        expect(screen.getByRole('button', { name: '새로고침' })).toBeEnabled();

        const controls = container.querySelector('.reserve-filter-toolbar-controls');
        expect(controls).toContainElement(screen.getByText('12건'));
        expect(screen.getByRole('button', { name: '상태 필터' })).toHaveStyle({ width: 'fit-content' });
    });

    it('keeps menus, search and the last count usable during background reads', () => {
        render(
            <FilterToolbar
                selects={[select]}
                count={12}
                search={{ value: '', onChange: vi.fn(), placeholder: '이름으로 검색' }}
                onReload={vi.fn()}
                loading
            />,
        );

        expect(screen.getByRole('button', { name: '상태 필터' })).toBeEnabled();
        expect(screen.getByPlaceholderText('이름으로 검색')).toBeEnabled();
        expect(screen.getByText('12건')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled();
    });

    it.each([false, true])('재조회 중에도 같은 검색창과 입력 포커스를 유지해요 (%s)', withMenu => {
        const search = { value: '', onChange: vi.fn(), placeholder: '연속 입력' };
        const controls = loading => <FilterToolbar selects={withMenu ? [select] : []} search={search} initialLoading={loading} />;
        const { rerender } = render(controls(false));
        const input = screen.getByPlaceholderText('연속 입력');
        input.focus();
        search.value = '가'; rerender(controls(true));
        expect(screen.getByPlaceholderText('연속 입력')).toBe(input);
        expect(input).toHaveFocus(); expect(input).toBeEnabled();
        fireEvent.change(input, { target: { value: '가게' } });
        expect(search.onChange).toHaveBeenCalledTimes(1);
        search.value = '가게'; rerender(controls(false));
        expect(input).toHaveValue('가게'); expect(input).toHaveFocus();
    });
    it('hides refresh only after the server advertises support for this screen', () => {
        const toolbar = <FilterToolbar search={{ value: '카페', onChange: vi.fn() }} onReload={vi.fn()} autoRefreshDomain="WAITING" />;
        const { rerender } = render(<LiveUpdatesContext.Provider value={{ present: true, connected: false, domains: [] }}>{toolbar}</LiveUpdatesContext.Provider>);
        expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
        rerender(<LiveUpdatesContext.Provider value={{ present: true, connected: true, domains: ['NEWS'] }}>{toolbar}</LiveUpdatesContext.Provider>);
        expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
        rerender(<LiveUpdatesContext.Provider value={{ present: true, connected: true, domains: ['WAITING'] }}>{toolbar}</LiveUpdatesContext.Provider>);
        expect(screen.queryByRole('button', { name: '새로고침' })).toBeNull();
        expect(screen.getByDisplayValue('카페')).toBeEnabled();
    });

    it('keeps an adjacent period control beside the store menu', () => {
        const { container } = render(
            <FilterToolbar
                selects={[select]}
                extra={<div role="radiogroup" aria-label="조회 기간"><button type="button">7일</button></div>}
                onReload={vi.fn()}
            />,
        );

        const controls = container.querySelector('.reserve-filter-toolbar-controls');
        expect(controls).toContainElement(screen.getByRole('button', { name: '상태 필터' }));
        expect(controls).toContainElement(screen.getByRole('radiogroup', { name: '조회 기간' }));
    });

    it('keeps search on the left and refresh at the far right', () => {
        const { container } = render(
            <FilterToolbar
                search={{ value: '', onChange: vi.fn(), placeholder: '가게명으로 검색' }}
                onReload={vi.fn()}
            />,
        );

        const row = container.querySelector('.reserve-filter-toolbar-secondary');
        const refreshSlot = container.querySelector('.reserve-filter-toolbar-refresh');
        expect(row.firstElementChild).toContainElement(screen.getByPlaceholderText('가게명으로 검색'));
        expect(row.lastElementChild).toBe(refreshSlot);
        expect(refreshSlot).toContainElement(screen.getByRole('button', { name: '새로고침' }));
    });

    it('can keep a compact roller on the left and refresh on the right', () => {
        const { container } = render(
            <FilterToolbar
                extra={<div role="radiogroup" aria-label="신고 상태" />}
                count={0}
                onReload={vi.fn()}
                spread
            />,
        );

        expect(container.querySelector('.reserve-filter-toolbar-secondary')).toHaveClass('reserve-filter-toolbar-secondary--spread');
        expect(screen.getByRole('radiogroup', { name: '신고 상태' })).toBeInTheDocument();
        expect(container.querySelector('.reserve-filter-toolbar-refresh')).toContainElement(
            screen.getByRole('button', { name: '새로고침' }),
        );
    });
});
