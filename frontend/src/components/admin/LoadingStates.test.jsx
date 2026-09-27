import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAdsTab from './AdminAdsTab';
import AuditLogTab from './AuditLogTab';
import BusinessVerificationTab from './BusinessVerificationTab';
import MembersTab from './MembersTab';
import StoresAdminTab from './StoresAdminTab';
import ReservationsAllTab from './ReservationsAllTab';
import TrashTab from './TrashTab';
import PaymentOperationsTab from './PaymentOperationsTab';
import MailboxTab from './MailboxTab';
import ChatTab from './ChatTab';
import AdManageTab from '../advertisement/AdManageTab';
import StatisticsTab from '../business/StatisticsTab';
import BusinessPanel from '../../pages/business/BusinessPanel';

const state = vi.hoisted(() => ({
    query: {}, stores: {}, thread: {}, reload: vi.fn(), apiGet: vi.fn(), renderBusinessRows: false,
    queryOptions: null, dataTableProps: null, setQueryParams: vi.fn(), queryParams: null,
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: (options) => {
        state.queryOptions = options;
        return state.query;
    },
    useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueriesData: vi.fn(), setQueryData: vi.fn() }),
    useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
    keepPreviousData: (value) => value,
}));
vi.mock('../../api/axios', () => ({ default: { get: state.apiGet, post: vi.fn(), delete: vi.fn() } }));
vi.mock('../../hooks', () => ({
    useMessage: () => ({ message: { error: vi.fn(), success: vi.fn() }, confirm: vi.fn() }),
    useQueryParamsState: (defaults) => [state.queryParams ?? defaults, state.setQueryParams],
    useWindowWidth: () => 390,
    useMyStores: () => state.stores,
    useAdPayment: () => ({ pay: vi.fn(), payExisting: vi.fn(), paying: false, payingId: null }),
    useImagePreview: () => ({ handlePreview: vi.fn(), suppressLinkNavigation: vi.fn(), previewNode: null }),
    useFormErrors: () => ({ errors: {}, validate: vi.fn(), clearError: vi.fn(), resetErrors: vi.fn() }),
}));
vi.mock('../../hooks/useDebounce', () => ({ default: (value) => value }));
vi.mock('../../hooks/useChatThread', () => ({ default: () => state.thread }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { error: vi.fn(), success: vi.fn() }, confirm: vi.fn() }) }));
vi.mock('../../hooks/useWindowWidth', () => ({ useWindowWidth: () => 390 }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useManageReservations', () => ({ default: () => ({
    reservations: [], total: 0, totalPages: 0, error: null, loading: false, refetching: false,
    actionLoading: null, refetch: vi.fn(),
}) }));
vi.mock('../reservation/QrScannerTab', () => ({ default: () => null }));
vi.mock('../chat/ChatBubbleList', () => ({ default: () => <div data-testid="chat-bubbles" /> }));
vi.mock('../common/Skeletons', () => ({ Bone: () => <div data-testid="bone" /> }));
vi.mock('../common', () => {
    const Placeholder = () => null;
    return {
        AdminTableSkeleton: () => <div data-testid="table-skeleton" />,
        DataTable: ({ columns = [], dataSource = [], ...props }) => {
            state.dataTableProps = { columns, dataSource, ...props };
            const actions = columns.find(column => column.key === 'actions');
            return <div data-testid="data-table">
                {state.renderBusinessRows && actions && dataSource.map(row => (
                    <div key={row.id}>{actions.render(null, row)}</div>
                ))}
            </div>;
        },
        DataState: ({ state: dataState = 'empty', title, subject, onRetry }) => <section role={dataState === 'error' ? 'alert' : undefined}>
            <span>{title ?? `${subject ?? '목록'}을 불러오지 못했습니다.`}</span>
            {onRetry && <button onClick={onRetry}>다시 불러오기</button>}
        </section>,
        FilterToolbar: ({ selects }) => <><button onClick={state.query.refetch}>새로고침</button>{selects?.[0]?.options?.[0]?.label === '전체 가게' && <button disabled={selects[0].disabled}>가게 필터</button>}</>,
        FilterMenu: ({ value, options = [], disabled, loading, ...props }) => <button disabled={disabled} aria-busy={loading || undefined} {...props}>{options.find(option => option.value === value)?.label}</button>,
        PageContainer: ({ children }) => <div>{children}</div>,
        ReservationCardSkeleton: Placeholder,
        RefreshButton: ({ onReload }) => <button onClick={onReload}>새로고침</button>,
        Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
        UnreadPill: Placeholder,
        SegmentedControl: Placeholder,
        FormModal: Placeholder,
        FormInput: Placeholder,
        FormTextArea: Placeholder,
        FormField: Placeholder,
        FormSelect: Placeholder,
        FormDatePicker: { RangePicker: Placeholder },
        ModalLoading: Placeholder,
        FilterSelect: Placeholder,
        StatCard: ({ label, value, loading }) => <div>{label}: {loading ? '준비 중' : value}</div>,
        ChartCard: ({ children }) => <div>{children}</div>,
        PieLegend: Placeholder,
    };
});

