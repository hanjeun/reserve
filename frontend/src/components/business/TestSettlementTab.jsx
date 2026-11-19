import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Typography } from 'antd';
import Button from '../common/Button';
import DataTable from '../common/DataTable';
import AnimatedContent from '../common/AnimatedContent';
import DataState from '../common/DataState';
import FilterToolbar from '../common/FilterToolbar';
import FormInput from '../common/FormInput';
import StatCard from '../common/StatCard';
import { CheckCircleOutlined, ClockCircleOutlined, DownloadOutlined, RollbackOutlined, WalletOutlined } from '../common/icons';
import AdminTableSkeleton from '../common/AdminTableSkeleton';
import useMyStores from '../../hooks/useMyStores';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import api from '../../api/axios';
import Pagination from '../common/Pagination';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';
import { downloadCsvBlob } from '../../utils/csv';

const money = value => Number(value).toLocaleString('ko-KR') + '원';
const MONTH_FORMAT = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const seoulMonth = () => {
    const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
};
const MONTH_TOTALS = [
    { key: 'noShowAmount', label: '노쇼 확정액', Icon: WalletOutlined },
    { key: 'deductionAmount', label: '차감액', Icon: RollbackOutlined },
    { key: 'payableAmount', label: '모의 지급 예정액', Icon: ClockCircleOutlined },
    { key: 'simulatedAmount', label: '모의 지급액', Icon: CheckCircleOutlined },
];
const STATES = {
    READY: '모의 지급 가능', SETTLED: '모의 지급 완료', ADJUSTMENT_REQUIRED: '지급 후 환불 · 조정 필요',
    REFUNDED: '전액 환불', ATTENDANCE_PENDING: '방문·노쇼 확인 대기', VISITED: '방문 확인 · 정산 대상 아님',
    CUTOFF_PENDING: '예약일 마감 대기', NOT_ELIGIBLE: '정산 대상 아님', REVIEW_REQUIRED: '환불·결제 확인 중',
    SCHEDULE_UNVERIFIED: '예약 시각 확인 필요',
    CHANNEL_UNVERIFIED: 'TEST 채널 확인 필요', DISPUTED: '분쟁 확인 중', PAYMENT_PENDING: '결제 완료 확인 필요',
};
const canSimulate = row => !row.held && row.balance > 0 && (row.state == null || row.state === 'READY');
export default function TestSettlementTab() {
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const { stores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const revision = useAuthStore(state => state.sessionRevision);
    const memberId = useAuthStore(state => state.user?.id);
    const queryClient = useQueryClient();
    const mounted = useRef(false);
    const active = useRef(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [params, setParams] = useSearchParams();
    const [currentMonth] = useState(seoulMonth);
    const requestedMonth = params.get('settlementMonth');
    const month = MONTH_FORMAT.test(requestedMonth) ? requestedMonth : currentMonth;
    const [monthDraft, setMonthDraft] = useState(null);
    const requested = Number(params.get('settlementStore'));
    const storeId = stores.find(value => value.id === requested)?.id ?? stores[0]?.id;
    const requestedPage = Number(params.get('settlementPage') || '1');
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage - 1, 10000) : 0;
    const { message, confirm } = useMessage();
    const requests = useRef(new Map());
    const exportRequest = useRef(null);
    useEffect(() => () => exportRequest.current?.abort(), [revision, storeId, month]);
    const owns = operation => {
        const auth = useAuthStore.getState();
        return mounted.current && auth.isLoggedIn && auth.user?.id === operation.memberId && auth.sessionRevision === operation.revision;
    };
    const availability = useQuery({
        queryKey: ['test-settlement-availability', revision],
        queryFn: async ({ signal }) => {
            const result = await api.get('/api/business/settlements/status', { signal });
            if (typeof result?.enabled !== 'boolean') throw new Error('정산 활성 상태를 확인하지 못했어요. 다시 불러와주세요.');
            return result;
        },
        staleTime: 60_000,
        retry: (count, error) => error?.status >= 500 && count < 1,
    });
    const unavailable = availability.data?.enabled === false;
    const enabled = availability.data?.enabled === true && Boolean(storeId) && !storesError;
    const summary = useQuery({
        queryKey: ['test-settlement', revision, storeId, month, 'monthly'],
        queryFn: ({ signal }) => api.get('/api/business/settlements/monthly', { params: { storeId, month }, signal }),
        enabled, staleTime: 30_000,
    });
    const query = useQuery({
        queryKey: ['test-settlement', revision, storeId, month, page],
        queryFn: ({ signal }) => api.get('/api/business/settlements', { params: { storeId, page, month }, signal }),
        enabled, staleTime: 30_000,
        placeholderData: (previous, old) => old?.queryKey[1] === revision && old.queryKey[2] === storeId
            && old.queryKey[3] === month ? previous : undefined,
    });
    const download = useMutation({
        mutationFn: async operation => {
            if (!owns(operation) || exportRequest.current) return;
            const request = new AbortController();
            exportRequest.current = request;
            const { storeId: selectedStore, month: selectedMonth } = operation;
            try {
                const blob = await api.get('/api/business/settlements/monthly.csv', {
                    params: { storeId: selectedStore, month: selectedMonth }, responseType: 'blob', signal: request.signal,
                });
                if (!request.signal.aborted && owns(operation)) {
                    if (!(blob instanceof Blob) || !blob.type.startsWith('text/csv')) throw new Error('정산 파일을 확인하지 못했어요.');
                    downloadCsvBlob(`reserve-test-settlement-${selectedStore}-${selectedMonth}.csv`, blob);
                }
            } catch (error) {
                if (!request.signal.aborted && owns(operation) && !error.isStaleSession && !error.isSessionExpired) {
                    message.error(error.message || '정산 파일을 내려받지 못했어요.');
                }
            } finally {
                exportRequest.current = null;
            }
        },
    });
    const simulate = useMutation({
        mutationFn: async operation => {
            if (!owns(operation) || active.current?.revision === operation.revision) throw new DOMException('정산 요청을 취소했어요.', 'AbortError');
            active.current = operation;
            const key = `${operation.revision}:${operation.storeId}:${operation.paymentId}`;
            try {
                if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
                const result = await api.post(`/api/business/settlements/${operation.storeId}/simulate`,
                    { paymentId: operation.paymentId, requestId: requests.current.get(key) });
                requests.current.delete(key);
                return result;
            } finally { if (active.current === operation) active.current = null; }
        },
        onSuccess: (_, operation) => {
            if (!owns(operation)) return;
            queryClient.invalidateQueries({ queryKey: ['test-settlement', operation.revision, operation.storeId] });
            if (operation.storeId === storeId) message.success('TEST 가상 정산을 기록했어요.');
        },
        onError: (error, operation) => {
            if (owns(operation) && operation.storeId === storeId && !['AbortError', 'CanceledError'].includes(error.name)
                && !error.isStaleSession && !error.isSessionExpired) message.error(error.message || '가상 정산을 확인하지 못했어요.');
        },
    });
    const requestSimulation = row => {
        const operation = { memberId, revision, storeId, paymentId: row.paymentId };
        if (!owns(operation) || simulate.isPending || !canSimulate(row)) return;
        confirm({ title: 'TEST 가상 정산을 기록할까요?',
            content: `예약 ${row.reservationCode}의 ${money(row.balance)}을 모의 지급으로 기록해요.\n수수료는 0원이며 실제 계좌로 송금하지 않아요.`,
            okText: '모의 지급', cancelText: '닫기',
            onOk: () => owns(operation) ? simulate.mutateAsync(operation).catch(() => undefined) : undefined });
    };
    const error = storesError || (!unavailable && availability.error) || summary.error || query.error;
    const pageSize = query.data?.size ?? 20;
    const total = query.data?.totalElements ?? 0;
    useEffect(() => {
        const totalPages = query.data?.totalPages;
        if (query.isFetching || query.error || !Number.isInteger(totalPages) || page + 1 <= Math.max(totalPages, 1)) return;
        setParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('settlementPage', String(Math.max(totalPages, 1)));
            return next;
        }, { replace: true });
    }, [query.data?.totalPages, query.isFetching, query.error, page, setParams]);
    const reload = () => {
        if (storesError) return refetchStores();
        if (!enabled) return availability.refetch();
        return Promise.all([summary.refetch(), query.refetch()]);
    };
    const changeMonth = value => {
        if (!MONTH_FORMAT.test(value)) {
            setMonthDraft({ month, value });
            return;
        }
        setMonthDraft(null);
        if (value !== month) setParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('settlementMonth', value);
            next.delete('settlementPage');
            return next;
        });
    };
    const changePage = next => setParams(previous => { const nextParams = new URLSearchParams(previous); nextParams.set('settlementPage', String(next + 1)); return nextParams; });
    const columns = [
        { title: '예약', dataIndex: 'reservationCode', width: 170, render: (code, row) => <div>
            <div>{code}</div><Typography.Text type="secondary">{row.reservationDate}</Typography.Text>
            {row.noShowConfirmedDate && <div><Typography.Text type="secondary">노쇼 확정 {row.noShowConfirmedDate}</Typography.Text></div>}
        </div> },
        { title: '결제·환불', dataIndex: 'paidAmount', width: 130, render: (paid, row) => <div>
            <div>{money(paid)}</div><Typography.Text type="secondary">환불 {money(row.refundedAmount)}</Typography.Text>
        </div> },
        { title: '모의 지급 예정액', key: 'payableAmount', render: (_, row) => money(canSimulate(row) ? row.balance : 0), width: 144 },
        { title: '모의 지급액', dataIndex: 'simulatedAmount', width: 160, render: (value, row) => <div>
            <div>{money(value)}</div>
            {row.lastSimulatedDate && <Typography.Text type="secondary">최근 {row.lastSimulatedDate}</Typography.Text>}
        </div> },
        { title: '잔액', dataIndex: 'balance', render: money, width: 120 },
        { title: '상태', dataIndex: 'state', width: 180, render: (state, row) => STATES[state]
            || (state != null ? '정산 상태 확인 필요' : row.held ? '확인 중' : row.balance < 0 ? STATES.ADJUSTMENT_REQUIRED : row.balance === 0 ? '정산할 잔액 없음' : STATES.READY) },
        { title: '가상 정산', key: 'action', width: 130, render: (_, row) => !canSimulate(row) ? '—' :
            <Button size="sm" disabled={simulate.isPending} onClick={() => requestSimulation(row)}>모의 지급</Button> },
    ];
    return <section aria-label="가상 정산 내역">
        <FilterToolbar selects={[{ value: storeId, options: stores.map(value => ({ value: value.id, label: value.name })),
            ariaLabel: '정산 가게 선택', loading: storesLoading, onChange: value => setParams(previous => {
                const next = new URLSearchParams(previous); next.set('settlementStore', String(value)); next.delete('settlementPage'); return next;
            }) }]}
            extra={enabled && <FormInput type="month" aria-label="예약 월" title="예약 월" placeholder="YYYY-MM"
                min="1000-01" max="9999-12" value={monthDraft?.month === month ? monthDraft.value : month}
                onChange={event => changeMonth(event.target.value)} onBlur={() => setMonthDraft(null)}
                style={{ width: 156, maxWidth: '100%', height: 44 }} />}
            onReload={reload} loading={availability.isFetching || summary.isFetching || query.isFetching} />
        {error ? <DataState state="error" title="정산 내역을 불러오지 못했어요." error={error} onRetry={reload} compact /> :
            unavailable ? <DataState state="empty" kind="payment" title="TEST 가상 정산이 꺼져 있어요." /> :
            storesLoading || availability.isPending ? <AdminTableSkeleton /> :
                !storeId ? <DataState state="empty" title="등록한 가게가 없어요." /> :
                    <>
                        <section aria-label="월별 정산 합계" style={{ marginBottom: 24 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 16 }}>
                                {MONTH_TOTALS.map(({ key, label, Icon }) => <StatCard key={key} icon={<Icon />} label={label}
                                    value={summary.data?.[key]?.toLocaleString('ko-KR')} suffix="원" loading={summary.isPending} />)}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
                                <Typography.Text type="secondary">
                                    예약 월 기준{summary.data?.adjustmentAmount > 0 && ` · 조정 필요액 ${money(summary.data.adjustmentAmount)}`}
                                </Typography.Text>
                                <Button variant="outline" size="sm" icon={<DownloadOutlined />} loading={download.isPending}
                                    disabled={!summary.data?.reportCount || summary.isFetching}
                                    onClick={() => download.mutate({ memberId, revision, storeId, month })}>TEST CSV 다운로드</Button>
                            </div>
                        </section>
                        <AnimatedContent motionKey={`${storeId}:${month}:${page}`} ready={!query.isPending && !query.isPlaceholderData}
                            keepResultsHeight={total > pageSize}>
                            {query.isPending || query.isPlaceholderData ? <AdminTableSkeleton /> :
                                <DataTable rowKey="paymentId" columns={columns} dataSource={query.data?.content || []} pagination={false}
                                    locale={{ emptyText: '확인된 TEST 결제 내역이 없어요.' }} />}
                        </AnimatedContent>
                        {total > pageSize && <nav aria-label="정산 내역 페이지" className="reserve-listing-pagination">
                            <Pagination current={page + 1} pageSize={pageSize} total={total}
                                onChange={value => changePage(value - 1)} showSizeChanger={false} showLessItems={isMobile}
                                size={isMobile ? 'small' : 'default'} align="end" disabled={query.isFetching || simulate.isPending} />
                        </nav>}
                    </>}
        <Typography.Paragraph type="secondary" style={{ marginTop: 24, marginBottom: 0 }}>
            TEST 가상 정산 · 수수료 0원 · 실제 송금 없음
        </Typography.Paragraph>
    </section>;
}
