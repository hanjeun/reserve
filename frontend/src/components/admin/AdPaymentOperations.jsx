import React, { useState } from 'react';
import { Alert, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { AdminTableSkeleton, Button, DataTable, FilterToolbar, SegmentedControl } from '../common';
import { useMessage } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { formatCurrency } from '../../utils';

const PAGE_SIZE = 20;
const LABELS = {
    READY: '결제 대기', PAID: '결제 확인', FAILED: '결제 실패',
    REFUND_PENDING: '환불 확인 중', REFUNDED: '환불 완료', REVIEW_REQUIRED: '대사 필요',
};
const FILTERS = [{ value: 'open', label: '확인 필요' }, { value: 'all', label: '전체 이력' }];

/** 광고 시도 원장은 예약 결제와 분리한다. 조회와 금융 작업 버튼도 구별한다. */
const AdPaymentOperations = () => {
    const [page, setPage] = useState(1);
    const [openOnly, setOpenOnly] = useState(true);
    const { message, confirm } = useMessage();
    const client = useQueryClient();
    const query = useQuery({
        queryKey: [...adminKeys.paymentOperations(), 'ad-attempts', openOnly, page],
        queryFn: () => api.get('/api/admin/ad-payments', { params: { page: page - 1, size: PAGE_SIZE, openOnly } }),
        placeholderData: keepPreviousData,
    });
    const action = useMutation({
        mutationFn: ({ id, operation }) => api.post(`/api/admin/ad-payments/${id}/${operation}`),
        onSuccess: result => message.info(`현재 상태: ${LABELS[result.state] ?? '확인 필요'}`),
        onError: err => message.error(err instanceof Error ? err.message : '처리 결과를 확인하지 못했습니다.'),
        onSettled: () => client.invalidateQueries({ queryKey: adminKeys.paymentOperations() }),
    });
    const run = (record, operation) => confirm({
        title: operation === 'refund' ? '광고 결제 전액 환불 요청' : '광고 결제 대사·미결 처리',
        content: operation === 'refund'
            ? `광고 #${record.adId}, 주문 ${record.merchantUid}, ${formatCurrency(record.amount)} 전액 환불을 요청합니다. PG를 재확인하고, 결과가 불확실한 이전 발신은 중복 실행하지 않습니다.`
            : `주문 ${record.merchantUid}를 PG에서 재확인합니다. 이미 저장된 취소 요청이 있으면 최초 환불 요청도 실행될 수 있습니다.`,
        okText: operation === 'refund' ? '환불 요청' : '대사·처리',
        cancelText: '취소',
        onOk: () => action.mutateAsync({ id: record.id, operation }),
    });
    const columns = [
        { title: '시도', dataIndex: 'id', width: 80, fixed: 'left' },
        { title: '광고', dataIndex: 'adId', width: 80 },
        { title: '주문번호', dataIndex: 'merchantUid', width: 320 },
        { title: '금액', dataIndex: 'amount', width: 110, render: formatCurrency },
        { title: '상태', dataIndex: 'state', width: 150,
            render: state => <Tag color={state === 'REFUNDED' ? 'success' : 'default'}>{LABELS[state] ?? '확인 필요'}</Tag> },
        { title: 'PG 상태', dataIndex: 'pgStatus', width: 110, render: value => value ?? '조회 전' },
        { title: '대사 사유', dataIndex: 'issueCode', width: 320, render: value => value ?? '-' },
        { title: '처리', width: 230, render: (_, record) => (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="ghost-sm-primary" disabled={action.isPending} onClick={() => run(record, 'reconcile')}>대사·처리</Button>
                {record.issueCode && record.pgStatus === 'PAID' && !record.refundDispatchedAt && (
                    <Button variant="ghost-sm-danger" disabled={action.isPending} onClick={() => run(record, 'refund')}>환불 요청</Button>
                )}
            </div>
        ) },
    ];
    return (
        <div>
            <p>결제 시도별 기록입니다. 취소 요청과 환불 완료는 다릅니다. 과거에 덮어쓴 주문번호는 별도 PG 이력 대사가 필요합니다.</p>
            <SegmentedControl options={FILTERS} value={openOnly ? 'open' : 'all'} onChange={value => { setOpenOnly(value === 'open'); setPage(1); }} />
            <FilterToolbar count={query.data?.page?.totalElements ?? query.data?.totalElements ?? 0}
                onReload={query.refetch} loading={query.isFetching} />
            {query.isError ? <Alert type="error" showIcon title="광고 결제 원장을 불러오지 못했습니다. 새로고침해주세요." />
                : query.isPending ? <AdminTableSkeleton rows={6} headers={columns.map(column => column.title)} cols={columns.map(column => column.width)} />
                    : <DataTable columns={columns} dataSource={query.data?.content ?? []} rowKey="id"
                        locale={{ emptyText: '표시할 광고 결제 시도가 없습니다.' }}
                        pagination={{ current: page, pageSize: PAGE_SIZE,
                            total: query.data?.page?.totalElements ?? query.data?.totalElements ?? 0, onChange: setPage }} />}
        </div>
    );
};

export default AdPaymentOperations;
