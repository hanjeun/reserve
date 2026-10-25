import PersonalSearchHandoff from '../Search/PersonalSearchHandoff';
import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import LoadingStatus from '../../components/common/LoadingStatus';
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Typography } from 'antd';
import {
    CreditCardOutlined, DeleteOutlined, QrcodeOutlined,
    CloseOutlined, StarOutlined, EditOutlined,
} from '../../components/common/icons';
import { PageContainer, Button, DataState, FilterToolbar, MyReservationCardSkeleton, ReservationSummaryCardSkeleton, SpinIndicator, SegmentedControl } from '../../components/common';
import ListingContent from '../../components/common/ListingContent';
import MyWaiting from '../../components/waiting/MyWaiting';
import ReservationRow from '../../components/reservation/ReservationRow';
import ReservationListingToolbar from '../../components/reservation/ReservationListingToolbar';
import ReservationSummaryCard from '../../components/reservation/ReservationSummaryCard';
import ReservationDetailModal from '../../components/reservation/ReservationDetailModal';
import QrCodeModal from '../../components/reservation/QrCodeModal';
import { useReservations, useMessage, usePayment } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useViewModeParam from '../../hooks/useViewModeParam';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { isBlockingListReadError, queryErrorStatus } from '../../hooks/liveUpdateQueries';
import useDebounce from '../../hooks/useDebounce';
import useAuthStore from '../../store/useAuthStore';
import paymentService from '../../services/paymentService';
import api from '../../api/axios';
import { formatCurrency } from '../../utils';
import { API_ENDPOINTS, RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';
import Pagination from '../../components/common/Pagination';
import { DEFAULT_PAGE_SIZE, MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';

const { Text } = Typography;

// 상태 필터 목록은 constants/status.js 하나에서만 온다 —
// 같은 상태를 화면마다 다르게 부르지 않기 위해서다('확정' vs '승인됨' vs '예약 확정').
const STATUS_OPTIONS = RESERVATION_STATUS_FILTER_OPTIONS;
const SORT_OPTIONS = RESERVATION_SORT_OPTIONS;

/*
 * 예약 상태에 맞는 사유 필드와 라벨을 함께 선택한다.
 */
const reasonNote = (res) => {
    const map = {
        REJECTED:  { label: '거절 사유', value: res.rejectionReason },
        CANCELLED: { label: '취소 사유', value: res.cancelReason },
    };
    const note = map[res.status];
    if (!note?.value) return null;
    return <Text type="secondary" style={styles.rejection}>{note.label}: {note.value}</Text>;
};

/*
 * 상태별 버튼만 반환하고 정렬·간격은 공통 ReservationRow가 맡는다.
 */
const createReservationActions = ({ res, paying, onPay, onEdit, onQr, onCancel, onReview, onRemove }) => {
    const actions = [];
    if (res.status === 'PENDING' && res.depositAmount > 0 && !res.depositPaid) {
        actions.push(
            <Button key="pay" variant="ghost-sm-primary" loading={paying}
                onClick={(e) => { e.stopPropagation(); onPay(res); }}>
                <CreditCardOutlined /> 결제하기
            </Button>,
        );
    }
    if (res.status === 'PENDING' || res.status === 'CONFIRMED') {
        if (!res.depositPaid) {
            actions.push(
                <Button key="edit" variant="ghost-sm-primary"
                    onClick={(e) => { e.stopPropagation(); onEdit(res); }}>
                    <EditOutlined /> 변경
                </Button>,
            );
        }
        if (res.status === 'CONFIRMED') {
            actions.push(
                <Button key="qr" variant="ghost-sm-primary"
                    onClick={(e) => { e.stopPropagation(); onQr(res); }}>
                    <QrcodeOutlined /> QR
                </Button>,
            );
        }
        actions.push(
            <Button key="cancel" variant="ghost-sm-danger"
                onClick={(e) => { e.stopPropagation(); onCancel(res); }}>
                <CloseOutlined /> 취소
            </Button>,
        );
    }
    if (res.status === 'COMPLETED') {
        actions.push(res.reviewId
            ? <Button key="review" variant="ghost-sm-success"
                onClick={(e) => { e.stopPropagation(); onReview(res, true); }}>
                <StarOutlined /> 리뷰 보기
              </Button>
            : <Button key="review" variant="ghost-sm-primary"
                onClick={(e) => { e.stopPropagation(); onReview(res, false); }}>
                <StarOutlined /> 리뷰 쓰기
              </Button>,
            <Button key="remove" variant="ghost-sm" size="sm"
                onClick={(e) => { e.stopPropagation(); onRemove(res); }}
                style={{ color: colors.text.tertiary }}>
                <DeleteOutlined /> 삭제
            </Button>,
        );
    }
    if (['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(res.status)) {
        actions.push(
            <Button key="remove" variant="ghost-sm" size="sm"
                onClick={(e) => { e.stopPropagation(); onRemove(res); }}
                style={{ color: colors.text.tertiary }}>
                <DeleteOutlined /> 삭제
            </Button>,
        );
    }
    return actions;
};

const resolveOptionParam = (params, key, options, fallback) => (options.some(option => option.value === params.get(key))
    ? params.get(key) : fallback);

// 상태·정렬의 모든 선택을 같은 방식으로 URL에 표시한다.
const withToolbarParam = (current, key, value) => {
    const next = new URLSearchParams(current);
    if (value != null) next.set(key, String(value));
    else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    return next;
};

// 목록 결과 — 빈 안내 또는 카드/목록형 항목들.
const ReservationResults = ({ filtered, view, filtersActive, renderItem }) => {
    if (filtered.length === 0) {
        return (
            <DataState state="empty" kind="reservation"
                title={filtersActive
                    ? '조건에 맞는 예약이 없어요.'
                    : '예약 내역이 없어요.'} />
        );
    }
    return (
        <div className={view === 'cards' ? 'reserve-reservation-card-grid' : 'reserve-myreservation-rows'}>
            {filtered.map((res, i) => (
                <div key={res.id} className={view === 'cards' ? 'reserve-myreservation-card-item' : 'reserve-myreservation-row'}>
                    {renderItem(res)}
                    {view === 'list' && i < filtered.length - 1 && <div style={styles.divider} />}
                </div>
            ))}
        </div>
    );
};

const ReservationHistory = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();
    const { message, confirm } = useMessage();
    const { user } = useAuthStore();
    const { pay, paying } = usePayment();
    useDocumentTitle('내 예약');

    const statusFilter = resolveOptionParam(urlSearchParams, 'status', STATUS_OPTIONS, 'ALL');
    const sort = resolveOptionParam(urlSearchParams, 'sort', SORT_OPTIONS, 'recent');
    const [view, setView] = useViewModeParam(urlSearchParams, 'list');
    const setToolbarParam = (key, value) => setUrlSearchParams(current => withToolbarParam(current, key, value));
    const [keyword, setKeyword] = useState('');
    const debouncedKeyword = useDebounce(keyword, 300);
    const requestedPage = Number(urlSearchParams.get('page') ?? 1);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const { reservations, total, totalPages, loading, refetching, error, cancelReservation, refetch,
        hasData = reservations.length > 0 || !loading && !error } = useReservations({
        page: page - 1, size: DEFAULT_PAGE_SIZE,
        search: debouncedKeyword.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        sort,
    });
    const [qrReservationId, setQrReservationId] = useState(null);
    const [detailReservation, setDetailReservation] = useState(null);
    const currentDetailReservation = detailReservation ? reservations.find(item => item.id === detailReservation.id) ?? null : null;
    const listRef = React.useRef(null);
    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    const blockingError = isBlockingListReadError(error, reservations);
    useListRefreshAnchor(listRef, JSON.stringify([view, page, statusFilter, sort, debouncedKeyword]), refetching, hasData ? reservations : null);
    useEffect(() => {
        if (!hasData || loading || refetching || error || page <= Math.max(totalPages, 1)) return;
        setUrlSearchParams(current => withToolbarParam(current, 'page', Math.max(totalPages, 1)), { replace: true });
    }, [hasData, loading, refetching, error, page, totalPages, setUrlSearchParams]);
    if (accessDenied) {
        if (qrReservationId !== null) setQrReservationId(null);
        if (detailReservation !== null) setDetailReservation(null);
    } else if (hasData && !refetching && !error) {
        if (detailReservation && !currentDetailReservation) setDetailReservation(null);
        if (qrReservationId != null && !reservations.some(item => item.id === qrReservationId)) setQrReservationId(null);
    }

    // 최초 조회와 재진입 갱신은 useQuery의 캐시 정책에 맡긴다.

    // 명시적 refetch 진입만 캐시를 무시해 다시 조회한다.

    useEffect(() => {
        if (location.state?.warnMsg) {
            message.warning({ content: location.state.warnMsg, key: 'review_warn' });
        }
        if (location.state?.refetch) void refetch();
        if (location.state) navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePay = async (res) => {
        await pay(
            { id: res.id, storeName: res.storeName, depositAmount: res.depositAmount },
            { name: user?.name, email: user?.email, phone: user?.phone }
        );
    };

    const handleRemove = (res) => {
        confirm({
            title: '예약 삭제',
            content: '이 예약을 목록에서 삭제해요. 되돌릴 수 없어요.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await api.delete(API_ENDPOINTS.RESERVATION.REMOVE(res.id));
                    message.success('목록에서 제거됐어요.');
                    void refetch();
                } catch { message.error('제거에 실패했어요.'); }
            },
        });
    };

    // 확인창은 즉시 열고 환불 미리보기만 비동기로 갱신한다.

    const handleCancel = (res) => {
        if (!res.depositPaid) {
            confirm({
                title: '예약 취소',
                content: '예약을 취소할까요? 취소 후 되돌릴 수 없어요.',
                okText: '취소하기', cancelText: '닫기',
                okButtonProps: { danger: true }, centered: true,
                onOk: () => cancelReservation(res.id),
            });
            return;
        }

        const modalHandle = confirm({
            title: '예약 취소',
            // 다른 로딩 모달과 톤 통일 — 확인 다이얼로그 본문이라 블록형 ModalLoading 대신
            // 인라인 스피너(SpinIndicator) + 텍스트를 한 줄로 넣는다.
            content: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: colors.text.tertiary }}>
                    <SpinIndicator /> 환불 정보를 확인하는 중...
                </span>
            ),
            okText: '취소하기', cancelText: '닫기',
            // 조회 중에는 버튼을 비활성화해 원래 라벨을 유지한다.

            okButtonProps: { danger: true, disabled: true }, centered: true,
            onOk: () => cancelReservation(res.id),
        });

        paymentService.getRefundPreview(res.id)
            .then((preview) => {
                const content = preview.refundAmount > 0
                    ? `예약을 취소하면 ${formatCurrency(preview.refundAmount)}이 환불돼요. (${preview.reason})`
                    : `취소 시점 기준 환불 불가 조건이에요. (${preview.reason}) 예약을 취소할까요?`;
                modalHandle.update({ content, okButtonProps: { danger: true, disabled: false } });
            })
            .catch(() => {
                // 환불 미리보기 오류는 기본 안내로 대체하고 취소 동작은 유지한다.
                modalHandle.update({
                    content: '예약을 취소할까요? 취소 후 되돌릴 수 없어요.',
                    okButtonProps: { danger: true, disabled: false },
                });
            });
    };

    // 액션 핸들러 묶음 — ReservationActions에 넘겨 PC/모바일 양쪽에서 재사용
    const handleEdit   = (res) => navigate(`/store/${res.storeId}?edit=${res.id}`);
    const handleQr     = (res) => setQrReservationId(res.id);
    const handleReview = (res, hasReview) => navigate(
        `/store/${res.storeId}`,
        { state: hasReview ? { openReviewId: res.reviewId } : { openWrite: true } }
    );

    const actionHandlers = {
        paying,
        onPay: handlePay, onEdit: handleEdit, onQr: handleQr,
        onCancel: handleCancel, onReview: handleReview, onRemove: handleRemove,
    };

    const renderReservationItem = (res) => {
        const actions = createReservationActions({ res, ...actionHandlers });
        const itemProps = {
            reservation: res,
            onOpenDetail: () => setDetailReservation(res),
            extraNote: reasonNote(res),
        };
        if (view === 'cards') {
            return <ReservationSummaryCard {...itemProps} actions={actions} />;
        }
        return <ReservationRow {...itemProps} renderActions={() => actions} />;
    };

    let listBody;
    if (loading) {
        listBody = (
            <LoadingStatus aria-label="예약 목록을 불러오는 중"><div aria-hidden="true">
                {view === 'cards'
                    ? <ReservationSummaryCardSkeleton count={4} />
                    : <MyReservationCardSkeleton count={4} />}
            </div></LoadingStatus>
        );
    } else if (blockingError) {
        listBody = (
            // 처음부터 못 불러오면 목록 자리에 띄운다 — 제목·툴바 옆이 아니라 결과가 나올 자리.
            <DataState state="error" kind="reservation" subject="예약 목록" error={error}
                onRetry={refetch} retrying={loading || refetching} />
        );
    } else {
        listBody = (
            <ReservationResults filtered={reservations} view={view}
                filtersActive={statusFilter !== 'ALL' || Boolean(debouncedKeyword.trim())}
                renderItem={renderReservationItem} />
        );
    }

    return (
        <section ref={listRef} aria-label="내 예약 목록" aria-busy={loading || refetching}>
            <ReservationListingToolbar view={view}
                initialLoading={loading}
                onViewChange={setView}
                status={statusFilter} onStatusChange={nextStatus => setToolbarParam('status', nextStatus)}
                statusOptions={STATUS_OPTIONS} sort={sort}
                onSortChange={nextSort => setToolbarParam('sort', nextSort)} sortOptions={SORT_OPTIONS}
                count={loading || !hasData || blockingError ? undefined : total} disabled={loading} />
            <FilterToolbar
                autoRefreshDomain="RESERVATION"
                search={{ value: keyword, onChange: e => { setKeyword(e.target.value); setToolbarParam('page', 1); }, placeholder: '가게명, 예약번호로 검색', disabled: loading }}
                onReload={refetch}
                loading={loading || refetching}
                initialLoading={loading}
            />

            {/* 첫 조회에만 스켈레톤을 표시한다. 폴링·창 포커스·수동 새로고침은 현재 예약과
                읽던 위치를 유지하고 툴바에서만 진행 상태를 알린다. */}
            <ListingContent notice={!loading && error && !blockingError && (
                <DataState state="error" kind="reservation" subject="예약 목록" error={error}
                    title="최신 예약을 확인하지 못해 이전 목록을 보여드리고 있어요."
                    onRetry={refetch} retrying={loading || refetching} compact />
            )}>{listBody}</ListingContent>
            {hasData && !blockingError && total > 0 && (
                <nav aria-label="내 예약 목록 페이지" className="reserve-listing-pagination">
                    <Pagination current={page} pageSize={DEFAULT_PAGE_SIZE} total={total}
                        onChange={nextPage => setToolbarParam('page', nextPage)}
                        showSizeChanger={false} showLessItems={isMobile}
                        size={isMobile ? 'small' : 'default'} align="end"
                        disabled={loading || keyword !== debouncedKeyword} />
                </nav>
            )}
            {!accessDenied && <><QrCodeModal
                reservationId={qrReservationId}
                open={qrReservationId != null}
                onClose={() => setQrReservationId(null)}
            />
            <ReservationDetailModal
                reservation={currentDetailReservation}
                open={currentDetailReservation != null}
                onClose={() => setDetailReservation(null)}
            /></>}
        </section>
    );
};