const TABLE_TABS = [
    ['광고 관리', AdminAdsTab], ['시스템 로그', AuditLogTab],
    ['사업자 인증', BusinessVerificationTab], ['회원', MembersTab],
    ['가게', StoresAdminTab], ['예약', ReservationsAllTab],
    ['휴지통', TrashTab], ['결제 운영', PaymentOperationsTab],
];
const PLACEHOLDER_TABLE_TABS = TABLE_TABS;

beforeEach(() => {
    state.reload.mockReset();
    state.apiGet.mockReset();
    state.setQueryParams.mockReset();
    state.queryOptions = null;
    state.dataTableProps = null;
    state.queryParams = null;
    state.renderBusinessRows = false;
    state.query = {
        data: undefined, isLoading: false, isPending: false, isFetching: false, isPlaceholderData: false,
        error: null, isError: false, refetch: vi.fn(),
    };
    state.stores = { stores: [], loading: false, error: null, refetch: vi.fn() };
    state.thread = { messages: [], loading: false, loadError: false, reload: state.reload, sending: false, send: vi.fn() };
});

describe.each(TABLE_TABS)('%s loading states', (_label, Component) => {
    it('shows the existing skeleton while loading', () => {
        Object.assign(state.query, { isLoading: true, isPending: true, isFetching: true });
        render(<Component />);
        expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
        expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
    });

    it('keeps rendered rows during a cached manual refresh', () => {
        state.query.data = Component === TrashTab ? { items: [], totalElements: 12 } : {
            content: [], ads: [], logs: [], items: [], members: [], stores: [], reservations: [],
            totalElements: 12, page: { totalElements: 12 },
        };
        state.query.isFetching = true;
        render(<Component />);
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
        expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
    });

    it('does not present a failed request as a successful empty table', () => {
        Object.assign(state.query, { isError: true, error: new Error('offline') });
        render(<Component />);
        expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했습니다');
        expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        expect(state.query.refetch).toHaveBeenCalledOnce();
    });

    it('keeps successful zero results in the normal table', () => {
        if (Component === TrashTab) state.query.data = { items: [], totalElements: 0 };
        render(<Component />);
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe.each(PLACEHOLDER_TABLE_TABS)('%s query transitions', (_label, Component) => {
    it('uses the table skeleton while retained rows belong to the previous query', () => {
        void _label;
        state.query.data = Component === TrashTab ? { items: [], totalElements: 12 } : {
            content: [], ads: [], logs: [], items: [], members: [], stores: [], reservations: [],
            totalElements: 12, page: { totalElements: 12 },
        };
        Object.assign(state.query, { isFetching: true, isPlaceholderData: true });
        render(<Component />);
        expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
        expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
    });
});

it('keeps a mail lookup failure separate from the empty mailbox', () => {
    Object.assign(state.query, { isError: true, error: new Error('offline') });
    render(<MailboxTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('보낸 메일을 불러오지 못했습니다');
    expect(screen.queryByText('보낸 메일이 없습니다')).not.toBeInTheDocument();
});

it('keeps the mailbox trash action in the selected detail only', () => {
    state.query.data = {
        mails: [{
            id: 31,
            toEmail: 'member@example.com',
            subject: '테스트 메일',
            bodyPreview: '본문 미리보기',
            body: '본문',
            sentAt: '2026-09-22T10:00:00',
        }],
        totalElements: 1,
    };

    render(<MailboxTab />);

    expect(screen.queryByRole('button', { name: /메일을 휴지통으로/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('테스트 메일'));
    expect(screen.getByRole('button', { name: /휴지통$/ })).toBeInTheDocument();
});

it('keeps an ad lookup failure separate from the empty ad table', () => {
    Object.assign(state.query, { isError: true, error: new Error('offline') });
    render(<AdManageTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('광고 목록을 불러오지 못했습니다');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
});

it('keeps ads visible and retries the failed store filter from the result area', () => {
    const refetchStores = vi.fn();
    state.stores = { stores: [], loading: false, error: new Error('offline'), refetch: refetchStores };
    state.query.data = { ads: [], totalElements: 0 };
    render(<AdManageTab />);

    expect(screen.getByRole('alert')).toHaveTextContent('가게 필터 목록을 불러오지 못했습니다');
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(refetchStores).toHaveBeenCalledOnce();
});

it('requests the paged business ad contract and wires Spring Boot page metadata to the table', async () => {
    state.apiGet
        .mockResolvedValueOnce({ content: [{ id: 21, storeName: '광고 가게' }], page: { totalElements: 41 } })
        .mockResolvedValueOnce({ content: [], totalElements: 7 });
    const { rerender } = render(<AdManageTab />);

    expect(state.queryOptions.queryKey).toEqual(['ads', 'my', {
        page: 0, size: 20, storeFilter: 'ALL', search: '',
    }]);
    await expect(state.queryOptions.queryFn()).resolves.toEqual({
        ads: [{ id: 21, storeName: '광고 가게' }],
        totalElements: 41,
    });
    expect(state.apiGet).toHaveBeenNthCalledWith(1, '/api/advertisements/my', {
        params: { page: 0, size: 20 },
    });
    await expect(state.queryOptions.queryFn()).resolves.toEqual({ ads: [], totalElements: 7 });

    state.query.data = { ads: [{ id: 21, storeName: '광고 가게' }], totalElements: 41 };
    rerender(<AdManageTab />);
    expect(state.dataTableProps.pagination).toMatchObject({ current: 1, pageSize: 20, total: 41 });
    state.dataTableProps.pagination.onChange(2);
    expect(state.setQueryParams).toHaveBeenCalledWith({ advertisementPage: '1' });
});

it('sends business ad filters to the server page query', async () => {
    state.queryParams = {
        advertisementSearch: ' 스튜디오 ',
        advertisementStore: '42',
        advertisementPage: '1',
    };
    state.apiGet.mockResolvedValueOnce({ content: [], page: { totalElements: 0 } });
    render(<AdManageTab />);

    expect(state.queryOptions.queryKey).toEqual(['ads', 'my', {
        page: 1, size: 20, storeFilter: '42', search: '스튜디오',
    }]);
    await state.queryOptions.queryFn();
    expect(state.apiGet).toHaveBeenCalledWith('/api/advertisements/my', {
        params: { page: 1, size: 20, storeId: 42, search: '스튜디오' },
    });
});

it('keeps a store lookup failure separate from zero stores in statistics', () => {
    state.stores.error = 'offline';
    render(<StatisticsTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('가게 목록을 불러오지 못했습니다');
    expect(screen.queryByText('등록된 가게가 없습니다.')).not.toBeInTheDocument();
});

it('does not fabricate zero revenue or reviews when statistics fail', () => {
    state.stores.stores = [{ id: 31, name: '가게31' }];
    Object.assign(state.query, { isError: true, error: new Error('offline') });
    render(<StatisticsTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('통계를 불러오지 못했습니다');
    expect(screen.queryByText(/예약금 순결제액:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/리뷰 수:/)).not.toBeInTheDocument();
});

it('labels retained statistics when a refresh fails', () => {
    state.stores.stores = [{ id: 31, name: '가게31' }];
    Object.assign(state.query, { data: { totalDepositRevenue: 2000, reviewCount: 3 }, isError: true, error: new Error('offline') });
    render(<StatisticsTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('이전 조회 결과');
    expect(screen.getByText('예약금 순결제액: 2,000')).toBeInTheDocument();
});

it('shows conversation bones before the first admin thread response', () => {
    state.query.data = { content: [{ id: 21, memberName: '손님', adminUnread: 0 }] };
    state.thread.loading = true;
    render(<ChatTab />);
    fireEvent.click(screen.getByRole('button', { name: '손님' }));
    expect(screen.getByRole('status', { name: '대화를 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByTestId('chat-bubbles')).not.toBeInTheDocument();
});

it('offers the existing thread reload on admin conversation failure', () => {
    state.query.data = { content: [{ id: 21, memberName: '손님', adminUnread: 0 }] };
    state.thread.loadError = true;
    render(<ChatTab />);
    fireEvent.click(screen.getByRole('button', { name: '손님' }));
    expect(screen.getByRole('alert')).toHaveTextContent('대화를 불러오지 못했습니다');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(state.reload).toHaveBeenCalledOnce();
});

it('disables the partner store filter until its shared lookup is ready', () => {
    state.stores = { stores: [], loading: true, error: null, refetch: vi.fn() };
    const { rerender } = render(<MemoryRouter><BusinessPanel /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '가게 필터' })).toBeDisabled();
    state.stores = { stores: [], loading: false, error: null, refetch: vi.fn() };
    rerender(<MemoryRouter><BusinessPanel /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '가게 필터' })).toBeEnabled();
});

it('offers an explicit retry when the shared partner store lookup fails', () => {
    const refetchStores = vi.fn();
    state.stores = { stores: [], loading: false, error: new Error('offline'), refetch: refetchStores };
    const { rerender } = render(<MemoryRouter><BusinessPanel /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('가게별 필터');
    expect(screen.getByRole('button', { name: '가게 필터' })).toBeDisabled();
    // 가게 목록은 필터용일 뿐이다. 그게 실패해도 예약 영역(여기서는 빈 상태)은 그대로 그려져야 한다.
    expect(screen.getByText('예약 내역이 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(refetchStores).toHaveBeenCalledOnce();
    state.stores = { stores: [], loading: false, error: null, refetch: refetchStores };
    rerender(<MemoryRouter><BusinessPanel /></MemoryRouter>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가게 필터' })).toBeEnabled();
});

it('keeps a failed business verification detail open and retries only that item', async () => {
    state.renderBusinessRows = true;
    state.query.data = {
        items: [{ id: 73, memberId: 31, memberName: '테스트 회원', memberEmail: 'member@example.com', businessName: '테스트 상호', status: 'APPROVED' }],
        totalElements: 1,
    };
    state.apiGet
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ id: 73, memberName: '테스트 회원', memberEmail: 'member@example.com', businessName: '테스트 상호', status: 'APPROVED' });
    render(<BusinessVerificationTab />);

    fireEvent.click(screen.getByRole('button', { name: /상세보기/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('상세 정보를 불러오지 못했습니다.');
    expect(screen.getByRole('dialog', { name: '사업자 인증 상세' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(state.apiGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('테스트 상호')).toBeInTheDocument();
});

it('marks QR check-in as the active partner tab only while its sheet is open', async () => {
    render(<MemoryRouter><BusinessPanel /></MemoryRouter>);
    const reservationsTab = screen.getByRole('tab', { name: /예약 관리$/ });
    const qrTab = screen.getByRole('tab', { name: /QR 체크인$/ });

    fireEvent.click(qrTab);
    expect(qrTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('dialog', { name: 'QR 체크인' })).toBeInTheDocument();

    fireEvent.click(document.querySelector('.reserve-qr-sheet .ant-modal-close'));
    await waitFor(() => expect(reservationsTab).toHaveAttribute('aria-selected', 'true'));
});
