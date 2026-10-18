import React, { useEffect, useState } from 'react';
import { Tag, Typography } from 'antd';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AdminTableSkeleton,
    Button,
    DataState,
    DataTable,
    FilterMenu,
    FormField,
    FormModal,
    FormSelect,
    FormTextArea,
    ModalLoading,
    RefreshButton,
} from '../common';
import { useMessage } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';
import { listRows } from '../../utils/listResponse';
import ChatImage from '../chat/ChatImage';
import ChatRetentionModal from './ChatRetentionModal';
import ManagementListToolbar from '../common/ManagementListToolbar';
import SkeletonText from '../common/SkeletonText';
import { colors } from '../../styles/tokens';
import { useQueryParamsState } from '../../hooks/useQueryParamState';
import { reviewOption, reviewPage } from './managementReviewQuery';
import useWorkspaceAction from '../../hooks/useWorkspaceAction';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';

const { Text } = Typography;
const PAGE_SIZE = 20;
const FILTERS = [
    { value: 'ALL', label: '전체 상태' },
    { value: 'OPEN', label: '접수' },
    { value: 'REVIEWING', label: '검토 중' },
];
const STATUS_LABELS = {
    OPEN: '접수', REVIEWING: '검토 중', RESOLVED: '조치 완료', DISMISSED: '기각',
};
const REASON_LABELS = {
    SPAM: '스팸·도배', HARASSMENT: '욕설·괴롭힘', INAPPROPRIATE: '부적절한 내용',
    FRAUD: '사기·결제 유도', OTHER: '기타',
};
const RESOLUTION_OPTIONS = [
    { value: 'RESOLVED', label: '조치 완료' },
    { value: 'DISMISSED', label: '신고 기각' },
];

const STATUS_TAG_COLORS = { OPEN: 'error', REVIEWING: 'processing' };

const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR');
};

