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
import React, { useState } from 'react';
import { Pagination, Typography, Tag } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton, DataState, DataTable, ReservationSummaryCardSkeleton } from '../common';
import ReservationListingToolbar from '../reservation/ReservationListingToolbar';
import ReservationSummaryCard from '../reservation/ReservationSummaryCard';
import ReservationDetailModal from '../reservation/ReservationDetailModal';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adminKeys } from '../../hooks/queryKeys';
import { invalidateAdminData, invalidateReservationData } from '../../hooks/invalidateAfterWrite';
import api from '../../api/axios';
import { API_ENDPOINTS, RESERVATION_STATUS_LABELS, RESERVATION_STATUS_COLORS,
         RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';
import { formatTime, formatCurrency } from '../../utils';

const { Text } = Typography;

// 상태 라벨·색·필터 목록은 constants/status.js 하나에서만 온다.
// 여기 있던 사본 두 벌은 같은 상태를 다른 말로 불렀다('대기 중' vs 정본 '승인 대기').

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지 (2026-07 전수조사)
// 예전엔 cols를 7개만 넘겨서 실제 8컬럼 테이블과 안 맞았고, headers는 아예 안 넘겨서
// 고정 텍스트인 컬럼 제목까지 회색 막대로 그려졌다.
const SKELETON_HEADERS = ['가게', '예약자', '날짜', '시간', '인원', '예약금', '상태', '처리'];
const SKELETON_COLS    = [130, 100, 110, 80, 60, 90, 90, 80];
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', status: 'ALL', sort: 'recent', view: 'list', page: '1' };

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
    const [{ search: resSearch, status: resStatusFilter, sort, view, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedResSearch = useDebounce(resSearch, 300);
    const page = Number(pageStr) || 1;
    const sortValue = RESERVATION_SORT_OPTIONS.some(option => option.value === sort) ? sort : 'recent';
    const viewMode = view === 'cards' ? 'cards' : 'list';
    const [detailReservation, setDetailReservation] = useState(null);
    const setPage = (p) => setQuery({ page: String(p) });

    const { data, isLoading: resLoading, isFetching, isPlaceholderData, error: resError, refetch: loadReservations } = useQuery({
        queryKey: [...adminKeys.reservations(), page, debouncedResSearch, resStatusFilter, sortValue],
        queryFn: async () => {
            const result = await api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS, {
                params: {
                    page: page - 1,
                    size: PAGE_SIZE,
                    ...(debouncedResSearch.trim() ? { search: debouncedResSearch.trim() } : {}),
                    ...(resStatusFilter !== 'ALL' ? { status: resStatusFilter } : {}),
                    sort: sortValue,
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

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(API_ENDPOINTS.ADMIN_MANAGE.RESERVATION_DELETE(id)),
        onSuccess: () => {
            message.success('휴지통으로 이동됐어요.');
            // 휴지통 탭·대시보드·감사 로그와 예약 달력까지 함께 바뀐다.
            void invalidateAdminData(queryClient);
            void invalidateReservationData(queryClient);
        },
        onError: () => message.error('삭제에 실패했어요.'),
    });

    const handleSoftDeleteReservation = (r) => confirm({
        title: '예약 휴지통으로 이동', content: `예약 #${r.id}을 휴지통으로 이동할까요?`,
        okText: '삭제', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
        onOk: () => deleteMutation.mutateAsync(r.id),
    });

    // 검색·상태는 서버 전체 집합에 적용한다. 조건이 바뀌면 페이지를 1로 복귀시킨다.
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });
    const handleStatusFilterChange = (v) => setQuery({ status: v, page: '1' });
    const handleSortChange = (v) => setQuery({ sort: v, page: '1' });

    const reservationColumns = [
        { title: '가게',  dataIndex: 'storeName',       key: 'storeName',       width: 130, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '예약자', dataIndex: 'memberName',      key: 'memberName',      width: 100, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '날짜',  dataIndex: 'reservationDate', key: 'reservationDate', width: 110, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '시간',  dataIndex: 'reservationTime', key: 'reservationTime', width: 80,  render: v => <Text style={{ fontSize: fontSize.sm }}>{formatTime(v)}</Text> },
        { title: '인원',  dataIndex: 'guestCount',      key: 'guestCount',      width: 60,  render: v => <Text style={{ fontSize: fontSize.sm }}>{v}명</Text> },
        { title: '예약금', dataIndex: 'depositAmount',  key: 'depositAmount',   width: 90,  render: (v, r) => <Text style={{ fontSize: fontSize.sm, color: r.depositPaid ? colors.primary?.main : colors.text.tertiary }}>{v > 0 ? formatCurrency(v) : '-'}{r.depositPaid ? ' ✓' : ''}</Text> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: status => (
            <Tag color={RESERVATION_STATUS_COLORS[status] ?? 'default'}>
                {RESERVATION_STATUS_LABELS[status] ?? '기타'}
            </Tag>
        ) },
        { title: '처리', key: 'actions', width: 80, render: (_, r) => <Button variant="ghost-sm-danger" loading={deleteMutation.isPending && deleteMutation.variables === r.id} onClick={() => handleSoftDeleteReservation(r)}><DeleteOutlined /> 삭제</Button> },
    ];

    // 본문 — 오류 / 스켈레톤 / 카드 / 표 중 하나를 고른다.
    let listContent;
    if (resError) {
        listContent = (
            <DataState state="error" kind="reservation" subject="예약 목록" error={resError}
                onRetry={loadReservations} retrying={isFetching} />
        );
    } else if (resLoading || isPlaceholderData) {
        if (viewMode === 'cards') {
            listContent = (
                <ReservationSummaryCardSkeleton count={Math.min(PAGE_SIZE, Math.max(totalElements, 4))} />
            );
        } else {
            listContent = (
                <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={1}
                    pagination={totalElements ? { current: page, pageSize: PAGE_SIZE, total: totalElements } : null}
                />
            );
        }
    } else if (viewMode === 'cards') {
        if (reservations.length === 0) {
            listContent = (
                <DataState state="empty" kind="reservation" title="예약 내역이 없어요." style={{ marginTop: 80 }} />
            );
        } else {
            listContent = (
                <>
                    <div className="reserve-reservation-card-grid">
                        {reservations.map(reservation => (
                            <ReservationSummaryCard
                                key={reservation.id}
                                reservation={reservation}
                                showMemberInfo
                                onOpenDetail={() => setDetailReservation(reservation)}
                                actions={[
                                    <Button key="delete" variant="ghost-sm-danger"
                                        loading={deleteMutation.isPending && deleteMutation.variables === reservation.id}
                                        onClick={() => handleSoftDeleteReservation(reservation)}>
                                        <DeleteOutlined /> 삭제
                                    </Button>,
                                ]}
                            />
                        ))}
                    </div>
                    <Pagination
                        current={page}
                        pageSize={PAGE_SIZE}
                        total={totalElements}
                        onChange={setPage}
                        showSizeChanger={false}
                        align="end"
                        style={{ marginTop: 16 }}
                    />
                </>
            );
        }
    } else {
        listContent = (
            <DataTable
                columns={reservationColumns}
                dataSource={reservations}
                rowKey="id"
                pagination={{ current: page, pageSize: PAGE_SIZE, total: totalElements, onChange: setPage }}
                locale={{ emptyText: '예약 내역이 없어요.' }}
            />
        );
    }

    return (
        <>
            <ReservationListingToolbar
                view={viewMode}
                onViewChange={nextView => setQuery({ view: nextView })}
                status={resStatusFilter}
                onStatusChange={handleStatusFilterChange}
                statusOptions={RESERVATION_STATUS_FILTER_OPTIONS}
                sort={sortValue}
                onSortChange={handleSortChange}
                sortOptions={RESERVATION_SORT_OPTIONS}
                count={totalElements}
                disabled={resLoading || isFetching}
                initialLoading={resLoading}
                label="관리자 예약 목록 필터"
            />
            <FilterToolbar
                search={{ value: resSearch, onChange: handleSearchChange, placeholder: '가게명, 예약자로 검색', disabled: resLoading }}
                onReload={loadReservations}
                loading={resLoading || isFetching}
                initialLoading={resLoading}
            />
            {/* 본문 스켈레톤은 첫 조회·쿼리 전환에만 표시한다. 수동 새로고침은 기존 행을 유지하고
                툴바의 진행 상태만 바뀌므로, 읽던 목록과 페이지 위치가 사라지지 않는다. */}
            {listContent}
            <ReservationDetailModal
                reservation={detailReservation}
                open={detailReservation != null}
                onClose={() => setDetailReservation(null)}
            />
        </>
    );
};

export default ReservationsAllTab;
