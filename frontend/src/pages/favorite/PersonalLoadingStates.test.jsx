import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyFavorites from './MyFavorites';
import MyStores from '../store/MyStores';
import MyReservations from '../reservation/MyReservations';
import PaymentResult from '../payment/PaymentResult';

const state = vi.hoisted(() => ({ query: {}, stores: {}, reservations: {}, refetch: vi.fn(), message: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query, useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../hooks', () => ({
    useMessage: () => ({ message: state.message, confirm: vi.fn() }),
    useMyStores: () => state.stores,
    useReservations: () => state.reservations,
    usePayment: () => ({ pay: vi.fn(), paying: false }),
}));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/feedInteractionQueries', () => ({ useFeedInteractions: () => ({ data: { enabled: false, newsEnabled: false } }) }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => typeof selector === 'function' ? selector({ user: { id: 7 } }) : { user: { id: 7 } } }));
vi.mock('../../components/store', () => ({ StoreCard: ({ store }) => <div>{store.name}</div> }));
vi.mock('../../components/reservation/ReservationRow', () => ({ default: ({ reservation }) => <div>{reservation.storeName}</div> }));
vi.mock('../../components/reservation/ReservationListingToolbar', () => ({ default: () => <div /> }));
vi.mock('../../components/reservation/ReservationDetailModal', () => ({ default: () => null }));
vi.mock('../../components/reservation/QrCodeModal', () => ({ default: () => null }));
vi.mock('../../components/common/FilterMenu', () => ({ default: ({ 'aria-label': label, disabled }) => <button type="button" aria-label={label} disabled={disabled} /> }));
vi.mock('antd', () => ({
    Typography: { Title: ({ children }) => <h2>{children}</h2>, Text: ({ children, role }) => <span role={role}>{children}</span>, Paragraph: ({ children }) => <p>{children}</p> },
    Empty: ({ description }) => <div>{description}</div>,
    Alert: ({ title, action }) => <div role="alert">{title}{action}</div>,
    Modal: ({ open, children }) => open ? <div>{children}</div> : null,
    Flex: ({ children }) => <div>{children}</div>,
    Tooltip: ({ children }) => children,
}));
vi.mock('../../components/common', () => {
    const Card = ({ children }) => <div>{children}</div>;
    Card.Cover = ({ alt }) => <span>{alt}</span>;
    Card.Add = () => <span>가게 추가</span>;
    return {
        PageContainer: ({ children, 'aria-busy': busy }) => <main aria-busy={busy}>{children}</main>,
        Tooltip: ({ children }) => children,
        Button: ({ children, onClick, loading }) => <button onClick={onClick} disabled={loading}>{children}</button>,
        StoreCardSkeleton: () => <span>가게 placeholder</span>,
        MyReservationCardSkeleton: () => <span>예약 placeholder</span>,
        ReservationSummaryCardSkeleton: () => <span>예약 카드 placeholder</span>,
        Bone: () => <span data-testid="bone" />,
        Badge: ({ children }) => <span>{children}</span>,
        ModalLoading: () => <span>불러오는 중</span>,
        SpinIndicator: () => <span />,
        FilterToolbar: () => <div />,
        SegmentedControl: ({ options, value, onChange }) => <div role="group">{options.map(option => <button type="button" key={option.value}
            aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>,
        FilterMenu: ({ 'aria-label': label }) => <button type="button" aria-label={label} />,
        DataState: ({ state: dataState = 'empty', title, subject, onRetry, action }) => (
            <section role={dataState === 'error' ? 'alert' : undefined}>
                <span>{title ?? `${subject ?? '목록'}을 불러오지 못했습니다.`}</span>
                {action ?? (onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>)}
            </section>
        ),
        CopyableText: ({ value }) => <span>{value}</span>,
        Card,
    };
});

const show = (element, path = '/') => render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);

describe('personal page loading presentation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.query = { data: [], isLoading: false, isFetching: false, error: null, refetch: state.refetch };
        state.stores = { stores: [], loading: false, error: null, refetch: state.refetch, deleteStore: vi.fn() };
        state.reservations = { reservations: [], loading: false, refetching: false, error: null, refetch: state.refetch, cancelReservation: vi.fn() };
    });

    it.each([
        { rating: 0, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: 4.8, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: '4.7', reviewCount: '1200', score: '4.7', count: '(1,200)' },
        { rating: 'invalid', reviewCount: 3, score: '0.0', count: '(3)' },
    ])('shows the shared star/rating/count format in owned store cards: %j', values => {
        state.stores.stores = [{ id: 12, name: '내 가게', ...values }];
        const { container } = show(<MyStores />);
        expect(screen.getByText(values.score)).toBeInTheDocument();
        expect(screen.getByText(values.count)).toBeInTheDocument();
        expect(container.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
        expect(container).not.toHaveTextContent('NaN');
    });

    it('shows an initial favorites skeleton instead of an empty list', () => {
        state.query.isLoading = true;
        state.query.isFetching = true;
        show(<MyFavorites />);
        expect(screen.getByRole('status', { name: '즐겨찾기를 불러오는 중' })).toBeInTheDocument();
        expect(screen.queryByText('아직 즐겨찾기한 가게가 없어요.')).toBeNull();
    });

    it.each([undefined, []])('distinguishes a failed favorites query from missing or empty cached data (%j)', data => {
        state.query.data = data;
        state.query.error = Object.assign(new Error('unavailable'), { status: 503 });
        show(<MyFavorites />);
        expect(screen.getByRole('alert')).toHaveTextContent('즐겨찾기 목록을 불러오지 못했습니다.');
        expect(screen.queryByText('아직 즐겨찾기한 가게가 없어요.')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(state.refetch).toHaveBeenCalledTimes(1);
    });

    it('keeps cached favorites visible while the existing list is being refreshed', () => {
        state.query.data = [{ id: 1, storeId: 12, storeName: '내 관심 가게' }];
        state.query.isFetching = true;
        show(<MyFavorites />);
        expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByRole('status', { name: '즐겨찾기를 새로 불러오는 중' })).toBeNull();
        expect(screen.queryByText('가게 placeholder')).toBeNull();
        expect(screen.getByText('내 관심 가게')).toBeInTheDocument();
    });

    it.each([401, 403, 404, 410])('hides cached favorites after an access-denied refresh (%s)', status => {
        state.query.data = [{ id: 1, storeId: 12, storeName: '이전 계정의 관심 가게' }];
        state.query.error = Object.assign(new Error('access denied'), { status });
        show(<MyFavorites />);
        expect(screen.getByRole('alert')).toHaveTextContent('즐겨찾기 목록을 불러오지 못했습니다.');
        expect(screen.queryByText('이전 계정의 관심 가게')).toBeNull();
        expect(screen.queryByText('아직 즐겨찾기한 가게가 없어요.')).toBeNull();
        expect(screen.queryByText('가게 placeholder')).toBeNull();
    });

    it('shows a genuinely empty favorites list only after a successful query', () => {
        show(<MyFavorites />);
        expect(screen.getByText('아직 즐겨찾기한 가게가 없어요.')).toBeInTheDocument();
    });

    it('does not present a failed store query as no registered stores', () => {
        state.stores.error = 'offline';
        show(<MyStores />);
        expect(screen.getByRole('alert')).toHaveTextContent('가게 목록을 불러오지 못했습니다.');
        expect(screen.queryByText(/등록된 가게가 없어요/)).toBeNull();
    });

    it('shows a labeled initial store skeleton', () => {
        state.stores.loading = true;
        show(<MyStores />);
        expect(screen.getByRole('status', { name: '내 가게를 불러오는 중' })).toBeInTheDocument();
    });

    it('distinguishes failed reservations from a successful empty result', () => {
        state.reservations.error = new Error('offline');
        show(<MyReservations />);
        expect(screen.getByRole('alert')).toHaveTextContent('예약 목록을 불러오지 못했습니다.');
        expect(screen.queryByText('예약 내역이 없어요.')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(state.refetch).toHaveBeenCalledTimes(1);
    });

    it('keeps cached reservations visible during a refetch', () => {
        state.reservations.reservations = [{ id: 1, storeName: '이전 예약', status: 'CONFIRMED' }];
        state.reservations.refetching = true;
        show(<MyReservations />);
        expect(screen.getByText('이전 예약')).toBeInTheDocument();
        expect(screen.queryByText('예약 placeholder')).toBeNull();
    });

    it('shows a transaction-specific progress state while awaiting real payment verification', () => {
        state.query = { isPending: true, isFetching: true };
        show(<PaymentResult />, '/payment/result?type=reservation&merchant_uid=order-1');
        expect(screen.getByRole('status', { name: '결제 상태를 확인하는 중' })).toBeInTheDocument();
        expect(screen.getByText('결제 처리 중')).toBeInTheDocument();
        expect(screen.getByText(/같은 결제를 다시 시작하지 마세요/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '내 예약에서 다시 열기' })).toBeInTheDocument();
        expect(screen.queryByText('결제 완료')).toBeNull();
    });

    it('does not display cached paid success while payment is being reverified', () => {
        state.query = { data: { type: 'reservation', merchantUid: 'order-1', status: 'PAID' }, isPending: false, isFetching: true, isError: false };
        show(<PaymentResult />, '/payment/result?type=reservation&merchant_uid=order-1');
        expect(screen.getByRole('status', { name: '결제 상태를 확인하는 중' })).toBeInTheDocument();
        expect(screen.queryByText('결제 완료')).toBeNull();
    });

    it('preserves payment failure guidance and does not invent a successful payment', () => {
        state.query = { isPending: false, isFetching: false, isError: true, refetch: state.refetch };
        show(<PaymentResult />, '/payment/result?type=reservation&merchant_uid=order-1');
        expect(screen.getByText(/이미 금액이 결제됐다면 다시 결제하지 말고/)).toBeInTheDocument();
        expect(screen.queryByText('결제 완료')).toBeNull();
    });

    it('only offers a new payment from the record after a final failed status', () => {
        state.query = {
            data: { type: 'reservation', merchantUid: 'order-1', status: 'FAILED' },
            isPending: false,
            isFetching: false,
            isError: false,
        };
        show(<PaymentResult />, '/payment/result?type=reservation&merchant_uid=order-1');
        expect(screen.getByText('결제가 완료되지 않았어요')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '내 예약에서 다시 결제' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '상태 다시 확인' })).toBeNull();
    });

    it('does not offer a new payment while the server still reports an unresolved status', () => {
        state.query = {
            data: { type: 'reservation', merchantUid: 'order-1', status: 'READY' },
            isPending: false,
            isFetching: false,
            isError: false,
            refetch: state.refetch,
        };
        show(<PaymentResult />, '/payment/result?type=reservation&merchant_uid=order-1');
        expect(screen.getByText('결제 상태를 확인하고 있어요')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '상태 다시 확인' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '내 예약에서 다시 열기' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '내 예약에서 다시 결제' })).toBeNull();
    });
});
