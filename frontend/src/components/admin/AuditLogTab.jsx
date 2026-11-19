import React from 'react';
import { Typography, Tag } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { FilterToolbar, AdminTableSkeleton, DataState, PagedDataTable } from '../common';
import { useQueryParamsState } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
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
    ACCOUNT_PROTECTED: { label: '계정 보호', color: 'volcano' },
    RECOVERY_MAIL_RETRY: { label: '복구 메일 재발송', color: 'blue' },
    ACCOUNT_RECOVERED: { label: '계정 복구', color: 'green' },
    NO_SHOW_CORRECTION: { label: '노쇼 제한 정정', color: 'blue' },
    NO_SHOW_UNDONE: { label: '노쇼 복구', color: 'blue' },
    BOOKING_RESTRICTED: { label: '가게 예약 제한', color: 'red' },
    BOOKING_RELEASED: { label: '가게 예약 제한 해제', color: 'blue' },
    RECEIPT_LOOKUP: { label: '영수증 조회', color: 'blue' },
};

// 로그 내용 한 줄 생성
const makeLogMessage = (action, entityType, entityId, snapshot) => {
    const entity = ENTITY_LABELS[entityType]?.label || entityType;
    let fields = {};
    try {
        fields = JSON.parse(snapshot || '{}') ?? {};
    } catch { /* 스냅샷을 읽지 못하면 공통 감사 문구만 표시한다. */ }
    const detail = fields['사유'] || fields['상호명'] || '';
    switch (action) {
        case 'SOFT_DELETE': return `${entity} #${entityId} 소프트 삭제 처리됨`;
        case 'RESTORE':     return `${entity} #${entityId} 복구 완료`;
        case 'HARD_DELETE': return `${entity} #${entityId} 영구 삭제 실행됨`;
        case 'SUSPEND':     return `회원 #${entityId} 제재 처리${detail ? ' — ' + detail : ''}`;
        case 'BAN':         return `회원 #${entityId} 영구 정지${detail ? ' — ' + detail : ''}`;
        case 'UNBAN':       return `회원 #${entityId} 정지 해제`;
        case 'APPROVED':    return `회원 #${entityId} 사업자 인증 승인${detail ? ' — ' + detail : ''}`;
        case 'REJECTED':    return `회원 #${entityId} 사업자 인증 거절${detail ? ' — ' + detail : ''}`;
        case 'ACCOUNT_PROTECTED': return `회원 #${entityId} 계정 보호 시작${detail ? ' · ' + detail : ''}`;
        case 'RECOVERY_MAIL_RETRY': return `회원 #${entityId} 복구 메일 재발송 요청`;
        case 'ACCOUNT_RECOVERED': return `회원 #${entityId} 소유자 계정 복구 완료`;
        case 'NO_SHOW_CORRECTION': return `예약 #${entityId} 노쇼 제한 기록 정정`;
        case 'NO_SHOW_UNDONE': return `예약 #${entityId} 노쇼 처리 복구`;
        case 'BOOKING_RESTRICTED': return `회원 #${entityId} 가게 예약 제한`;
        case 'BOOKING_RELEASED': return `회원 #${entityId} 가게 예약 제한 해제`;
        case 'RECEIPT_LOOKUP': return `${fields['결제 유형'] === 'ad' ? '광고 ' : '예약 '}결제 #${entityId} 영수증 조회`
            + (fields['문의 번호'] ? ` · 문의 #${fields['문의 번호']}` : '');
        default:            return `${entity} #${entityId} ${action}`;
    }
};

// 처리자 표시 — 이메일이면 사용자/관리자, system이면 스케줄러명
const formatActor = (actorEmail) => {
    if (!actorEmail || actorEmail === 'system') return 'TrashCleanupScheduler';
    if (/^admin:\d+$/.test(actorEmail)) return '관리자 #' + actorEmail.split(':')[1];
    if (/^member:\d+$/.test(actorEmail)) return '소유자 #' + actorEmail.split(':')[1];
    return actorEmail;
};

