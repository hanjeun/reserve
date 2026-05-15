import React, { useState, useCallback, useEffect } from 'react';
import { Typography, Table, Tag, Select, Modal, Skeleton } from 'antd';
import { DeleteOutlined, SyncOutlined, UndoOutlined } from '@ant-design/icons';
import { Button } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';
import { ENTITY_LABELS, ENTITY_TYPE_OPTIONS } from './adminConstants';

const { Text } = Typography;

const TYPE_OPTIONS = ENTITY_TYPE_OPTIONS;

const TrashTab = () => {
    const { message, confirm } = useMessage();
    const [items, setItems]       = useState([]);
    const [loading, setLoading]   = useState(false);
    const [typeFilter, setTypeFilter] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page: 0, size: 50 };
            if (typeFilter) params.type = typeFilter;
            const data = await api.get(API_ENDPOINTS.TRASH.LIST, { params });
            setItems(data?.content ?? []);
        } catch {
            message.error('휴지통 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [message, typeFilter]);

    useEffect(() => { load(); }, [load]);

    const handleRestore = (record) => {
        confirm({
            title: '복구',
            content: `이 항목을 복구하시겠습니까?`,
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
            content: `이 항목을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
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

    const formatSnapshot = (snapshot) => {
        if (!snapshot) return '-';
        try {
            const obj = JSON.parse(snapshot);
            return Object.entries(obj)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' / ');
        } catch {
            return snapshot;
        }
    };

    const daysLeft = (expiresAt) => {
        if (!expiresAt) return '-';
        const diff = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
        return diff > 0 ? `${diff}일 후 자동삭제` : '만료됨';
    };

    const columns = [
        {
            title: '유형', dataIndex: 'entityType', key: 'entityType', width: 100,
            render: (v) => {
                const cfg = ENTITY_LABELS[v] || { label: v, color: 'default' };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
        {
            title: 'ID', dataIndex: 'entityId', key: 'entityId', width: 70,
            render: (v) => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{v}</Text>,
        },
        {
            title: '핵심 정보', dataIndex: 'snapshot', key: 'snapshot',
            ellipsis: true,
            render: (v) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>
                    {formatSnapshot(v)}
                </Text>
            ),
        },
        {
            title: '삭제한 관리자', dataIndex: 'actorEmail', key: 'actorEmail', width: 180,
            render: (v) => <Text style={{ fontSize: fontSize.sm }}>{v || '-'}</Text>,
        },
        {
            title: '삭제일', dataIndex: 'createdAt', key: 'createdAt', width: 110,
            render: (v) => <Text style={{ fontSize: fontSize.sm }}>{v?.substring(0, 10) || '-'}</Text>,
        },
        {
            title: '남은 기간', dataIndex: 'expiresAt', key: 'expiresAt', width: 130,
            render: (v) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                    {daysLeft(v)}
                </Text>
            ),
        },
        {
            title: '처리', key: 'actions', fixed: 'right', width: 160,
            render: (_, r) => (
                <div style={{ display: 'inline-flex', gap: 8, whiteSpace: 'nowrap' }}>
                    <Button
                        variant="ghost-sm-primary"
                        loading={actionLoading}
                        onClick={() => handleRestore(r)}
                    >
                        <UndoOutlined /> 복구
                    </Button>
                    <Button
                        variant="ghost-sm-danger"
                        loading={actionLoading}
                        onClick={() => handleHardDelete(r)}
                    >
                        <DeleteOutlined /> 영구삭제
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div>
            {/* 툴바 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Select
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={TYPE_OPTIONS}
                    size="large"
                    style={{ width: 140 }}
                />
                {!loading && (
                    <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                        복구 가능한 항목 {items.length}개
                    </Text>
                )}
                <Button
                    variant="ghost-sm"
                    size="md"
                    onClick={load}
                    disabled={loading}
                    style={{ marginLeft: 'auto' }}
                >
                    <SyncOutlined spin={loading} /> 새로고침
                </Button>
            </div>

            {/* 안내 문구 */}
            <div style={{
                background: colors.background.subtle,
                border: `1px solid ${colors.border.light}`,
                borderRadius: radius.md,
                padding: '10px 16px',
                marginBottom: 16,
                fontSize: fontSize.sm,
                color: colors.text.tertiary,
            }}>
                소프트 삭제된 항목은 30일 후 자동으로 영구 삭제됩니다. 복구가 필요한 항목은 기간 내에 복구하세요.
            </div>

            {/* 테이블 */}
            {loading
                ? <Skeleton active paragraph={{ rows: 6 }} />
                : (
                    <Table
                        columns={columns}
                        dataSource={items}
                        rowKey="id"
                        size="middle"
                        scroll={{ x: 'max-content' }}
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        locale={{ emptyText: '휴지통에 항목이 없습니다.' }}
                    />
                )
            }
        </div>
    );
};

export default TrashTab;
