import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Typography, Table, Tag } from 'antd';
import { FilterToolbar, AdminTableSkeleton } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';
import { ENTITY_LABELS, AUDIT_TYPE_OPTIONS } from './adminConstants';

const { Text } = Typography;

const ACTION_CONFIG = {
    SOFT_DELETE: { label: '소프트 삭제', color: 'orange' },
    RESTORE:     { label: '복구',        color: 'green'  },
    HARD_DELETE: { label: '영구 삭제',   color: 'red'    },
    SUSPEND:     { label: '정지',         color: 'gold'   },
    BAN:         { label: '영구 정지',    color: 'volcano'},
    UNBAN:       { label: '정지 해제',    color: 'cyan'   },
    APPROVED:    { label: '인증 승인',    color: 'green'  },
    REJECTED:    { label: '인증 거절',    color: 'red'    },
};

// 로그 내용 한 줄 생성
const makeLogMessage = (action, entityType, entityId, snapshot) => {
    const entity = ENTITY_LABELS[entityType]?.label || entityType;
    let detail = '';
    try {
        const obj = JSON.parse(snapshot || '{}');
        detail = obj['사유'] || obj['상호명'] || '';
    } catch { /* ignore */ }
    switch (action) {
        case 'SOFT_DELETE': return `${entity} #${entityId} 소프트 삭제 처리됨`;
        case 'RESTORE':     return `${entity} #${entityId} 복구 완료`;
        case 'HARD_DELETE': return `${entity} #${entityId} 영구 삭제 실행됨`;
        case 'SUSPEND':     return `회원 #${entityId} 제재 처리${detail ? ' — ' + detail : ''}`;
        case 'BAN':         return `회원 #${entityId} 영구 정지${detail ? ' — ' + detail : ''}`;
        case 'UNBAN':       return `회원 #${entityId} 정지 해제`;
        case 'APPROVED':    return `회원 #${entityId} 사업자 인증 승인${detail ? ' — ' + detail : ''}`;
        case 'REJECTED':    return `회원 #${entityId} 사업자 인증 거절${detail ? ' — ' + detail : ''}`;
        default:            return `${entity} #${entityId} ${action}`;
    }
};

// 처리자 표시 — 이메일이면 사용자/관리자, system이면 스케줄러명
const formatActor = (actorEmail) => {
    if (!actorEmail || actorEmail === 'system') return 'TrashCleanupScheduler';
    return actorEmail;
};

// 최초 로딩 전용 스켈레톤 — AdminTableSkeleton과 동일한 톤 유지
const SkeletonRows = () => <AdminTableSkeleton rows={8} cols={[155, 115, 120, 300, 200]} />;

const AuditLogTab = () => {
    const { message } = useMessage();
    const [logs, setLogs]               = useState([]);
    const [loading, setLoading]         = useState(false);
    const [typeFilter, setTypeFilter]   = useState('');
    const [page, setPage]               = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    // 첫 마운트 때만 스켈레톤 — 이후 새로고침/페이지전환은 Table을 그대로 유지한 채 데이터만 교체
    // (Table을 언마운트하면 헤더/페이지네이션까지 같이 사라졌다 나타나며 깜빡임 발생)
    const hasLoadedOnceRef = useRef(false);

    const load = useCallback(async (p = 0) => {
        setLoading(true);
        try {
            const params = { page: p, size: 10 };
            if (typeFilter) params.type = typeFilter;
            const data = await api.get(API_ENDPOINTS.AUDIT_LOG.LIST, { params });
            setLogs(data?.content ?? []);
            const total = data?.totalElements ?? data?.page?.totalElements ?? 0;
            setTotalElements(total);
            setPage(p);
        } catch {
            message.error('시스템 로그를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
            hasLoadedOnceRef.current = true;
        }
    }, [message, typeFilter]);

    useEffect(() => { load(0); }, [load]);

    const columns = [
        {
            title: '일시', dataIndex: 'createdAt', key: 'createdAt', width: 155,
            render: (v) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary, whiteSpace: 'nowrap' }}>
                    {v ? v.substring(0, 16).replace('T', ' ') : '-'}
                </Text>
            ),
        },
        {
            title: '행위', dataIndex: 'action', key: 'action', width: 115,
            render: (v) => {
                const cfg = ACTION_CONFIG[v] || { label: v, color: 'default' };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
        {
            title: '대상', key: 'target', width: 120,
            render: (_, r) => {
                const cfg = ENTITY_LABELS[r.entityType] || { label: r.entityType, color: 'default' };
                return (
                    <span style={{ whiteSpace: 'nowrap' }}>
                        <Tag color={cfg.color} style={{ marginRight: 4 }}>{cfg.label}</Tag>
                        <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>#{r.entityId}</Text>
                    </span>
                );
            },
        },
        {
            title: '로그 내용', key: 'logMessage',
            render: (_, r) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>
                    {makeLogMessage(r.action, r.entityType, r.entityId, r.snapshot)}
                </Text>
            ),
        },
        {
            title: '처리자', dataIndex: 'actorEmail', key: 'actorEmail', width: 200,
            render: (v) => (
                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>
                    {formatActor(v)}
                </Text>
            ),
        },
    ];

    return (
        <div>
            {/* 다른 관리자 탭과 동일한 FilterToolbar 패턴: 필터 Select + 건수 + 새로고침(3초 쿨다운) 한 줄 */}
            <FilterToolbar
                selects={[{
                    value: typeFilter,
                    onChange: (v) => { setTypeFilter(v); load(0); },
                    options: AUDIT_TYPE_OPTIONS,
                    width: 140,
                }]}
                count={totalElements}
                onReload={() => load(page)}
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
                소프트 삭제, 복구, 영구 삭제 등 관리자 행위가 기록됩니다. 로그는 90일 후 자동 삭제됩니다.
            </div>

            {/* 첫 로딩에만 스켈레톤. 이후로는 Table을 절대 언마운트하지 않음
              * → 새로고침/페이지전환 시 헤더·페이지네이션이 그대로 유지되고 데이터만 교체됨 (깜빡임 없음) */}
            {!hasLoadedOnceRef.current && loading ? (
                <SkeletonRows />
            ) : (
                <Table
                    columns={columns}
                    dataSource={logs}
                    rowKey="id"
                    size="middle"
                    scroll={{ x: 800 }}
                    pagination={{
                        current: page + 1,
                        pageSize: 10,
                        total: totalElements,
                        showSizeChanger: false,
                        onChange: (p) => load(p - 1),
                    }}
                    locale={{ emptyText: '시스템 로그가 없습니다.' }}
                />
            )}
        </div>
    );
};

export default AuditLogTab;
