import React, { useEffect } from 'react';
import { Typography, Tag } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { UndoOutlined } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton, DataTable } from '../common';
import { useMessage, useQueryParamsState } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
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

/**
 * 2026-07-09: TanStack Query로 전환 — typeFilter가 서버 사이드 파라미터라 쿼리 키에 포함시킴
 * (adminKeys.trash() + typeFilter). placeholderData: keepPreviousData로 필터 변경 시에도
 * 이전 실제 데이터가 유지되다가 교체되어 스켈레톤이 다시 뜨지 않음.
 *
 * 2026-07 버그 수정(1차): keepPreviousData 덕에 필터를 바꿔도 스켈레톤은 안 뜨지만, 그 대신
 * 교체되는 순간까지 아무 시각적 신호도 없어서 "조용히 있다가 휙 바뀌는" 문제가 있었음.
 *
 * 2026-07 전수조사(2차 — 1차 수정을 되돌림): 1차에서 AntD Table의 loading prop을 썼는데 이건
 * AntD 기본 <Spin>("점 4개" 스피너)이라 우리 디자인 시스템과 이질적이었음 — 이 프로젝트의 목록
 * 로딩 관례는 일관되게 "스켈레톤"이므로 필터 변경 시에도 AdminTableSkeleton으로 통일
 * (AuditLogTab.jsx와 동일한 판단).
 *
 * 2026-07 전수조사(3차) — 필터/페이지를 URL 쿼리스트링에 동기화(useQueryParamState) —
 * 새로고침해도 유지되고 링크 공유도 가능해짐(MembersTab 등과 동일한 이유).
 */
// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지
// (헤더는 서버 데이터가 아닌 고정 텍스트라 Bone으로 가리지 않고 실제 글자로 노출한다)
// '핵심 정보'는 실제 columns에서 width를 안 준 유동 컬럼이라 null — 남는 공간을 혼자 흡수한다.
const SKELETON_HEADERS = ['유형', 'ID', '핵심 정보', '삭제한 관리자', '삭제일', '잔여', '처리'];
const SKELETON_COLS    = [80, 55, null, 190, 100, 60, 90];
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { type: '', page: '1' };

// 다른 관리자 탭들과 동일한 2026-07 전수조사 사유 — pagination 제어로 복구 뮤테이션 후
// 페이지 리셋 버그와, 스켈레톤 로딩 중 페이지 버튼 소멸 문제를 동시에 해결.
const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(6, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

const TrashTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const [{ type: typeFilter, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const page = Number(pageStr) || 1;
    const setPage = (p) => setQuery({ page: String(p) });

    const { data: items = [], isLoading: loading, isFetching, error: itemsError, refetch } = useQuery({
        queryKey: [...adminKeys.trash(), typeFilter],
        queryFn: async () => {
            const params = { page: 0, size: 50 };
            if (typeFilter) params.type = typeFilter;
            const data = await api.get(API_ENDPOINTS.TRASH.LIST, { params });
            return data?.content ?? [];
        },
        placeholderData: keepPreviousData,
    });
    useEffect(() => {
        if (itemsError) message.error('휴지통 목록을 불러오지 못했습니다.');
    }, [itemsError, message]);

    const invalidateTrash = () => queryClient.invalidateQueries({ queryKey: adminKeys.trash() });

    const restoreMutation = useMutation({
        mutationFn: (record) => api.post(API_ENDPOINTS.TRASH.RESTORE(record.entityType, record.entityId)),
        onSuccess: () => { message.success('복구되었습니다.'); invalidateTrash(); },
        onError: () => message.error('복구에 실패했습니다.'),
    });

    const handleRestore = (record) => {
        confirm({
            title: '복구',
            content: '이 항목을 복구하시겠습니까?',
            okText: '복구', cancelText: '취소', centered: true,
            onOk: () => restoreMutation.mutateAsync(record),
        });
    };

    // 필터로 결과가 줄면 존재하지 않는 페이지를 가리킬 수 있어 1로 복귀
    const handleTypeFilterChange = (v) => setQuery({ type: v, page: '1' });

    const daysLeft = (expiresAt) => {
        if (!expiresAt) return '-';
        const diff = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
        return diff > 0 ? `${diff}일` : '만료됨';
    };

    const isActingOn = (record) =>
        restoreMutation.isPending && restoreMutation.variables === record;

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
        { title: '처리', key: 'actions', width: 90,
            render: (_, r) => (
                <div style={{ display: 'inline-flex', gap: 8, whiteSpace: 'nowrap' }}>
                    <Button variant="ghost-sm-primary" loading={isActingOn(r)} onClick={() => handleRestore(r)}>
                        <UndoOutlined /> 복구
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
                    onChange: handleTypeFilterChange,
                    options: ENTITY_TYPE_OPTIONS,
                    width: 140,
                }]}
                count={items.length}
                onReload={refetch}
                loading={loading || isFetching}
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

            {(loading || isFetching) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(items.length, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={1}
                    pagination={items.length ? { current: page, pageSize: PAGE_SIZE, total: items.length } : null}
                />
            ) : (
                <DataTable
                    columns={columns}
                    dataSource={items}
                    rowKey="id"
                    pagination={{ current: page, pageSize: PAGE_SIZE, total: items.length, onChange: setPage }}
                    locale={{ emptyText: '휴지통에 항목이 없습니다.' }}
                />
            )}
        </div>
    );
};

export default TrashTab;
