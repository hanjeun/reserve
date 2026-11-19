import { useContext, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminTableSkeleton, Button, DataState, PagedDataTable, FilterToolbar } from '../common';
import { StopOutlined, UndoOutlined } from '../common/icons';
import BookingRestrictionDialog from './BookingRestrictionDialog';
import ListingContent from '../common/ListingContent';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { DEFAULT_PAGE_SIZE } from '../../constants/pagination';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { reservationKeys } from '../../hooks/queryKeys';
import useMessage from '../../hooks/useMessage';
import useQueryParamsState from '../../hooks/useQueryParamState';
import reservationService from '../../services/reservationService';
import useAuthStore from '../../store/useAuthStore';
import { handleApiError } from '../../utils/errorHandler';

const FILTERS = [{ value: 'all', label: '전체' }, { value: 'restricted', label: '수동 제한 중' }, { value: 'available', label: '수동 제한 없음' }];
const SORTS = [{ value: 'recent', label: '최근 노쇼순' }, { value: 'count', label: '노쇼 많은순' }];
const DATE_TIME = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' });
const dateTime = value => value ? DATE_TIME.format(new Date(value)) : '—';
const count = value => (value ?? 0).toLocaleString('ko-KR') + '건';
const selection = (options, value) => options.some(option => option.value === value) ? value : options[0].value;

