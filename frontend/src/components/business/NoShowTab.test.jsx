import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import NoShowTab from './NoShowTab';
import ListSearchField from '../common/ListSearchField';

const fixture = vi.hoisted(() => ({ read: vi.fn(), noShow: vi.fn(), complete: vi.fn(), refetch: vi.fn(), undo: vi.fn(), pages: 1 }));
vi.mock('../../hooks/useMyStores', () => ({ default: () => ({ stores: [{ id: 7, name: '합성 가게' }], loading: false }) }));
vi.mock('../../hooks/useManageReservations', () => ({ default: params => {
    fixture.read(params);
    return { reservations: [{ id: 9 }], total: fixture.pages * 15, totalPages: fixture.pages, hasData: true, loading: false, refetching: false,
        noShow: fixture.noShow, complete: fixture.complete, refetch: fixture.refetch, undoNoShow: fixture.undo };
} }));
vi.mock('../reservation/ReservationCard', () => ({ default: ({ reservation, onNoShow, onComplete, onUndoNoShow, view }) => <div>
    <span>예약 {reservation.id}</span><button onClick={() => onNoShow(reservation.id)}>노쇼 확인</button>
    <button onClick={() => onComplete(reservation.id)}>방문 완료</button>
    <button onClick={() => onUndoNoShow(reservation.id)}>노쇼 되돌리기</button><span>{view}</span>
</div> }));
vi.mock('./NoShowMembers', () => ({ default: () => <p>노쇼 인원 표</p> }));
vi.mock('../reservation/ReservationListingToolbar', () => ({ default: props => <>
    <select aria-label={props.statusAriaLabel} value={props.status} onChange={event => props.onStatusChange(event.target.value)}>
        {props.statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select><button onClick={() => props.onViewChange('cards')}>카드 보기</button>
</> }));
vi.mock('../common', () => ({
    DataState: ({ title }) => <div>{title}</div>, ReservationCardSkeleton: () => <div>불러오는 중</div>,
    FilterToolbar: ({ search }) => <ListSearchField {...search} />,
    SegmentedControl: ({ options, onChange }) => options.map(option => <button key={option.value} onClick={() => onChange(option.value)}>{option.label}</button>),
}));

beforeEach(() => { vi.clearAllMocks(); fixture.pages = 1; });

it('검색 확정에서 이전 페이지를 조회하지 않아요', async () => {
    fixture.pages = 3;
    render(<MemoryRouter initialEntries={['/business?tab=no-show&noShowPage=3&noShowStore=7&noShowStatus=NO_SHOW']}><NoShowTab /></MemoryRouter>);
    await waitFor(() => expect(fixture.read.mock.lastCall[0].page).toBe(2));
    fixture.read.mockClear();
    const input = screen.getByPlaceholderText('가게명, 예약자로 검색');
    fireEvent.change(input, { target: { value: '합성 검색' } });
    expect(fixture.read).not.toHaveBeenCalled();
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(fixture.read.mock.lastCall[0]).toMatchObject({ page: 0, search: '합성 검색', storeId: 7, status: 'NO_SHOW' }));
    const applied = fixture.read.mock.calls.map(([query]) => query).filter(query => query.search === '합성 검색');
    expect(applied.map(query => query.page)).not.toContain(2);
    expect(fixture.noShow).not.toHaveBeenCalled(); expect(fixture.complete).not.toHaveBeenCalled();
});

it('허용한 노쇼 상태만 조회하고 조회만으로 확정이나 완료를 실행하지 않아요', async () => {
    render(<MemoryRouter initialEntries={['/business?tab=no-show&noShowStatus=CONFIRMED&noShowStore=7']}><NoShowTab /></MemoryRouter>);
    await waitFor(() => expect(fixture.read).toHaveBeenCalledWith(expect.objectContaining({ status: 'UNCONFIRMED', storeId: 7 })));
    expect(fixture.noShow).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('노쇼 확인 상태'), { target: { value: 'NO_SHOW' } });
    await waitFor(() => expect(fixture.read).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'NO_SHOW', page: 0 })));
    expect(fixture.noShow).not.toHaveBeenCalled();
});

it('노쇼 화면에서도 기존 예약 실행 콜백에 같은 예약 번호만 전달해요', () => {
    render(<MemoryRouter initialEntries={['/business?tab=no-show']}><NoShowTab /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '노쇼 확인' }));
    expect(fixture.noShow).toHaveBeenCalledExactlyOnceWith(9);
    expect(fixture.complete).not.toHaveBeenCalled();
});

it('확정된 노쇼를 카드 보기에서 되돌리며 인원 탭은 별도로 열려요', async () => {
    render(<MemoryRouter initialEntries={['/business?tab=no-show&noShowStatus=NO_SHOW']}><NoShowTab /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '카드 보기' }));
    expect(await screen.findByText('cards')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '노쇼 되돌리기' }));
    expect(fixture.undo).toHaveBeenCalledExactlyOnceWith(9);
    fireEvent.click(screen.getByRole('button', { name: '노쇼 인원' }));
    expect(await screen.findByText('노쇼 인원 표')).toBeInTheDocument();
    expect(screen.queryByText('예약 9')).not.toBeInTheDocument();
});
