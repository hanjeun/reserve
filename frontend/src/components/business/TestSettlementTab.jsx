import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Flex, Typography } from 'antd';
import Button from '../common/Button';
import DataTable from '../common/DataTable';
import DataState from '../common/DataState';
import FilterToolbar from '../common/FilterToolbar';
import AdminTableSkeleton from '../common/AdminTableSkeleton';
import useMyStores from '../../hooks/useMyStores';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import api from '../../api/axios';

const money = value => Number(value).toLocaleString('ko-KR') + '원';
export default function TestSettlementTab() {
    const { stores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const revision = useAuthStore(state => state.sessionRevision);
    const [params, setParams] = useSearchParams();
    const requested = Number(params.get('settlementStore'));
    const storeId = stores.find(value => value.id === requested)?.id ?? stores[0]?.id;
    const requestedPage = Number(params.get('settlementPage') || '1');
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage - 1, 10000) : 0;
    const { message } = useMessage();
    const requests = useRef(new Map());
    const availability = useQuery({
        queryKey: ['test-settlement-availability', revision],
        queryFn: ({ signal }) => api.get('/api/business/settlements/status', { signal }),
        staleTime: 60_000,
        retry: (count, error) => error?.status >= 500 && count < 1,
    });
    const unavailable = availability.data?.enabled === false || availability.error?.status === 404;
    const query = useQuery({
        queryKey: ['test-settlement', revision, storeId, page],
        queryFn: ({ signal }) => api.get('/api/business/settlements', { params: { storeId, page }, signal }),
        enabled: availability.data?.enabled === true && Boolean(storeId) && !storesError, staleTime: 30_000,
    });
    const simulate = useMutation({
        mutationFn: async paymentId => {
            const key = `${revision}:${storeId}:${paymentId}`;
            if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
            const result = await api.post(`/api/business/settlements/${storeId}/simulate`, { paymentId, requestId: requests.current.get(key) });
            requests.current.delete(key);
            return result;
        },
        onSuccess: () => { message.success('TEST 가상 정산을 기록했어요.'); query.refetch(); },
        onError: error => message.error(error.message || '가상 정산을 확인하지 못했어요.'),
    });
    const error = storesError || (!unavailable && availability.error) || query.error;
    const reload = () => storesError ? refetchStores() : unavailable || availability.error
        ? availability.refetch() : query.refetch();
    const changePage = next => setParams(previous => { const nextParams = new URLSearchParams(previous); nextParams.set('settlementPage', String(next + 1)); return nextParams; });
    const columns = [
        { title: '예약', dataIndex: 'reservationCode', width: 170, render: (code, row) => <div>
            <div>{code}</div><Typography.Text type="secondary">{row.reservationDate}</Typography.Text>
        </div> },
        { title: '결제·환불', dataIndex: 'paidAmount', width: 130, render: (paid, row) => <div>
            <div>{money(paid)}</div><Typography.Text type="secondary">환불 {money(row.refundedAmount)}</Typography.Text>
        </div> },
        { title: '정산예정액', dataIndex: 'expectedAmount', render: money, width: 130 },
        { title: '모의 지급액', dataIndex: 'simulatedAmount', render: money, width: 130 },
        { title: '잔액', dataIndex: 'balance', render: money, width: 120 },
        { title: '가상 정산', key: 'action', width: 130, render: (_, row) => row.held ? '확인 중' :
            <Button size="sm" disabled={row.balance <= 0 || simulate.isPending} onClick={() => simulate.mutate(row.paymentId)}>모의 지급</Button> },
    ];
    return <section aria-label="가상 정산 내역">
        <Typography.Paragraph>TEST 결제만 계산하며 수수료는 0원이에요. 실제 계좌로 송금하지 않아요.</Typography.Paragraph>
        <FilterToolbar selects={[{ value: storeId, options: stores.map(value => ({ value: value.id, label: value.name })),
            ariaLabel: '정산 가게 선택', loading: storesLoading, onChange: value => setParams(previous => {
                const next = new URLSearchParams(previous); next.set('settlementStore', String(value)); next.delete('settlementPage'); return next;
            }) }]} onReload={reload} loading={availability.isFetching || query.isFetching} />
        {error ? <DataState state="error" error={error} onRetry={reload} compact /> :
            unavailable ? <DataState state="empty" kind="payment" title="TEST 가상 정산을 준비하고 있어요." /> :
            storesLoading || availability.isPending || Boolean(storeId) && query.isPending ? <AdminTableSkeleton /> :
                !storeId ? <DataState state="empty" title="등록한 가게가 없어요." /> :
                    <><DataTable rowKey="paymentId" columns={columns} dataSource={query.data?.content || []} pagination={false}
                        locale={{ emptyText: '확인된 TEST 결제 내역이 없어요.' }} />
                    <Flex gap={12} justify="center" align="center" style={{ marginTop: 24 }}>
                        <Button variant="link" disabled={page === 0 || query.isFetching} onClick={() => changePage(page - 1)}>이전</Button>
                        <Typography.Text>{page + 1}</Typography.Text>
                        <Button variant="link" disabled={!query.data?.hasNext || query.isFetching} onClick={() => changePage(page + 1)}>다음</Button>
                    </Flex></>}
    </section>;
}