/** 자동 제재 없이 관리자가 신고 상태와 처리 근거를 명시적으로 남기는 목록. */
const ChatReportsPanel = () => {
    const { message } = useMessage();
    const client = useQueryClient();
    const [queryState, setQuery] = useQueryParamsState({ chatReportStatus: 'ALL', chatReportPage: '1' });
    const filter = reviewOption(FILTERS, queryState.chatReportStatus, 'ALL');
    const page = reviewPage(queryState.chatReportPage);
    const setPage = value => setQuery({ chatReportPage: String(value) });
    const [selected, setSelected] = useState(null);
    const [contextReportId, setContextReportId] = useState(null);
    const [retentionReportId, setRetentionReportId] = useState(null);
    const [resolutionStatus, setResolutionStatus] = useState('RESOLVED');
    const [resolutionNote, setResolutionNote] = useState('');
    const [noteError, setNoteError] = useState('');
    const [conflict, setConflict] = useState(false);
    const [reloading, setReloading] = useState(false);
    const requestAction = useWorkspaceAction();

    const query = useQuery({
        queryKey: [...adminKeys.chatReports(filter), page],
        queryFn: () => chatService.listReports(page - 1, filter === 'ALL' ? undefined : filter),
        placeholderData: keepPreviousData,
    });
    const contextQuery = useQuery({
        queryKey: adminKeys.chatReportContext(contextReportId),
        queryFn: () => chatService.getReportContext(contextReportId),
        enabled: contextReportId != null,
    });
    const review = useMutation({
        mutationFn: async ({ id, status, note, revision, session }) => {
            assertCurrentSession(session);
            const result = await chatService.reviewReport(id, { status, resolutionNote: note || undefined, revision });
            assertCurrentSession(session); return result;
        },
        onSuccess: (_, values) => { if (isCurrentSession(values.session)) message.success('신고 처리 상태를 저장했어요.'); },
        onError: (failure, values) => {
            if (!isCurrentSession(values.session) || failure.isStaleSession) return;
            if (failure.status === 409) setConflict(true);
            message.error(failure.message || '신고 처리 상태를 저장하지 못했어요.');
        },
        onSettled: (_, __, values) => { if (isCurrentSession(values.session)) return client.invalidateQueries({ queryKey: ['admin', 'chatReports'] }); },
    });

    const startReview = (record) => {
        if (!Number.isSafeInteger(record.revision) || review.isPending) return;
        review.mutate({ id: record.id, revision: record.revision, status: 'REVIEWING', session: currentSession().epoch });
    };
    const openResolution = (record) => {
        setSelected(record);
        setResolutionStatus('RESOLVED');
        setResolutionNote('');
        setNoteError('');
        setConflict(false);
    };
    const closeResolution = () => {
        if (!review.isPending && !reloading) setSelected(null);
    };
    const reloadResolution = async () => {
        if (!selected || review.isPending || reloading) return;
        const id = selected.id;
        const session = currentSession().epoch;
        setReloading(true);
        try {
            const latest = (await chatService.getReportContext(id)).report;
            assertCurrentSession(session);
            if (latest?.id !== id || !Number.isSafeInteger(latest.revision)) return;
            setSelected(latest);
            setResolutionStatus(['RESOLVED', 'DISMISSED'].includes(latest.status) ? latest.status : 'RESOLVED');
            setResolutionNote(latest.resolutionNote || ''); setNoteError(''); setConflict(false);
        } catch (failure) { if (isCurrentSession(session) && !failure.isStaleSession) message.error(failure.message || '신고를 다시 불러오지 못했어요.'); }
        finally { if (isCurrentSession(session)) setReloading(false); }
    };
    const submitResolution = async () => {
        if (!selected || review.isPending || reloading || conflict) return;
        const note = resolutionNote.trim();
        if (!note) {
            setNoteError('처리 근거를 입력해주세요.');
            return;
        }
        setNoteError('');
        try {
            const session = currentSession().epoch;
            await review.mutateAsync({ id: selected.id, revision: selected.revision, status: resolutionStatus, note, session });
            if (isCurrentSession(session)) setSelected(null);
        } catch {
            // mutation의 onError가 공통 메시지를 표시한다.
        }
    };

    const columns = [
        { title: '신고', dataIndex: 'id', width: 78 },
        { title: '가게', dataIndex: 'storeName', width: 160, render: (value) => value || '-' },
        { title: '신고자', dataIndex: 'reporterRole', width: 90,
            render: (value) => value === 'OWNER' ? '사장님' : '회원' },
        { title: '사유', dataIndex: 'reason', width: 120,
            render: (value) => REASON_LABELS[value] ?? value },
        { title: '대상', dataIndex: 'messageId', width: 110,
            render: (value) => value ? `메시지 #${value}` : '대화 전체' },
        { title: '설명', dataIndex: 'details', width: 260, render: (value) => value || '-' },
        { title: '상태', dataIndex: 'status', width: 100,
            render: (value) => <Tag color={STATUS_TAG_COLORS[value] ?? 'default'}>
                {STATUS_LABELS[value] ?? value}
            </Tag> },
        { title: '접수 시각', dataIndex: 'createdAt', width: 180, render: formatDateTime },
        { title: '처리', width: 260, fixed: 'right', render: (_, record) => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button variant="ghost-sm" size="sm" onClick={() => setContextReportId(record.id)}>
                    내용 보기
                </Button>
                <Button variant="ghost-sm" size="sm" onClick={() => setRetentionReportId(record.id)}>
                    보존 설정
                </Button>
                {record.status === 'OPEN' && (
                    <Button variant="ghost-sm-primary" size="sm" disabled={review.isPending || !Number.isSafeInteger(record.revision)}
                        onClick={() => startReview(record)}>검토 시작</Button>
                )}
                {(record.status === 'OPEN' || record.status === 'REVIEWING') && (
                    <Button variant="ghost-sm-danger" size="sm" disabled={review.isPending}
                        onClick={() => openResolution(record)}>처리</Button>
                )}
            </div>
        ) },
    ];

    const rows = listRows(query.data);
    const total = query.data?.page?.totalElements ?? query.data?.totalElements ?? rows.length;
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    useEffect(() => {
        if (query.isSuccess && !query.isFetching && !query.isPlaceholderData && page > lastPage) setQuery({ chatReportPage: String(lastPage) });
    }, [query.isSuccess, query.isFetching, query.isPlaceholderData, page, lastPage, setQuery]);
    // 목록: 실패 → 로딩 → 표 순으로 판정한다.
    const renderReports = () => {
        if (query.isError) {
            return (
                <DataState state="error" kind="message" subject="채팅 신고" error={query.error}
                    onRetry={query.refetch} retrying={query.isFetching} />
            );
        }
        if (query.isPending) {
            return (
                <AdminTableSkeleton rows={4} headers={columns.map((column) => column.title)}
                    cols={columns.map((column) => column.width)} actionBtns={3} />
            );
        }
        return (
            <DataTable
                columns={columns}
                dataSource={rows}
                rowKey="id"
                locale={{ emptyText: '해당 상태의 채팅 신고가 없어요.' }}
                pagination={{ current: page, pageSize: PAGE_SIZE, total, onChange: setPage }}
                scroll={{ x: 1360 }}
            />
        );
    };
    // 신고 대화 내용: 로딩 → 실패 → 본문 순으로 판정한다.
    const renderContext = () => {
        if (contextQuery.isPending) {
            return <ModalLoading text="대화 내용을 불러오는 중이에요." minHeight="160px" />;
        }
        if (contextQuery.isError) {
            return (
                <DataState state="error" requestType="detail" kind="message" subject="신고된 대화 내용" error={contextQuery.error}
                    onRetry={contextQuery.refetch} retrying={contextQuery.isFetching} />
            );
        }
        return (
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {contextQuery.data?.reportedMessage && (
                    <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, background: colors.error.light, color: colors.text.primary }}>
                        <strong>신고된 메시지</strong>
                        {contextQuery.data.reportedMessage.imageUrl && <ChatImage
                            url={`/api/admin/chat/reports/${contextReportId}/images/${contextQuery.data.reportedMessage.id}`}
                            width={contextQuery.data.reportedMessage.imageWidth} height={contextQuery.data.reportedMessage.imageHeight} />}
                        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {contextQuery.data.reportedMessage.content}
                        </div>
                    </div>
                )}
                {(contextQuery.data?.recentMessages ?? []).length === 0 ? (
                    <DataState state="empty" kind="message" title="저장된 메시지가 없어요." />
                ) : (contextQuery.data?.recentMessages ?? []).map((item) => (
                    <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--c-border-light, #f2f4f6)' }}>
                        <strong>{item.senderRole === 'OWNER' ? '사장님' : '회원'}</strong>
                        {item.imageUrl && <ChatImage url={`/api/admin/chat/reports/${contextReportId}/images/${item.id}`}
                            width={item.imageWidth} height={item.imageHeight} />}
                        <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {item.content}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <section aria-label="신고">
            <ManagementListToolbar leading={<span className="reserve-management-count"><SkeletonText loading={query.isPending}>{total.toLocaleString('ko-KR')}건</SkeletonText></span>}
                trailing={<><FilterMenu value={filter} options={FILTERS} aria-label="채팅 신고 상태"
                    onChange={value => setQuery({ chatReportStatus: value, chatReportPage: '1' })} />
                    <RefreshButton onReload={query.refetch} loading={query.isFetching} /></>} />
            {renderReports()}
            <ChatRetentionModal reportId={retentionReportId} onClose={() => setRetentionReportId(null)} />

            <FormModal
                title={`신고 #${selected?.id ?? ''} 처리`}
                open={Boolean(selected)}
                onClose={closeResolution}
                onSubmit={submitResolution}
                submitting={review.isPending || reloading}
                submitDisabled={conflict || !Number.isSafeInteger(selected?.revision)}
                navigationDirty={Boolean(resolutionNote || resolutionStatus !== 'RESOLVED')}
                submitText="처리 저장"
                mobileSheet={false}
            >
                {conflict && <DataState state="error" compact title="다른 관리자가 신고를 변경했어요. 다시 불러와 검토해주세요."
                    onRetry={() => requestAction(reloadResolution, { discard: false })} retrying={reloading} />}
                <FormField label="처리 결과">
                    <FormSelect value={resolutionStatus} onChange={setResolutionStatus}
                        options={RESOLUTION_OPTIONS} />
                </FormField>
                <FormField label="처리 근거" error={noteError}>
                    <FormTextArea value={resolutionNote}
                        onChange={(event) => { setResolutionNote(event.target.value); setNoteError(''); }}
                        maxLength={500} showCount rows={4}
                        placeholder="확인 내용과 조치 또는 기각 사유를 적어주세요" />
                </FormField>
            </FormModal>

            <FormModal
                title={`신고 #${contextReportId ?? ''} 대화 내용`}
                open={contextReportId != null}
                onClose={() => setContextReportId(null)}
                footer={null}
                width={640}
                mobileSize="tall"
            >
                {renderContext()}
            </FormModal>
        </section>
    );
};

export default ChatReportsPanel;
