import React, { useState, useCallback, useEffect } from 'react';
import { Typography, Table, Tag, Select, Skeleton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Button } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';

const { Text } = Typography;

const ACTION_CONFIG = {
    SOFT_DELETE:  { label: '소프트 삭제', color: 'orange'  },
    RESTORE:      { label: '복구',        color: 'green'   },
    HARD_DELETE:  { label: '영구 삭제',   color: 'red'     },
};

const ENTITY_LABELS = {
    MAIL:        { label: '수신 메일',  color: 'blue'    },
    SENT_MAIL:   { label: '발송 메일',  color: 'cyan'    },
    MEMBER:      { label: '회원',       color: 'purple'  },
    STORE:       { label: '가게',       color: 'green'   },
    RESERVATION: { label: '예약',       color: 'orange'  },
    REVIEW:      { label: '리뷰',       color: 'volcano' },
};

const TYPE_OPTIONS = [
    { value: '',            label: '전체 유형' },
    { value: 'MAIL',        label: '수신 메일' },
    { value: 'SENT_MAIL',   label: '발송 메일' },
    { value: 'MEMBER',      label: '회원' },
    { value: 'STORE',       label: '가게' },
    { value: 'RESERVATION', label: '예약' },
    { value: 'REVIEW',      label: '리뷰' },
];

const AuditLogTab = () => {
    const { message } = useMessage();
    const [logs, setLogs]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [typeFilter, setTypeFilter] = useState('');
    const [page, setPage]         = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const load = useCallback(async (p = 0) => {
        setLoading(true);
        try {
            const params = { page: p, size: 30 };
            if (typeFilter) params.type = typeFilter;
            const data = await api.get(API_ENDPOINTS.AUDIT_LOG.LIST, { params });
            setLogs(data?.content ?? []);
            setTotalElements(data?.totalElements ?? 0);
            setPage(p);
        } catch {
            message.error('시스템 로그를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [message, typeFilter]);

    useEffect(() => { load(0); }, [load]);

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

    const columns = [
        {
            title: '행위', dataIndex: 'action', key: 'action', width: 110,
            render: (v) => {
                const cfg = ACTION_CONFIG[v] || { label: v, color: 'default' };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
        {
            title: '대상 유형', dataIndex: 'entityType', key: 'entityType', width: 110,
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
            title: '스냅샷', dataIndex: 'snapshot', key: 'snapshot',
            ellipsis: true,
            render: (v) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>
                    {formatSnapshot(v)}
                </Text>
            ),
        },
        {
            title: '처리자', dataIndex: 'actorEmail', key: 'actorEmail', width: 200,
            render: (v) => <Text style={{ fontSize: fontSize.sm }}>{v || 'system'}</Text>,
        },
        {
            title: '일시', dataIndex: 'createdAt', key: 'createdAt', width: 170,
            render: (v) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                    {v ? v.substring(0, 16).replace('T', ' ') : '-'}
                </Text>
            ),
        },
    ];

    return (
        <div>
            {/* 툴바 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Select
                    value={typeFilter}
                    onChange={(v) => { setTypeFilter(v); }}
                    options={TYPE_OPTIONS}
                    size="large"
                    style={{ width: 160 }}
                />
                {!loading && (
                    <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                        총 {totalElements}건
                    </Text>
                )}
                <Button
                    variant="ghost-sm"
                    size="md"
                    loading={loading}
                    onClick={() => load(0)}
                    style={{ marginLeft: 'auto' }}
                >
                    <ReloadOutlined /> 새로고침
                </Button>
            </div>

            {/* 안내 */}
            <div style={{
                background: colors.background.subtle,
                border: `1px solid ${colors.border.light}`,
                borderRadius: radius.md,
                padding: '10px 16px',
                marginBottom: 16,
                fontSize: fontSize.sm,
                color: colors.text.tertiary,
            }}>
                소프트 삭제, 복구, 영구 삭제 등 관리자 행위가 기록됩니다. 로그는 90일 후 자동 삭제됩니다.
            </div>

            {/* 테이블 */}
            {loading
                ? <Skeleton active paragraph={{ rows: 8 }} />
                : (
                    <Table
                        columns={columns}
                        dataSource={logs}
                        rowKey="id"
                        size="middle"
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            current: page + 1,
                            pageSize: 30,
                            total: totalElements,
                            showSizeChanger: false,
                            onChange: (p) => load(p - 1),
                        }}
                        locale={{ emptyText: '시스템 로그가 없습니다.' }}
                    />
                )
            }
        </div>
    );
};

export default AuditLogTab;
