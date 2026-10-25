import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import SearchResults from './SearchResults';
import { searchCatalog } from '../../constants/searchCatalog';

const auth = { user: { id: 7, role: 'USER', termsAgreed: true }, isLoggedIn: true };
const query = () => ({ isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
const emptyGroups = keys => ({ groups: keys.map(key => ({ key, items: [], error: null, hasMore: false })) });
function result(patch = {}) {
    return { keyword: '공방', valid: true, ready: true, confirmed: true, remoteConfirmed: true, catalog: [],
        publicQuery: query(), personalQuery: query(), personalAllowed: true,
        publicData: emptyGroups(['stores', 'benefits', 'feed']), personalData: emptyGroups(['reservations', 'waiting', 'messages']), ...patch };
}
const show = value => {
    const onSubmit = vi.fn(); const onChoose = vi.fn();
    return { onSubmit, onChoose, ...render(<MemoryRouter><SearchResults result={value} onSubmit={onSubmit} onChoose={onChoose} /></MemoryRouter>) };
};
it('renders no result subtree at all for an empty keyword', () => {
    const view = show(result({ keyword: '' }));
    expect(view.container).toBeEmptyDOMElement();
});
it('uses the existing search action row during an unconfirmed draft without loaders or empty groups', () => {
    const view = show(result({ confirmed: false, remoteConfirmed: false }));
    const submit = screen.getByRole('button', { name: '공방 검색하기' });
    expect(submit).toHaveClass('reserve-search-recent-term');
    expect(submit.querySelector('.anticon-search')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull(); expect(view.container.querySelector('.reserve-data-state')).toBeNull();
    expect(view.container.querySelector('.reserve-skeleton-block')).toBeNull();
    fireEvent.click(submit); expect(view.onSubmit).toHaveBeenCalledWith('공방');
});
it('shows an immediately matched menu with the actual account-menu icon and no first-group top margin', () => {
    const view = show(result({ keyword: '내가 예약한', confirmed: false, remoteConfirmed: false, catalog: searchCatalog('내가 예약한', auth) }));
    const link = screen.getByRole('link', { name: '내 예약' });
    expect(link).toHaveAttribute('href', '/my-reservations'); expect(link.querySelector('.anticon-calendar')).toBeTruthy();
    const group = screen.getByRole('heading', { name: '메뉴·기능' }).closest('section');
    expect(group).not.toHaveClass('reserve-search-quick'); expect(group.style.marginTop).toBe('');
    expect(view.container.querySelector('.reserve-skeleton-block')).toBeNull();
});
it('shows headings only for groups with actual results and reuses the corresponding existing icon', () => {
    const value = result(); value.publicData.groups[0].items = [{ id: 81, title: '일치하는 공방', path: '/store/81' }];
    const view = show(value);
    expect(screen.getAllByRole('heading').map(node => node.textContent)).toEqual(['가게']);
    expect(screen.getByRole('link', { name: '일치하는 공방' }).querySelector('.anticon-shop')).toBeTruthy();
    expect(view.container.querySelector('.reserve-data-state')).toBeNull();
});
it('uses one shared three-row skeleton for an explicitly confirmed pending search', () => {
    const value = result(); value.publicQuery.isLoading = true; value.publicQuery.isFetching = true;
    value.personalQuery.isLoading = true; value.personalQuery.isFetching = true;
    const view = show(value);
    expect(screen.getAllByLabelText('검색 결과를 불러오는 중')).toHaveLength(1);
    expect(view.container.querySelectorAll('li.reserve-search-recent-item')).toHaveLength(3);
    expect(screen.queryByRole('heading')).toBeNull(); expect(view.container.querySelector('.reserve-data-state')).toBeNull();
    expect(view.container.querySelectorAll('.reserve-skeleton-block--local')).toHaveLength(9);
});
it('uses exactly one existing generic 3D empty state only after all confirmed results are empty', () => {
    const view = show(result());
    expect(screen.getByText('검색 결과가 없어요.')).toBeInTheDocument();
    expect(view.container.querySelectorAll('.reserve-data-state')).toHaveLength(1);
    expect(view.container.querySelectorAll('.reserve-state-illustration')).toHaveLength(1);
    expect(view.container.querySelector('.reserve-state-illustration img')).toHaveAttribute('src', expect.stringContaining('empty-generic'));
    expect(screen.queryByRole('heading')).toBeNull();
});
it('renders one shared partial-failure retry and preserves successful groups without a false empty state', () => {
    const value = result();
    value.publicData.groups[0].items = [{ id: 81, title: '남아 있는 가게', path: '/store/81' }];
    value.publicData.groups[1].error = { status: 503 }; value.personalData.groups[2].error = { status: 503 };
    show(value);
    expect(screen.getAllByRole('alert')).toHaveLength(1); expect(screen.getByRole('alert')).toHaveTextContent('혜택·메시지');
    expect(screen.getByRole('link', { name: '남아 있는 가게' })).toBeInTheDocument();
    expect(screen.queryByText('검색 결과가 없어요.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(value.publicQuery.refetch).toHaveBeenCalledTimes(1); expect(value.personalQuery.refetch).toHaveBeenCalledTimes(1);
});
