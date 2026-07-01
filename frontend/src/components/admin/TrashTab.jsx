import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Typography, Table, Tag } from 'antd';
import { DeleteOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';
import { ENTITY_LABELS, ENTITY_TYPE_OPTIONS } from './adminConstants';

const { Text } = Typography;

const SnapshotChips = ({ value }) => {
    if (!value) return <Text type="secondary" style={{ fontSize: fontSize.sm }}>-</Text>;
    let obj = null;
    try { obj = JSON.parse(value); } catch { /* invalid JSON */ }
    if (!obj) return <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>{value}</Text>;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(obj).map(([k, v]) => (
                <span key={k} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    background: colors.gray[50],
                    border: `1px solid ${colors.border.light}`,
                    borderRadius: 6, padding: '2px 8px',
                    fontSize: fontSize.xs, whiteSpace: 'nowrap',
                }}>
                    <span style={{ color: colors.text.tertiary }}>{k}</span>
                    <span style={{ color: colors.text.primary, fontWeight: 500 }}>{v}</span>
                </span>
            ))}
        </div>
    );
};

const TrashTab = () => {
    const { message, confirm } = useMessage();
    const [items, setItems]           = useState([]);
    const [loading, setLoading]       = useState(false);
    const [typeFilter, setTypeFilter] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // 최초 1회 로딩 완료 추적 — 이후로는 Table을 절대 언마운트하지 않음 (페이지네이션 깜빡임 방지)
    const hasLoadedOnceRef = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        // setItems([]) 제거 — 로딩 중에도 기존 데이터/페이지네이션 유지
        try {
            const params = { page: 0, size: 50 };
            if (typeFilter) params.type = typeFilter;
            const data = await api.get(API_ENDPOINTS.TRASH.LIST, { params });
            setItems(data?.content ?? []);
        } catch {
            message.error('휴지통 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
            hasLoadedOnceRef.current = true;
        }
    }, [message, typeFilter]);

    useEffect(() => { load(); }, [load]);

    const handleRestore = (record) => {
        confirm({
            title: '복구',
            content: '이 항목을 복구하시겠습니까?',
            okText: '복구', cancelText: '취소', centered: true,
            onOk: async () => {
                setActionLoading(true);
                try {
                    await api.post(API_ENDPOINTS.TRASH.RESTORE(record.entityType, record.entityId));
                    message.success('복구되었습니다.');
                    await load();
                } catch {
                    message.error('복구에 실패했습니다.');
                } finally {
                    setActionLoading(false);
                }
            },
        });
    };

    const handleHardDelete = (record) => {
        confirm({
            title: '영구 삭제',
            content: '이 항목을 영구 삭제하시겠습니까? 되돌릴 수 없습니다.',
            okText: '영구 삭제', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setActionLoading(true);
                try {
                    await api.delete(API_ENDPOINTS.TRASH.DELETE(record.entityType, record.entityId));
                    message.success('영구 삭제되었습니다.');
                    await load();
                } catch {
                    message.error('영구 삭제에 실패했습니다.');
                } finally {
                    setActionLoading(false);
                }
            },
        });
    };

    const daysLeft = (expiresAt) => {
        if (!expiresAt) return '-';
        const diff = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
        return diff > 0 ? `${diff}일` : '만료됨';
    };

    const columns = [
        { title: '유형', dataIndex: 'entityType', key: 'entityType', width: 80,
            render: (v) => { const cfg = ENTITY_LABELS[v] || { label: v, color: 'default' }; return <Tag color={cfg.color}>{cfg.label}</Tag>; } },
        { title: 'ID', dataIndex: 'entityId', key: 'entityId', width: 55,
            render: (v) => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{v}</Text> },
        { title: '핵심 정보', dataIndex: 'snapshot', key: 'snapshot',
            render: (v) => <SnapshotChips value={v} /> },
        { title: '삭제한 관리자', dataIndex: 'actorEmail', key: 'actorEmail', width: 190,
            render: (v) => <Text style={{ fontSize: fontSize.sm }}>{v || '-'}</Text> },
        { title: '삭제일', dataIndex: 'createdAt', key: 'createdAt', width: 100,
            render: (v) => <Text style={{ fontSize: fontSize.sm }}>{v?.substring(0, 10) || '-'}</Text> },
        { title: '잔여', dataIndex: 'expiresAt', key: 'expiresAt', width: 60,
            render: (v) => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{daysLeft(v)}</Text> },
        { title: '처리', key: 'actions', width: 150,
            render: (_, r) => (
                <div style={{ display: 'inline-flex', gap: 8, whiteSpace: 'nowrap' }}>
                    <Button variant="ghost-sm-primary" loading={actionLoading} onClick={() => handleRestore(r)}>
                        <UndoOutlined /> 복구
                    </Button>
                    <Button variant="ghost-sm-danger" loading={actionLoading} onClick={() => handleHardDelete(r)}>
                        <DeleteOutlined /> 영구삭제
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            {/* 다른 관리자 탭과 동일한 FilterToolbar 패턴: 3초 쿨다운(rate limit) 내장 */}
            <FilterToolbar
                selects={[{
                    value: typeFilter,
                    onChange: setTypeFilter,
                    options: ENTITY_TYPE_OPTIONS,
                    width: 140,
                }]}
                count={items.length}
                onReload={load}
                loading={loading}
            />

            <div style={{
                background: colors.gray[50],
                border: `1px solid ${colors.border.light}`,
                borderRadius: radius.md,
                padding: '10px 16px',
                marginBottom: 16,
                fontSize: fontSize.sm,
                color: colors.text.tertiary,
            }}>
                소프트 삭제된 항목은 30일 후 자동으로 영구 삭제됩니다. 복구가 필요한 항목은 기간 내에 복구하세요.
            </div>

            {/* 첫 로딩에만 스켈레톤. 이후로는 Table을 절대 언마운트하지 않음 (페이지네이션 깜빡임 방지) */}
            {!hasLoadedOnceRef.current && loading ? (
                <AdminTableSkeleton rows={6} />
            ) : (
                <Table
                    columns={columns}
                    dataSource={items}
                    rowKey="id"
                    size="middle"
                    scroll={{ x: 800 }}
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    locale={{ emptyText: '휴지통에 항목이 없습니다.' }}
                />
            )}
        </div>
    );
};

export default TrashTab;
