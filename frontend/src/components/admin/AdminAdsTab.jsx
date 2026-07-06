import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Typography } from 'antd';
import { Button, AdminTableSkeleton } from '../common';
import { useMessage } from '../../hooks';
import adService from '../../services/adService';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const STATUS_CONFIG = {
    PENDING_PAYMENT: { color: 'default', label: '결제 대기' },
    PAYMENT_FAILED:  { color: 'red',     label: '결제 실패' },
    ACTIVE:          { color: 'green',   label: '노출 중' },
    EXPIRED:         { color: 'default', label: '만료됨' },
    SUSPENDED:       { color: 'red',     label: '중단됨' },
};

/**
 * 관리자 광고 관리 탭 — 전체 광고 목록 조회 + 강제 중단.
 * 사전 승인 없이 결제 즉시 노출되는 방식이라, 문제되는 광고를 여기서 사후에 내린다.
 */
const AdminAdsTab = () => {
    const { message, confirm } = useMessage();
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adService.getAllAds(0, 100);
            setAds(result?.content || []);
        } catch {
            message.error('광고 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSuspend = (record) => {
        confirm({
            title: '광고 중단',
            content: `'${record.storeName}'의 광고를 중단하시겠습니까? 즉시 노출이 내려갑니다.`,
            okText: '중단', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setActionLoading(true);
                try {
                    await adService.suspendAd(record.id, '운영 정책 위반');
                    message.success('광고가 중단되었습니다.');
                    await loadData();
                } catch {
                    message.error('중단 처리에 실패했습니다.');
                } finally {
                    setActionLoading(false);
                }
            },
        });
    };

    const columns = [
        { title: '가게', dataIndex: 'storeName', key: 'storeName' },
        { title: '유형', dataIndex: 'adType', key: 'adType', render: (v) => (v === 'BADGE' ? '배지형' : '배너형') },
        { title: '기간', key: 'period', render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
        { title: '금액', dataIndex: 'amount', key: 'amount', render: (v) => `${v?.toLocaleString()}원` },
        {
            title: '상태', dataIndex: 'status', key: 'status',
            render: (v, r) => (
                <div>
                    <Tag color={STATUS_CONFIG[v]?.color}>{STATUS_CONFIG[v]?.label || v}</Tag>
                    {r.suspendReason && <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block' }}>{r.suspendReason}</Text>}
                </div>
            ),
        },
        {
            title: '처리', key: 'actions',
            render: (_, r) => (
                r.status === 'ACTIVE'
                    ? <Button variant="ghost-sm-danger" loading={actionLoading} onClick={() => handleSuspend(r)}>중단</Button>
                    : null
            ),
        },
    ];

    return loading ? (
        <AdminTableSkeleton rows={6} />
    ) : (
        <Table
            rowKey="id"
            columns={columns}
            dataSource={ads}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            locale={{ emptyText: '등록된 광고가 없습니다.' }}
        />
    );
};

export default AdminAdsTab;
