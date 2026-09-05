/**
 * RESERVE - 관리자 전체 예약 탭
 * AdminPanel.jsx에서 분리 (Cognitive Complexity 17 → 15 목표)
 *
 * 2026-07-09: TanStack Query로 전환 (adminKeys.reservations()) + placeholderData:
 * keepPreviousData, 삭제도 useMutation, raw <Table> → 공용 DataTable.
 *
 * 2026-07 전수조사 — 검색어/상태 필터/페이지를 URL 쿼리스트링에 동기화(useQueryParamState) —
 * 새로고침해도 필터가 유지되고 링크 공유도 가능해짐(MembersTab과 동일한 이유).
 */
import React, { useEffect } from 'react';
import { Typography, Tag } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton, DataTable } from '../common';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';
import { formatTime, formatCurrency } from '../../utils';

const { Text } = Typography;

const RES_STATUS_CONFIG = {
    PENDING:   { color: 'orange',  label: '대기 중' },
    CONFIRMED: { color: 'blue',    label: '승인됨' },
    CANCELLED: { color: 'default', label: '취소됨' },
    COMPLETED: { color: 'green',   label: '이용완료' },
    REJECTED:  { color: 'red',     label: '거절됨' },
    NO_SHOW:   { color: 'purple',  label: '노쇼' },
    UNCONFIRMED: { color: 'gold', label: '미확인' },
};

const RES_STATUS_OPTIONS = [
    { value: 'ALL', label: '전체 상태' }, { value: 'PENDING', label: '대기 중' },
    { value: 'CONFIRMED', label: '승인됨' }, { value: 'CANCELLED', label: '취소됨' },
    { value: 'COMPLETED', label: '이용완료' }, { value: 'REJECTED', label: '거절됨' },
    { value: 'NO_SHOW', label: '노쇼' }, { value: 'UNCONFIRMED', label: '미확인' },
];

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지 (2026-07 전수조사)
// 예전엔 cols를 7개만 넘겨서 실제 8컬럼 테이블과 안 맞았고, headers는 아예 안 넘겨서
// 고정 텍스트인 컬럼 제목까지 회색 막대로 그려졌다.
const SKELETON_HEADERS = ['가게', '예약자', '날짜', '시간', '인원', '예약금', '상태', '처리'];
const SKELETON_COLS    = [130, 100, 110, 80, 60, 90, 90, 80];
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', status: 'ALL', page: '1' };

// MembersTab/StoresAdminTab과 동일한 2026-07 전수조사 사유 — pagination 제어로 삭제 뮤테이션 후
// 페이지 리셋 버그와 스켈레톤 로딩 중 페이지 버튼 소멸 문제를 동시에 해결.
const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

const ReservationsAllTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const [{ search: resSearch, status: resStatusFilter, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedResSearch = useDebounce(resSearch, 300);
    const page = Number(pageStr) || 1;
    const setPage = (p) => setQuery({ page: String(p) });

    const { data, isLoading: resLoading, isFetching, error: resError, refetch: loadReservations } = useQuery({
        queryKey: [...adminKeys.reservations(), page, debouncedResSearch, resStatusFilter],
        queryFn: async () => {
            const result = await api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS, {
                params: {
                    page: page - 1,
                    size: PAGE_SIZE,
                    ...(debouncedResSearch.trim() ? { search: debouncedResSearch.trim() } : {}),
                    ...(resStatusFilter !== 'ALL' ? { status: resStatusFilter } : {}),
                },
            });
            return {
                reservations: Array.isArray(result) ? result : (result?.content ?? []),
                totalElements: Array.isArray(result)
                    ? result.length
                    : (result?.page?.totalElements ?? result?.totalElements ?? 0),
            };
        },
        placeholderData: keepPreviousData,
    });
    const reservations = data?.reservations ?? [];
    const totalElements = data?.totalElements ?? 0;
    useEffect(() => {
        if (resError) message.error('예약 목록을 불러오지 못했습니다.');
    }, [resError, message]);

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(API_ENDPOINTS.ADMIN_MANAGE.RESERVATION_DELETE(id)),
        onSuccess: () => {
            message.success('휴지통으로 이동되었습니다.');
            queryClient.invalidateQueries({ queryKey: adminKeys.reservations() });
        },
        onError: () => message.error('삭제에 실패했습니다.'),
    });

    const handleSoftDeleteReservation = (r) => confirm({
        title: '예약 휴지통으로 이동', content: `예약 #${r.id}을 휴지통으로 이동하시겠습니까?`,
        okText: '삭제', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
        onOk: () => deleteMutation.mutateAsync(r.id),
    });

    // 검색·상태는 서버 전체 집합에 적용한다. 조건이 바뀌면 페이지를 1로 복귀시킨다.
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });
    const handleStatusFilterChange = (v) => setQuery({ status: v, page: '1' });

    const reservationColumns = [
        { title: '가게',  dataIndex: 'storeName',       key: 'storeName',       width: 130, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '예약자', dataIndex: 'memberName',      key: 'memberName',      width: 100, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '날짜',  dataIndex: 'reservationDate', key: 'reservationDate', width: 110, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '시간',  dataIndex: 'reservationTime', key: 'reservationTime', width: 80,  render: v => <Text style={{ fontSize: fontSize.sm }}>{formatTime(v)}</Text> },
        { title: '인원',  dataIndex: 'guestCount',      key: 'guestCount',      width: 60,  render: v => <Text style={{ fontSize: fontSize.sm }}>{v}명</Text> },
        { title: '예약금', dataIndex: 'depositAmount',  key: 'depositAmount',   width: 90,  render: (v, r) => <Text style={{ fontSize: fontSize.sm, color: r.depositPaid ? colors.primary?.main : colors.text.tertiary }}>{v > 0 ? formatCurrency(v) : '-'}{r.depositPaid ? ' ✓' : ''}</Text> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: status => { const cfg = RES_STATUS_CONFIG[status] || { color: 'default', label: status }; return <Tag color={cfg.color}>{cfg.label}</Tag>; } },
        { title: '처리', key: 'actions', width: 80, render: (_, r) => <Button variant="ghost-sm-danger" loading={deleteMutation.isPending && deleteMutation.variables === r.id} onClick={() => handleSoftDeleteReservation(r)}><DeleteOutlined /> 삭제</Button> },
    ];

    return (
        <>
            <FilterToolbar
                selects={[{ value: resStatusFilter, onChange: handleStatusFilterChange, options: RES_STATUS_OPTIONS }]}
                count={totalElements}
                search={{ value: resSearch, onChange: handleSearchChange, placeholder: '가게명, 예약자로 검색', disabled: resLoading }}
                onReload={loadReservations}
                loading={resLoading || isFetching}
            />
            {/* 로딩 조건 통일(2026-07 전수조사): 예전엔 allReservations.length === 0 조건 때문에
                새로고침 시엔 아무 로딩 신호도 없이 조용히 있다가 휙 바뀌었다 — 다른 탭들과 동일하게
                (isLoading || isFetching)로 통일. pagination도 동일하게 제어(2026-07 추가) — MembersTab 참고. */}
            {(resLoading || isFetching) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={1}
                    pagination={totalElements ? { current: page, pageSize: PAGE_SIZE, total: totalElements } : null}
                />
            ) : (
                <DataTable
                    columns={reservationColumns}
                    dataSource={reservations}
                    rowKey="id"
                    pagination={{ current: page, pageSize: PAGE_SIZE, total: totalElements, onChange: setPage }}
                    locale={{ emptyText: '예약 내역이 없습니다.' }}
                />
            )}
        </>
    );
};

export default ReservationsAllTab;