const MyReservations = () => {
    const [params, setParams] = useSearchParams();
    const revision = useAuthStore(state => state.sessionRevision);
    const waiting = params.get('tab') === 'waiting';
    useDocumentTitle('내 예약');
    return <PageContainer size="xl" paddingTop="40px" className="reserve-myreservation-page">
        <div className="reserve-listing-heading">
            <PageTitle style={styles.title}>내 예약 확인</PageTitle>
            <PageDescription>예약과 웨이팅 현황을 확인해요</PageDescription>
        </div>
        <div style={{ marginBottom: 20 }}><SegmentedControl block={false} value={waiting ? 'waiting' : 'reservation'}
            options={[{ value: 'reservation', label: '예약' }, { value: 'waiting', label: '웨이팅' }]}
            onChange={value => setParams(current => {
                const next = new URLSearchParams(current);
                next.set('tab', value);
                return next;
            })} /></div>
        <PersonalSearchHandoff key={revision} />
        {waiting ? <MyWaiting key={revision} /> : <ReservationHistory key={revision} />}
    </PageContainer>;
};

const styles = {
    title:    { margin: '0 0 8px', },
    divider:  { height: 1, background: colors.border?.light || '#f0f0f0' },
    rejection: { fontSize: fontSize.xs, textAlign: 'right', width: '100%' },
};

export default MyReservations;
