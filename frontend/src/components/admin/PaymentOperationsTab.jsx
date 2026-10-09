import React, { useState } from 'react';
import { Tag } from 'antd';
import AdPaymentOperations from './AdPaymentOperations';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { AdminTableSkeleton, Button, DataState, DataTable, FilterToolbar, SegmentedControl } from '../common';
import CopyableText from '../common/CopyableText';
import { useMessage } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import { invalidateAdminData, invalidateReservationData } from '../../hooks/invalidateAfterWrite';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';

const PAGE_SIZE = 20;

const QUEUES = [
    { value: 'ready', label: '오래된 READY' },
    { value: 'issues', label: '수동 대사' },
    { value: 'webhooks', label: '웹훅 inbox' },
    { value: 'ads', label: '광고 결제' },
];

const AGE_OPTIONS = [
    { value: 1, label: '1일 이상' },
    { value: 7, label: '7일 이상' },
    { value: 30, label: '30일 이상' },
    { value: 90, label: '90일 이상' },
];

const OUTCOME_LABELS = {
    PAID_RECOVERED: '결제 완료 복구',
    CLOSED_AS_NOT_PAID: '미결제로 종료',
    STILL_PENDING: 'PG 처리 중',
    MANUAL_REVIEW_REQUIRED: '수동 확인 필요',
    RETRY_REQUIRED: '재시도 필요',
    ALREADY_RESOLVED: '이미 처리됨',
};

const pageContent = (data) => data?.content ?? [];
// 주문번호(13px, 약 189px) + 복사 아이콘(약 20) + 칸 좌우 여백(16) 이 한 줄에 들어가는 폭 (2026-09-21 실측).
const ORDER_NO_COLUMN_WIDTH = 232;
const pageTotal = (data) => data?.page?.totalElements ?? data?.totalElements ?? pageContent(data).length;
const shortDateTime = (value) => value ? value.replace('T', ' ').substring(0, 16) : '-';

const PaymentOperationsTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const [queue, setQueue] = useState('ready');
    const [page, setPage] = useState(1);
    const [olderThanDays, setOlderThanDays] = useState(7);

    const readyQuery = useQuery({
        queryKey: [...adminKeys.paymentOperations(), 'ready', page, olderThanDays],
        queryFn: () => api.get(API_ENDPOINTS.PAYMENT_OPERATIONS.STALE_READY, {
            params: { page: page - 1, size: PAGE_SIZE, olderThanDays },
        }),
        enabled: queue === 'ready',
        placeholderData: keepPreviousData,
    });
    const issuesQuery = useQuery({
        queryKey: [...adminKeys.paymentOperations(), 'issues', page],
        queryFn: () => api.get(API_ENDPOINTS.PAYMENT_OPERATIONS.ISSUES, {
            params: { page: page - 1, size: PAGE_SIZE, openOnly: true },
        }),
        enabled: queue === 'issues',
        placeholderData: keepPreviousData,
    });
    const webhooksQuery = useQuery({
        queryKey: [...adminKeys.paymentOperations(), 'webhooks', page],
        queryFn: () => api.get(API_ENDPOINTS.PAYMENT_OPERATIONS.WEBHOOKS, {
            params: { page: page - 1, size: PAGE_SIZE, unfinishedOnly: true },
        }),
        enabled: queue === 'webhooks',
        placeholderData: keepPreviousData,
    });

    // PG 재확인·웹훅 재처리는 이 탭의 큐뿐 아니라 예약의 결제 상태(결제 완료 복구·미결제 종료)를 바꾼다.
    // 관리자 전체 예약·대시보드(관리자 캐시)와 예약 목록·달력·통계를 함께 무효화한다.
    const invalidatePaymentOutcome = () => Promise.all([
        invalidateAdminData(queryClient),
        invalidateReservationData(queryClient),
    ]);

    const reconcileMutation = useMutation({
        mutationFn: (paymentId) => api.post(
            API_ENDPOINTS.PAYMENT_OPERATIONS.RECONCILE_READY(paymentId),
        ),
        onSuccess: (result) => {
            const label = OUTCOME_LABELS[result?.outcome] ?? result?.outcome ?? '처리 완료';
            message.success(`PG 재확인 결과: ${label}`);
            void invalidatePaymentOutcome();
        },
        onError: () => message.error('PG 재확인에 실패했어요.'),
    });

    const retryWebhookMutation = useMutation({
        mutationFn: (inboxId) => api.post(
            API_ENDPOINTS.PAYMENT_OPERATIONS.RETRY_WEBHOOK(inboxId),
        ),
        onSuccess: () => {
            message.success('웹훅 재처리를 요청했어요.');
            void invalidatePaymentOutcome();
        },
        onError: () => message.error('웹훅 재처리 요청에 실패했어요.'),
    });

    const handleQueueChange = (value) => {
        setQueue(value);
        setPage(1);
    };
    const handleAgeChange = (value) => {
        setOlderThanDays(value);
        setPage(1);
    };

    const confirmReconcile = (record) => confirm({
        title: 'PG 결제 상태 재확인',
        content: `결제 #${record.paymentId}를 PG에서 다시 확인해요. 자동으로 단정할 수 없는 결과는 수동 대사 큐에 남아요.`,
        okText: '재확인',
        cancelText: '취소',
        centered: true,
        onOk: () => reconcileMutation.mutateAsync(record.paymentId),
    });

    const readyColumns = [
        { title: '결제 ID', dataIndex: 'paymentId', width: 90 },
        // 주문번호 + 복사 아이콘이 한 줄에 들어가는 폭. 좁으면 아이콘만 다음 줄로 꺾여 모바일에서 행이 두 배로 높아졌다.
        { title: '주문번호', dataIndex: 'merchantUid', width: ORDER_NO_COLUMN_WIDTH, className: 'reserve-table-code',
            render: (value) => <CopyableText value={value} label="주문번호" style={{ fontSize: fontSize.sm }} /> },
        { title: '예약', dataIndex: 'reservationId', width: 80, render: (value) => value ?? '-' },
        { title: '예약 상태', dataIndex: 'reservationStatus', width: 110,
            render: (value) => <Tag>{value ?? '-'}</Tag> },
        { title: '금액', dataIndex: 'amount', width: 110,
            render: (value) => `${Number(value ?? 0).toLocaleString()}원` },
        { title: '생성일', dataIndex: 'createdAt', width: 145, render: shortDateTime },
        { title: '처리', key: 'action', width: 110,
            render: (_, record) => (
                <Button
                    variant="ghost-sm-primary"
                    loading={reconcileMutation.isPending && reconcileMutation.variables === record.paymentId}
                    onClick={() => confirmReconcile(record)}
                >
                    PG 재확인
                </Button>
            ) },
    ];

    const issueColumns = [
        { title: '유형', dataIndex: 'issueType', width: 190, render: (value) => <Tag color="orange">{value}</Tag> },
        { title: '결제 ID', dataIndex: 'paymentId', width: 90, render: (value) => value ?? '-' },
        { title: '예약 ID', dataIndex: 'reservationId', width: 90, render: (value) => value ?? '-' },
        { title: '주문번호', dataIndex: 'merchantUid', width: ORDER_NO_COLUMN_WIDTH, className: 'reserve-table-code',
            render: (value) => <CopyableText value={value} label="주문번호" style={{ fontSize: fontSize.sm }} /> },
        { title: '원인 코드', dataIndex: 'detailCode', width: 180, render: (value) => value ?? '-' },
        { title: '발생', dataIndex: 'occurrenceCount', width: 70, render: (value) => `${value}회` },
        { title: '마지막 감지', dataIndex: 'lastSeenAt', width: 145, render: shortDateTime },
    ];

    const webhookColumns = [
        { title: '이벤트', dataIndex: 'eventType', width: 180, render: (value) => value ?? '-' },
        { title: '주문번호', dataIndex: 'merchantUid', width: ORDER_NO_COLUMN_WIDTH, className: 'reserve-table-code',
            render: (value) => <CopyableText value={value} label="주문번호" style={{ fontSize: fontSize.sm }} /> },
        { title: '상태', dataIndex: 'status', width: 110, render: (value) => <Tag color="orange">{value}</Tag> },
        { title: '시도', dataIndex: 'attemptCount', width: 70, render: (value) => `${value}회` },
        { title: '오류', dataIndex: 'lastErrorType', width: 170, render: (value) => value ?? '-' },
        { title: '다음 재시도', dataIndex: 'nextRetryAt', width: 145, render: shortDateTime },
        { title: '처리', key: 'action', width: 100,
            render: (_, record) => (
                <Button
                    variant="ghost-sm-primary"
                    loading={retryWebhookMutation.isPending && retryWebhookMutation.variables === record.id}
                    onClick={() => retryWebhookMutation.mutate(record.id)}
                >
                    재처리
                </Button>
            ) },
    ];

    const activeQuery = { ready: readyQuery, issues: issuesQuery, webhooks: webhooksQuery }[queue];
    const columns = { ready: readyColumns, issues: issueColumns, webhooks: webhookColumns }[queue];
    const data = pageContent(activeQuery?.data);
    const total = pageTotal(activeQuery?.data);
    // 수동 새로고침은 이미 보이는 결제 표를 유지한다. 페이지·기간 전환에서 남아 있는
    // placeholder만 스켈레톤으로 바꿔 이전 조건의 기록을 새 결과로 오인하지 않게 한다.
    const loading = activeQuery?.isLoading || activeQuery?.isPlaceholderData;

    const descriptions = {
        ready: '오래된 READY 결제를 PG 원장과 다시 맞춰요. PAID·금액 불일치처럼 자동 확정이 위험한 결과는 수동 대사 큐로 보내요.',
        issues: '자동으로 처리 결과를 확정하지 못한 건이에요. PG 대시보드와 주문번호를 함께 확인해주세요.',
        webhooks: '처리가 끝나지 않은 PortOne 웹훅이에요. 재처리는 같은 멱등 관문을 통과해요.',
    };

    // 목록 영역 — 오류 / 스켈레톤 / 표. 광고 큐에서는 activeQuery·columns 가 없으므로
    // 미리 계산하지 않고 렌더 시점(광고 외 큐)에만 호출한다.
    const renderTableBody = () => {
        if (activeQuery.isError) {
            return (
                <DataState state="error" kind="payment" subject="결제 운영 목록" error={activeQuery.error}
                    onRetry={activeQuery.refetch} retrying={activeQuery.isFetching} />
            );
        }
        if (loading) {
            return (
                <AdminTableSkeleton
                    rows={6}
                    cols={columns.map((column) => column.width ?? null)}
                    headers={columns.map((column) => column.title)}
                    actionBtns={queue === 'issues' ? 0 : 1}
                />
            );
        }
        return (
            <DataTable
                columns={columns}
                dataSource={data}
                rowKey={queue === 'ready' ? 'paymentId' : 'id'}
                locale={{ emptyText: '처리할 항목이 없어요.' }}
                pagination={{
                    current: page,
                    pageSize: PAGE_SIZE,
                    total,
                    onChange: setPage,
                }}
            />
        );
    };

    return (
        <div>
            <div style={{ maxWidth: 560, marginBottom: 16 }}>
                <SegmentedControl options={QUEUES} value={queue} onChange={handleQueueChange} />
            </div>

            {queue === 'ads' ? <AdPaymentOperations /> : <>
            <div style={styles.notice}>{descriptions[queue]}</div>

            <FilterToolbar
                selects={queue === 'ready' ? [{
                    value: olderThanDays,
                    onChange: handleAgeChange,
                    options: AGE_OPTIONS,
                    // 가장 긴 선택지("30일 이상"·"90일 이상")와 화살표가 들어가는 최대 폭.
                    // 건수가 있을 때 FilterToolbar는 실제 선택값 폭으로 줄여 건수와 붙인다.
                    width: 76,
                }] : []}
                count={total}
                onReload={activeQuery.refetch}
                loading={activeQuery?.isFetching}
                initialLoading={activeQuery?.isLoading}
            />

            {renderTableBody()}
            </>}
        </div>
    );
};

const styles = {
    notice: {
        padding: '12px 16px',
        marginBottom: 16,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius.md,
        background: colors.gray[50],
        color: colors.text.tertiary,
        fontSize: fontSize.sm,
        lineHeight: 1.6,
    },
};

export default PaymentOperationsTab;
