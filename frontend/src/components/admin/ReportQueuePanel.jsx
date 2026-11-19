import { lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminTableSkeleton, Button, DataState, FilterToolbar, PagedDataTable, SegmentedControl } from '../common';
import ListingContent from '../common/ListingContent';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { DEFAULT_PAGE_SIZE } from '../../constants/pagination';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { adminKeys } from '../../hooks/queryKeys';
import useAuthStore from '../../store/useAuthStore';
import serviceReportService from '../../services/serviceReportService';
import { FEED_REPORT_REASONS } from '../../utils/feed';
import { CHAT_REPORT_REASON_LABELS, REPORT_REASON_LABELS, REPORT_TYPE_LABELS, reportStateLabel } from '../report/serviceReportLabels';
import ReportCaseDialog from './ReportCaseDialog';
import { reviewPage } from './managementReviewQuery';

const ChatReportsPanel = lazy(() => import('./ChatReportsPanel'));
const FeedReportsPanel = lazy(() => import('./FeedReportsPanel'));
const TYPES = [{ value: 'ALL', label: '전체' }, ...['REVIEW', 'RESERVATION', 'CHAT', 'FEED'].map(value => ({ value, label: REPORT_TYPE_LABELS[value] }))];
const STATUSES = [{ value: 'ALL', label: '전체 상태' }, ...['OPEN', 'REVIEWING', 'APPEALED', 'RESOLVED', 'DISMISSED', 'REJECTED']
    .map(value => ({ value, label: reportStateLabel(value) }))];
const reasonLabel = (value, row) => {
    if (row.reportType === 'CHAT') return CHAT_REPORT_REASON_LABELS[value] ?? '기타';
    if (row.reportType.startsWith('FEED')) return FEED_REPORT_REASONS.find(reason => reason.value === value)?.label ?? '기타';
    return REPORT_REASON_LABELS[value] ?? '기타';
};

export default function ReportQueuePanel() {
    const active = useContext(WorkspaceActivityContext);
    const [params, setParams] = useSearchParams();
    const session = useAuthStore(state => state.sessionRevision);
    const memberId = useAuthStore(state => state.user?.id);
    const [focus, setFocus] = useState(null);
    const [selected, setSelected] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const type = TYPES.find(item => item.value === params.get('queueType'))?.value ?? 'ALL';
    const status = STATUSES.find(item => item.value === params.get('queueStatus'))?.value ?? 'ALL';
    const page = reviewPage(params.get('queuePage'));
    const legacy = type === 'CHAT' || type === 'FEED';
    const query = useQuery({ queryKey: [...adminKeys.reportQueue(), memberId, session, type, status, page],
        enabled: active && !legacy && memberId != null,
        queryFn: ({ signal }) => serviceReportService.adminList({ type: type === 'ALL' ? undefined : type,
            status: status === 'ALL' ? undefined : status, page: page - 1, size: DEFAULT_PAGE_SIZE }, signal),
        placeholderData: (data, previous) => {
            const key = previous?.queryKey;
            return key?.[2] === memberId && key[3] === session && key[4] === type && key[5] === status ? data : undefined;
        },
    });
    const update = useCallback(patch => setParams(previous => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
            if (value == null) next.delete(key);
            else next.set(key, value);
        }
        return next;
    }), [setParams]);
    const last = Math.max(1, query.data?.page?.totalPages ?? query.data?.totalPages ?? 1);
    useEffect(() => {
        if (active && !legacy && query.isSuccess && !query.isFetching && !query.isPlaceholderData && page > last) {
            update({ queuePage: String(last) });
        }
    }, [active, legacy, query.isSuccess, query.isFetching, query.isPlaceholderData, page, last, update]);
    const switchType = (value, reportMode = null) => update({ queueType: value, queuePage: null,
        queueStatus: null, ...(reportMode ? { reportMode } : {}) });
    const open = row => {
        if (row.reportType === 'CHAT' || row.reportType.startsWith('FEED')) {
            setFocus({ ...row, session });
            switchType(row.reportType === 'CHAT' ? 'CHAT' : 'FEED', row.reportType === 'FEED_COMMENT' ? 'comments' : 'reports');
        } else {
            setSelected({ id: row.id, type: row.reportType, session });
            setDetailOpen(true);
        }
    };
    const columns = [
        { title: '유형', dataIndex: 'reportType', width: 116, render: value => REPORT_TYPE_LABELS[value] ?? value },
        { title: '가게', dataIndex: 'storeName', width: 144, ellipsis: true, render: value => value || '—' },
        { title: '대상', dataIndex: 'targetId', width: 90, render: value => `#${value}` },
        { title: '사유', dataIndex: 'reason', width: 166, render: reasonLabel },
        { title: '접수 시각', dataIndex: 'createdAt', width: 160, render: value => value?.replace('T', ' ').slice(0, 16) || '—' },
        { title: '상태', dataIndex: 'status', width: 104, render: reportStateLabel },
        { title: '담당자 번호', dataIndex: 'reviewedBy', width: 105, render: value => value ?? '—' },
        { title: '관리', key: 'open', width: 90, render: (_, row) =>
            <Button variant="ghost-sm" aria-label={`${REPORT_TYPE_LABELS[row.reportType]} 신고 ${row.id} 보기`} onClick={() => open(row)}>보기</Button> },
    ];
    const total = query.data?.page?.totalElements ?? query.data?.totalElements ?? 0;
    const blocking = isBlockingListReadError(query.error, query.data?.content);
    const target = focus?.session === session ? focus : null;
    return <section aria-label="신고 관리">
        <div style={{ marginBottom: 20 }}><SegmentedControl aria-label="신고 유형" block={false} value={type} options={TYPES}
            onChange={value => { setFocus(null); switchType(value); }} /></div>
        {legacy ? <Suspense fallback={<AdminTableSkeleton />}>
            {type === 'CHAT' ? <ChatReportsPanel initialContextId={target?.reportType === 'CHAT' ? target.id : null} />
                : <FeedReportsPanel initialReportId={target?.reportType === 'FEED' ? target.id : null}
                    initialCommentId={target?.reportType === 'FEED_COMMENT' ? target.id : null} />}
        </Suspense> : <>
            <FilterToolbar count={query.data && !blocking ? total : null} selects={[{ value: status, options: STATUSES,
                fitContent: true, ariaLabel: '신고 상태', onChange: value => update({ queueStatus: value, queuePage: null }) }]}
                onReload={query.refetch} loading={query.isFetching} initialLoading={query.isLoading} />
            <ListingContent notice={query.error && !blocking && <DataState state="error" error={query.error} compact
                title="최신 신고를 확인하지 못했어요." onRetry={query.refetch} retrying={query.isFetching} />}>
                {blocking ? <DataState state="error" error={query.error} title="신고를 불러오지 못했어요." onRetry={query.refetch} />
                    : <PagedDataTable columns={columns} dataSource={query.data?.content ?? []} rowKey={row => `${row.reportType}:${row.id}`}
                        placeholder={query.isPending || query.isPlaceholderData ? <AdminTableSkeleton cols={columns.map(column => column.width)} /> : null}
                        locale={{ emptyText: '조건에 맞는 신고가 없어요.' }} pagination={{ current: page, total, pageSize: DEFAULT_PAGE_SIZE,
                            hideOnSinglePage: true, onChange: value => update({ queuePage: String(value) }) }} />}
            </ListingContent>
        </>}
        <ReportCaseDialog target={selected} open={active && detailOpen && selected?.session === session}
            onClose={() => setDetailOpen(false)} afterClose={() => setSelected(null)} />
    </section>;
}
