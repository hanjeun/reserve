import { useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { AdminTableSkeleton, Button, DataState, FilterToolbar, PagedDataTable } from '../common';
import { FlagOutlined, UserOutlined } from '../common/icons';
import ListingContent from '../common/ListingContent';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { DEFAULT_PAGE_SIZE } from '../../constants/pagination';
import { useMyStores } from '../../hooks';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { reservationKeys } from '../../hooks/queryKeys';
import useQueryParamsState from '../../hooks/useQueryParamState';
import useAuthStore from '../../store/useAuthStore';
import reservationService from '../../services/reservationService';
import MyServiceReports from '../report/MyServiceReports';
import CustomerHistoryDialog from './CustomerHistoryDialog';

const count = value => `${value ?? 0}건`;
const rating = value => value == null ? '—' : `${value}점`;

export default function CustomersTab() {
    const active = useContext(WorkspaceActivityContext);
    const ownerId = useAuthStore(state => state.user?.id);
    const session = useAuthStore(state => state.sessionRevision);
    const { stores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const [filters, setFilters] = useQueryParamsState({ customerStore: 'ALL', customerPage: '1', customerSearch: '' }, { privateKeys: ['customerSearch'] });
    const [customer, setCustomer] = useState(null);
    const [customerOpen, setCustomerOpen] = useState(false);
    const [reportsOpen, setReportsOpen] = useState(false);
    const availableStore = stores.find(store => String(store.id) === filters.customerStore);
    const storeId = availableStore?.id;
    const search = filters.customerSearch.trim();
    const requestedPage = Number(filters.customerPage);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const list = useQuery({ queryKey: [...reservationKeys.customers(ownerId, session), 'list', storeId, search, page],
        enabled: active && ownerId != null && stores.length > 0,
        queryFn: ({ signal }) => reservationService.getBusinessCustomers({ storeId, search, page: page - 1, size: DEFAULT_PAGE_SIZE }, signal),
        placeholderData: (data, previous) => {
            const key = previous?.queryKey;
            return key?.[3] === ownerId && key?.[4] === session && key?.[6] === storeId && key?.[7] === search ? data : undefined;
        },
    });
    const lastPage = Math.max(list.data?.page?.totalPages ?? list.data?.totalPages ?? 1, 1);
    useEffect(() => {
        if (list.data && !list.isFetching && !list.error && page > lastPage) setFilters({ customerPage: String(lastPage) });
    }, [list.data, list.error, list.isFetching, page, lastPage, setFilters]);

    const total = list.data?.page?.totalElements ?? list.data?.totalElements ?? 0;
    const blocking = isBlockingListReadError(list.error, list.data?.content);
    const reload = () => storesError || !stores.length ? refetchStores() : list.refetch();
    const openCustomer = row => { setCustomer({ ...row, ownerId, session }); setCustomerOpen(true); };
    const columns = [
        { title: '고객', key: 'name', width: 138, render: (_, row) =>
            <Button variant="ghost-sm" aria-label={`${row.name} 고객 내역`} onClick={() => openCustomer(row)}>
                <UserOutlined aria-hidden="true" /> {row.name}
            </Button> },
        ...(storeId == null ? [{ title: '가게', dataIndex: 'storeName', width: 135, ellipsis: true }] : []),
        { title: '회원 번호', dataIndex: 'memberId', width: 95 },
        { title: '최근 방문', dataIndex: 'latestVisit', width: 120, render: value => value ?? '—' },
        { title: '전체 예약', dataIndex: 'reservations', width: 95, render: count },
        { title: '이용 완료', dataIndex: 'completed', width: 95, render: count },
        { title: '고객 취소', dataIndex: 'customerCanceled', width: 95, render: count },
        { title: '가게 취소', dataIndex: 'storeCanceled', width: 95, render: count },
        { title: '자동 취소', dataIndex: 'systemCanceled', width: 95, render: count },
        { title: '취소 주체 미확인', dataIndex: 'unknownCanceled', width: 140, render: count },
        { title: '확정 노쇼', dataIndex: 'noShows', width: 95, render: count },
        { title: '리뷰', dataIndex: 'reviewCount', width: 85, render: count },
        { title: '평균 별점', dataIndex: 'averageRating', width: 95, render: value => rating(value?.toFixed(1)) },
        { title: '최고 별점', dataIndex: 'highestRating', width: 95, render: rating },
        { title: '최저 별점', dataIndex: 'lowestRating', width: 95, render: rating },
        { title: '수동 제한', key: 'restriction', width: 152, render: (_, row) => row.permanent ? '영구 제한'
            : row.manualUntil ? `${new Date(row.manualUntil).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}까지` : '—' },
    ];
    return <section aria-label="고객 관리">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="ghost-sm" onClick={() => setReportsOpen(true)}><FlagOutlined aria-hidden="true" /> 내 신고</Button>
        </div>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            이 목록의 예약 수는 이용 종료 후 30일이 지나기 전 내역만 집계해요. 리뷰 통계는 삭제·숨김 처리되지 않은 리뷰를 집계해요.
        </Typography.Paragraph>
        <FilterToolbar selects={[{ value: storeId == null ? 'ALL' : String(storeId), ariaLabel: '고객 관리 가게', fitContent: true,
            loading: storesLoading, options: [{ value: 'ALL', label: '전체 가게' }, ...stores.map(store => ({ value: String(store.id), label: store.name }))],
            onChange: value => setFilters({ customerStore: value, customerPage: '1' }) }]}
            count={list.data && !blocking ? total : null} search={{ value: filters.customerSearch, disabled: !stores.length,
                placeholder: '고객 이름, 회원 번호 검색', onSubmit: value => setFilters({ customerSearch: value, customerPage: '1' }) }}
            onReload={reload} loading={storesLoading || list.isFetching} initialLoading={storesLoading || list.isLoading} />
        <ListingContent notice={list.error && !blocking && <DataState state="error" error={list.error} compact
            title="최신 고객 내역을 확인하지 못했어요." onRetry={reload} retrying={list.isFetching} />}>
            {storesLoading ? <AdminTableSkeleton /> : storesError || blocking
                ? <DataState state="error" error={storesError ?? list.error} title="고객 내역을 불러오지 못했어요." onRetry={reload} />
                : !stores.length ? <DataState state="empty" kind="reservation" title="관리할 가게가 없어요." />
                : <PagedDataTable columns={columns} dataSource={list.data?.content ?? []} stickyFirstColumn
                    rowKey={row => `${row.storeId}:${row.memberId}`} locale={{ emptyText: '조건에 맞는 고객이 없어요.' }}
                    placeholder={list.isPending || list.isPlaceholderData ? <AdminTableSkeleton cols={columns.map(col => col.width)} /> : null}
                    pagination={{ current: page, total, hideOnSinglePage: true, pageSize: DEFAULT_PAGE_SIZE,
                        onChange: value => setFilters({ customerPage: String(value) }) }} />}
        </ListingContent>
        <CustomerHistoryDialog customer={customer} open={active && customerOpen && customer?.ownerId === ownerId && customer?.session === session}
            onClose={() => setCustomerOpen(false)} afterClose={() => setCustomer(null)} />
        <MyServiceReports open={active && reportsOpen} onClose={() => setReportsOpen(false)} />
    </section>;
}