export default function NoShowMembers({ storeList }) {
    const { stores, loading: storesLoading, error: storesError, refetch: refetchStores } = storeList;
    const active = useContext(WorkspaceActivityContext);
    const ownerId = useAuthStore(state => state.user?.id);
    const revision = useAuthStore(state => state.sessionRevision);
    const [filters, setFilters] = useQueryParamsState({ noShowMemberStore: 'ALL', noShowMemberFilter: 'all',
        noShowMemberSort: 'recent', noShowMemberPage: '1', noShowMemberSearch: '' }, { privateKeys: ['noShowMemberSearch'] });
    const [dialog, setDialog] = useState(null);
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const selectedStore = stores.find(store => String(store.id) === filters.noShowMemberStore);
    const storeId = selectedStore?.id;
    const hasStores = stores.length > 0;
    const pageValue = Number(filters.noShowMemberPage);
    const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const params = { filter: selection(FILTERS, filters.noShowMemberFilter), sort: selection(SORTS, filters.noShowMemberSort),
        search: filters.noShowMemberSearch.trim() || undefined, page: page - 1, size: DEFAULT_PAGE_SIZE };
    const query = useQuery({ queryKey: reservationKeys.noShowMembers(ownerId, storeId, params),
        queryFn: ({ signal }) => reservationService.getNoShowMembers(storeId, params, signal),
        enabled: active && ownerId != null && hasStores, staleTime: 60000,
        placeholderData: (previous, previousQuery) => {
            const key = previousQuery?.queryKey;
            const previousParams = key?.at(-1);
            return key?.at(-3) === ownerId && key?.at(-2) === storeId && previousParams?.filter === params.filter
                && previousParams.sort === params.sort && previousParams.search === params.search ? previous : undefined;
        } });
    const rows = query.data?.content ?? [];
    const total = query.data?.page?.totalElements ?? query.data?.totalElements ?? 0;
    const blocking = isBlockingListReadError(query.error, rows);
    const scope = [ownerId, revision, storeId].join(':');
    const close = () => setDialog(previous => previous ? { ...previous, open: false } : null);
    const action = useMutation({
        mutationFn: ({ member, target, period, reason }) => member.restrictionId == null
            ? reservationService.restrictNoShowMember(target, member.memberId, {
                ...(period === 'permanent' ? { permanent: true } : { days: period }), reason: reason.trim(),
            })
            : reservationService.releaseNoShowMember(target, member.restrictionId),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({ queryKey: [...reservationKeys.manage(), 'no-show-members', variables.owner] });
            const auth = useAuthStore.getState();
            if (auth.user?.id !== variables.owner || auth.sessionRevision !== variables.revision) return;
            close();
            message.success(variables.member.restrictionId == null ? '이 가게의 새 예약을 제한했어요.' : '수동 예약 제한을 해제했어요.');
        },
        onError: (error, variables) => {
            const auth = useAuthStore.getState();
            if (auth.user?.id === variables.owner && auth.sessionRevision === variables.revision) handleApiError(error, message);
        },
    });
    useEffect(() => {
        const last = Math.max(query.data?.page?.totalPages ?? query.data?.totalPages ?? 1, 1);
        if (query.data && !query.isFetching && !query.error && page > last) setFilters({ noShowMemberPage: String(last) });
    }, [page, query.data, query.error, query.isFetching, setFilters]);

    const change = patch => setFilters({ ...patch, noShowMemberPage: '1' });
    const reload = () => !hasStores || storesError ? refetchStores() : query.refetch();
    const open = member => setDialog({ member, target: member.storeId ?? storeId, storeName: member.storeName ?? selectedStore?.name,
        owner: ownerId, revision, scope, open: true, period: 7, reason: '' });
    const release = dialog?.member.restrictionId != null;
    const dialogOpen = Boolean(active && dialog?.open && dialog.scope === scope);
    const submit = () => {
        const auth = useAuthStore.getState();
        if (dialogOpen && auth.isLoggedIn && auth.user?.id === dialog.owner && auth.sessionRevision === dialog.revision
            && !action.isPending && (release || dialog.reason.trim())) action.mutate(dialog);
    };
    const columns = [
        { title: '사용자', dataIndex: 'name', width: 133, render: value => value ?? '조회 기간 만료' },
        ...(storeId == null ? [{ title: '가게', dataIndex: 'storeName', width: 140, ellipsis: true }] : []),
        { title: '회원 번호', dataIndex: 'memberId', width: 96, render: value => value ?? '—' },
        { title: '최근 30일 확정', dataIndex: 'recentCount', width: 125, render: count },
        { title: '보관 건수', dataIndex: 'retainedCount', width: 100, render: count },
        { title: '최근 노쇼', dataIndex: 'latestNoShowDate', width: 116, render: value => value ?? '—' },
        { title: '마지막 확정', dataIndex: 'latestConfirmedAt', width: 160, render: dateTime },
        { title: '자동 제한 종료', dataIndex: 'automaticUntil', width: 160, render: dateTime },
        { title: '수동 제한 종료', dataIndex: 'manualUntil', width: 160, render: (value, row) => row.permanent ? '영구 제한' : dateTime(value) },
        { title: '제한 사유', dataIndex: 'reason', width: 190, ellipsis: true, render: value => value ?? '—' },
        { title: '관리', key: 'manage', width: 132, render: (_, row) => row.restrictionId != null
            ? <Button variant="ghost-sm" disabled={action.isPending || Boolean(query.error)} onClick={() => open(row)}><UndoOutlined aria-hidden="true" /> 제한 해제</Button>
            : row.restrictable && <Button variant="ghost-sm-danger" disabled={action.isPending || Boolean(query.error)}
                onClick={() => open(row)}><StopOutlined aria-hidden="true" /> 예약 제한</Button> },
    ];

    return <div className="reserve-no-show-tab">
        <FilterToolbar selects={[
            { value: storeId == null ? 'ALL' : String(storeId), options: [{ value: 'ALL', label: '전체 가게' },
                ...stores.map(store => ({ value: String(store.id), label: store.name }))], fitContent: true,
                ariaLabel: '노쇼 인원 가게', loading: storesLoading, onChange: value => change({ noShowMemberStore: value }) },
            { value: params.filter, options: FILTERS, fitContent: true, ariaLabel: '수동 제한 상태',
                onChange: value => change({ noShowMemberFilter: value }) },
            { value: params.sort, options: SORTS, fitContent: true, ariaLabel: '노쇼 인원 정렬',
                onChange: value => change({ noShowMemberSort: value }) },
        ]} count={query.data && !blocking ? total : null} search={{ value: filters.noShowMemberSearch, disabled: !hasStores,
            onSubmit: value => change({ noShowMemberSearch: value }), placeholder: '사용자 이름, 회원 번호 검색' }}
            onReload={reload} loading={storesLoading || query.isFetching} initialLoading={storesLoading || query.isLoading} />
        <ListingContent notice={query.error && !blocking && <DataState state="error" error={query.error}
            title="최신 노쇼 인원을 확인하지 못했어요." onRetry={reload} retrying={query.isFetching} compact />}>
            {storesLoading ? <AdminTableSkeleton /> :
                storesError || blocking ? <DataState state="error" error={storesError ?? query.error}
                    title="노쇼 인원을 불러오지 못했어요." onRetry={reload} retrying={query.isFetching} /> :
                    !hasStores ? <DataState state="empty" kind="reservation" title="관리할 가게가 없어요." /> :
                        <PagedDataTable columns={columns} dataSource={rows} stickyFirstColumn
                            placeholder={(query.isPending || query.isPlaceholderData) && <AdminTableSkeleton
                                cols={columns.map(column => column.width)} headers={columns.map(column => column.title)} />}
                            rowKey={row => `${row.storeId ?? storeId}:${row.memberId == null ? `restriction-${row.restrictionId}` : `member-${row.memberId}`}`}
                            locale={{ emptyText: '조건에 맞는 노쇼 인원이 없어요.' }}
                            pagination={{ current: page, total, hideOnSinglePage: true,
                                onChange: value => setFilters({ noShowMemberPage: String(value) }) }} />}
        </ListingContent>
        <BookingRestrictionDialog dialog={dialog} open={dialogOpen} onClose={close}
            afterClose={() => setDialog(previous => previous?.open && previous.scope === scope ? previous : null)}
            onSubmit={submit} submitting={action.isPending}
            onChange={patch => setDialog(previous => ({ ...previous, ...patch }))} />
    </div>;
}