// 스켈레톤 — 실제 테이블 컬럼과 1:1로 대응
const PAGE_SIZE = 10;
const QUERY_DEFAULTS = { type: '', page: '0' };
const SKELETON_HEADERS = ['일시', '행위', '대상', '로그 내용', '처리자'];
// '로그 내용'은 실제 columns에서 width를 안 준 유동 컬럼이라 null로 표시한다 —
// 그래야 스켈레톤도 실제 테이블처럼 "고정 컬럼은 지정 폭, 로그 내용이 남는 공간 흡수"가 된다.
const SKELETON_COLS    = [155, 115, 120, null, 200];

/*
 * 전체 건수를 알면 마지막 페이지의 실제 행 수만큼 골격을 표시하고 최초 조회는 pageSize를 사용한다.
 */
const skeletonRowCount = (total, pageIdx, pageSize) => {
    if (!total) return pageSize;
    const remaining = total - pageIdx * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

/*
 * 조회 조건은 URL·쿼리 키에 포함하고 갱신 중 기존 행과 페이지 영역을 유지한다.
 */
const AuditLogTab = () => {
    const [{ type: typeFilter, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const page = Number(pageStr) || 0;
    const setPage = (p) => setQuery({ page: String(p) });

    const { data, isLoading: loading, isFetching, isPlaceholderData, error, refetch } = useQuery({
        queryKey: [...adminKeys.auditLogs(), typeFilter, page],
        queryFn: async () => {
            const params = { page, size: PAGE_SIZE };
            if (typeFilter) params.type = typeFilter;
            const result = await api.get(API_ENDPOINTS.AUDIT_LOG.LIST, { params });
            return {
                logs: result?.content ?? [],
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        placeholderData: keepPreviousData,
    });
    const logs = data?.logs ?? [];
    const totalElements = data?.totalElements ?? 0;

    // 연속 갱신이 앞선 값을 덮지 않도록 필터와 페이지를 함께 바꾼다.
    const handleFilterChange = (v) => setQuery({ type: v, page: '0' });

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

    // 로그 목록 영역 — 오류 / 스켈레톤 / 표 중 하나.
    let logsContent;
    if (error) {
        logsContent = (
            <DataState state="error" subject="시스템 로그" error={error}
                onRetry={refetch} retrying={isFetching} />
        );
    } else {
        logsContent = (
            <PagedDataTable
                placeholder={(loading || isPlaceholderData) && <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS} headers={SKELETON_HEADERS} actionBtns={0} />}
                columns={columns}
                dataSource={logs}
                rowKey="id"
                /* 모바일에서 오른쪽 열(로그 내용·처리자)을 보려고 밀면 "일시"가 사라져
                   어느 행을 읽고 있는지 알 수 없었다 — 식별 열이므로 왼쪽에 고정한다. */
                stickyFirstColumn
                pagination={{
                    current: page + 1,
                    pageSize: PAGE_SIZE,
                    total: totalElements,
                    showSizeChanger: false,
                    onChange: (p) => setPage(p - 1),
                }}
                locale={{ emptyText: '시스템 로그가 없어요.' }}
            />
        );
    }

    return (
        <div>
            {/* 다른 관리자 탭과 동일한 FilterToolbar 패턴: 필터 Select + 건수 + 새로고침(3초 쿨다운) 한 줄 */}
            <FilterToolbar
                selects={[{
                    value: typeFilter,
                    onChange: handleFilterChange,
                    options: AUDIT_TYPE_OPTIONS,
                    width: 140,
                }]}
                count={totalElements}
                onReload={refetch}
                loading={loading || isFetching}
                initialLoading={loading}
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
                소프트 삭제, 복구, 영구 삭제 등 관리자 행위가 기록돼요. 로그는 90일 후 자동 삭제돼요.
            </div>

            {logsContent}
        </div>
    );
};

export default AuditLogTab;
