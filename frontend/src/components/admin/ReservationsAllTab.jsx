/*
 * 예약 필터·검색어·페이지를 URL과 쿼리 키에 함께 반영한다.
 */
import React, { useRef, useState } from 'react';
import { Typography, Tag } from 'antd';
import Pagination from '../common/Pagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined } from '../common/icons';
import { Button, FilterToolbar, AdminTableSkeleton, DataState, DataTable, ReservationSummaryCardSkeleton } from '../common';
import ListingContent from '../common/ListingContent';
import AnimatedContent from '../common/AnimatedContent';
import UnderlinedTextButton from '../common/UnderlinedTextButton';
import ReservationListingToolbar from '../reservation/ReservationListingToolbar';
import ReservationSummaryCard from '../reservation/ReservationSummaryCard';
import ReservationDetailModal from '../reservation/ReservationDetailModal';
import ReservationRetentionTools from './ReservationRetentionTools';
import { handleApiError } from '../../utils/errorHandler';
import { useMessage, useQueryParamsState } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import { keepListForSort } from '../../hooks/listSortPlaceholder';
import useListSelectionMotion from '../../hooks/useListSelectionMotion';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { isBlockingListReadError, isReadAccessDenied } from '../../hooks/liveUpdateQueries';
import { invalidateAdminData, invalidateReservationData } from '../../hooks/invalidateAfterWrite';
import api from '../../api/axios';
import { API_ENDPOINTS, RESERVATION_STATUS_LABELS, RESERVATION_STATUS_COLORS,
         RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import { MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';
import { colors, fontSize } from '../../styles/tokens';
import { formatTime, formatCurrency } from '../../utils';

const { Text } = Typography;

// 상태 라벨·색·필터 목록은 constants/status.js 하나에서만 온다.
// 여기 있던 사본 두 벌은 같은 상태를 다른 말로 불렀다('대기 중' vs 정본 '승인 대기').

// 골격과 실제 테이블은 같은 열 규격을 사용한다.

const SKELETON_HEADERS = ['가게', '예약자', '날짜', '시간', '인원', '예약금', '상태', '처리'];
const SKELETON_COLS    = [130, 100, 110, 80, 60, 90, 90, 80];
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', status: 'ALL', sort: 'recent', view: 'list', page: '1' };

const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

const ReservationsAllTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const [{ search: resSearch, status: resStatusFilter, sort, view, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS, { privateKeys: ['search'] });
    const page = Number(pageStr) || 1;
    const sortValue = RESERVATION_SORT_OPTIONS.some(option => option.value === sort) ? sort : 'recent';
    const viewMode = view === 'cards' ? 'cards' : 'list';
    const [detailId, setDetailId] = useState(null);
    const resultRef = useRef(null);
    const setPage = (p) => setQuery({ page: String(p) });

    const { data, isLoading: resLoading, isFetching, isPlaceholderData, error: resError, refetch: loadReservations } = useQuery({
        queryKey: [...adminKeys.reservations(), page, resSearch, resStatusFilter, sortValue],
        queryFn: async ({ signal }) => {
            const result = await api.get(API_ENDPOINTS.RESERVATION.ADMIN_RESERVATIONS, {
                signal,
                params: {
                    page: page - 1,
                    size: PAGE_SIZE,
                    ...(resSearch.trim() ? { search: resSearch.trim() } : {}),
                    ...(resStatusFilter !== 'ALL' ? { status: resStatusFilter } : {}),
                    sort: sortValue,
                },
            });
            return {
                content: Array.isArray(result) ? result : (result?.content ?? []),
                totalElements: Array.isArray(result)
                    ? result.length
                    : (result?.page?.totalElements ?? result?.totalElements ?? 0),
            };
        },
        placeholderData: (previous, query) => {
            if (!query || isReadAccessDenied(query.state.error)) return undefined;
            const [, , previousPage, previousSearch, previousStatus, previousSort] = query.queryKey;
            if (previousSearch !== resSearch || previousStatus !== resStatusFilter) return undefined;
            return keepListForSort(previous, previousSort, sortValue, previousPage) ?? previous;
        },
    });
    const accessLost = isReadAccessDenied(resError);
    const reservations = accessLost ? [] : data?.content ?? [];
    const totalElements = accessLost ? 0 : data?.totalElements ?? 0;
    const previousOrder = isPlaceholderData ? data?.previousOrder : undefined;
    const resultsLoading = resLoading || isPlaceholderData && !previousOrder;
    const resultPage = previousOrder?.page ?? page;
    const blockingError = isBlockingListReadError(resError, reservations);
    useListSelectionMotion(resultRef, {
        // 표에서 페이지도 바뀌면 결과 영역의 전환만 사용한다.
        view: viewMode === 'list' ? `list:${resultPage}` : viewMode,
        selection: previousOrder?.sort ?? sortValue, ids: reservations.map(item => item.id),
        ready: !resultsLoading && !blockingError,
    });
    const detailReservation = accessLost || resultsLoading
        ? null : reservations.find(reservation => reservation.id === detailId) ?? null;
    if (detailId !== null && !detailReservation) setDetailId(null);

    const deleteMutation = useMutation({
        mutationFn: (id) => api.delete(API_ENDPOINTS.ADMIN_MANAGE.RESERVATION_DELETE(id)),
        onSuccess: () => {
            message.success('휴지통으로 이동됐어요.');
            // 휴지통 탭·대시보드·감사 로그와 예약 달력까지 함께 바뀐다.
            void invalidateAdminData(queryClient);
            void invalidateReservationData(queryClient);
        },
        onError: error => handleApiError(error, message, '삭제에 실패했어요.'),
    });

    const handleSoftDeleteReservation = (r) => confirm({
        title: '예약 휴지통으로 이동', content: `예약 #${r.id}을 휴지통으로 이동할까요?`,
        okText: '삭제', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
        onOk: () => deleteMutation.mutateAsync(r.id),
    });

    const correction = useMutation({
        mutationFn: id => api.post(`/api/reservations/admin/${id}/no-show-correction`),
        onSuccess: () => {
            message.success('노쇼 제한 기록을 정정했어요.');
            void invalidateAdminData(queryClient);
        },
        onError: error => handleApiError(error, message, '노쇼 제한을 정정하지 못했어요.'),
    });

    // 검색·상태는 서버 전체 집합에 적용한다. 조건이 바뀌면 페이지를 1로 복귀시킨다.
    const handleSearchChange = search => setQuery({ search, page: '1' });
    const handleStatusFilterChange = (v) => setQuery({ status: v, page: '1' });
    const handleSortChange = (v) => setQuery({ sort: v, page: '1' });

    const reservationColumns = [
        { title: '가게', dataIndex: 'storeName', key: 'storeName', width: 130,
            render: (name, reservation) => <UnderlinedTextButton aria-label={`${name || '가게'} 예약 상세 보기`}
                onClick={() => setDetailId(reservation.id)}>{name || '가게'}</UnderlinedTextButton> },
        { title: '예약자', dataIndex: 'memberName',      key: 'memberName',      width: 100, render: (v, r) => <Text style={{ fontSize: fontSize.sm }}>{r.personalInfoHidden ? '조회 기간 만료' : v}</Text> },
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
    if (blockingError) {
        listContent = (
            <DataState state="error" kind="reservation" subject="예약 목록" error={resError}
                onRetry={loadReservations} retrying={isFetching} />
        );
    } else if (resultsLoading) {
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
                />
            );
        }
    } else if (viewMode === 'cards') {
        if (reservations.length === 0) {
            listContent = (
                <DataState state="empty" kind="reservation" title="예약 내역이 없어요." />
            );
        } else {
            listContent = (
                    <div className="reserve-reservation-card-grid">
                        {reservations.map(reservation => (
                            <ReservationSummaryCard
                                key={reservation.id}
                                reservation={reservation}
                                showMemberInfo
                                onOpenDetail={() => setDetailId(reservation.id)}
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
            );
        }
    } else {
        listContent = (
            <DataTable
                columns={reservationColumns}
                dataSource={reservations}
                rowKey="id"
                pagination={false}
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
                sortLoading={Boolean(previousOrder)}
                count={totalElements}
                disabled={false}
                initialLoading={resLoading}
                label="관리자 예약 목록 필터"
            />
            <FilterToolbar
                search={{ value: resSearch, onSubmit: handleSearchChange, placeholder: '가게명, 예약자로 검색' }}
                onReload={loadReservations}
                loading={resLoading || isFetching && !previousOrder}
                initialLoading={resLoading}
            />
            {/* 본문 스켈레톤은 첫 조회·쿼리 전환에만 표시한다. 수동 새로고침은 기존 행을 유지하고
                툴바의 진행 상태만 바뀌므로, 읽던 목록과 페이지 위치가 사라지지 않는다. */}
            {resError && !blockingError && <DataState compact state="error" kind="reservation"
                subject="예약 목록 갱신" error={resError} onRetry={loadReservations} retrying={isFetching} />}
            <AnimatedContent motionKey={viewMode} ready={!resultsLoading} keepResultsHeight={totalElements > PAGE_SIZE}>
                <div ref={resultRef} aria-busy={isFetching}>
                    {viewMode === 'cards' ? <ListingContent>{listContent}</ListingContent> : listContent}
                </div>
            </AnimatedContent>
            {!blockingError && totalElements > 0 && <Pagination
                current={resultPage} pageSize={PAGE_SIZE} total={totalElements} onChange={setPage}
                showSizeChanger={false} showLessItems={isMobile}
                align={viewMode === 'cards' ? 'end' : 'center'} className="reserve-data-table-pagination"
                disabled={Boolean(previousOrder)} />}
            {!accessLost && <ReservationDetailModal
                reservation={detailReservation}
                open={detailReservation != null}
                onClose={() => setDetailId(null)}
                tools={(reservation, open) => <>
                    <ReservationRetentionTools reservationId={reservation.id} open={open} />
                    {reservation.noShowRestrictionCorrectable && <UnderlinedTextButton
                        disabled={correction.isPending}
                        onClick={() => confirm({
                            title: '노쇼 제한 기록 정정',
                            content: '이 노쇼를 새 예약 제한 계산에서 제외할까요? 방문 상태와 예약금 처리는 기존 기록으로 남아요.',
                            okText: '정정', cancelText: '취소', centered: true,
                            onOk: () => correction.mutateAsync(reservation.id),
                        })}>노쇼 제한 정정</UnderlinedTextButton>}
                </>}
            />}
        </>
    );
};

export default ReservationsAllTab;
