import LoadingStatus from '../../components/common/LoadingStatus';
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Typography } from 'antd';
import {
    CreditCardOutlined, DeleteOutlined, QrcodeOutlined,
    CloseOutlined, StarOutlined, EditOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, DataState, FilterToolbar, MyReservationCardSkeleton, ReservationSummaryCardSkeleton, SpinIndicator } from '../../components/common';
import ReservationRow from '../../components/reservation/ReservationRow';
import ReservationListingToolbar from '../../components/reservation/ReservationListingToolbar';
import ReservationSummaryCard from '../../components/reservation/ReservationSummaryCard';
import ReservationDetailModal from '../../components/reservation/ReservationDetailModal';
import QrCodeModal from '../../components/reservation/QrCodeModal';
import { useReservations, useMessage, usePayment } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useViewModeParam from '../../hooks/useViewModeParam';
import useDebounce from '../../hooks/useDebounce';
import useAuthStore from '../../store/useAuthStore';
import paymentService from '../../services/paymentService';
import api from '../../api/axios';
import { formatCurrency } from '../../utils';
import { API_ENDPOINTS, RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import { colors, fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

// 상태 필터 목록은 constants/status.js 하나에서만 온다 —
// 같은 상태를 화면마다 다르게 부르지 않기 위해서다('확정' vs '승인됨' vs '예약 확정').
const STATUS_OPTIONS = RESERVATION_STATUS_FILTER_OPTIONS;
const SORT_OPTIONS = RESERVATION_SORT_OPTIONS;

/**
 * 카드 맨 아래 사유 문구. 상태에 따라 읽는 필드와 라벨이 다르다 (2026-08-11).
 *
 * <p>rejectionReason 하나로 뭉뚱그리지 않는다 — 취소된 예약에 "거절 사유"라는 라벨이
 * 붙으면 이용자가 무슨 일이 있었는지 오해한다. 백엔드도 같은 이유로 컬럼을 따로 뒀다.
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

/**
 * 예약 카드의 액션 버튼 묶음(결제/변경/QR/취소/리뷰/삭제).
 * 상태별로 나오는 버튼이 달라서 별도 컴포넌트로 추출.
 * 2026-07: 감싸는 flex wrapper(정렬/간격)는 ReservationRow가 담당하므로
 * 여기선 버튼 자체만 반환한다 — 사업자 쪽(ReservationCard.jsx)과 배치 로직을 공유하기 위함.
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

// 툴바 값 하나를 URL 에 반영한다 — 빈 값과 기본값(정렬 recent, 상태 ALL)은 URL 에서 뺀다.
const withToolbarParam = (current, key, value) => {
    const next = new URLSearchParams(current);
    if (value && !(key === 'sort' && value === 'recent') && !(key === 'status' && value === 'ALL')) next.set(key, value);
    else next.delete(key);
    return next;
};

const matchesReservationKeyword = (r, kw) =>
    r.storeName?.toLowerCase().includes(kw) ||
    r.specialRequest?.toLowerCase().includes(kw) ||
    r.reservationCode?.toLowerCase().includes(kw);

const visitSortKey = (r) => (r.reservationDate ? `${r.reservationDate}T${r.reservationTime || ''}` : '9999');

const filterAndSortReservations = (reservations, { statusFilter, keyword, sort }) => {
    let list = statusFilter !== 'ALL'
        ? reservations.filter(r => r.status === statusFilter)
        : reservations;
    if (keyword.trim()) {
        const kw = keyword.toLowerCase();
        list = list.filter(r => matchesReservationKeyword(r, kw));
    }
    // 서버 응답은 생성 최신순이며 응답 DTO에는 생성 시각이 없다. 이 순서만 뒤집고,
    // 방문일은 응답의 예약 날짜·시간 필드를 사용한다.
    if (sort === 'oldest') return [...list].reverse();
    if (sort === 'visit') return [...list].sort((a, b) => visitSortKey(a).localeCompare(visitSortKey(b)));
    return list;
};

// 목록 결과 — 빈 안내 또는 카드/목록형 항목들.
const ReservationResults = ({ filtered, view, filtersActive, renderItem }) => {
    if (filtered.length === 0) {
        return (
            <DataState state="empty" kind="reservation" style={{ marginTop: 100 }}
                title={filtersActive
                    ? '조건에 맞는 예약이 없습니다.'
                    : '예약 내역이 없습니다.'} />
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

const MyReservations = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();
    const { message, confirm } = useMessage();
    const { reservations, loading, refetching, error, cancelReservation, refetch } = useReservations();
    const { user } = useAuthStore();
    const { pay, paying } = usePayment();
    useDocumentTitle('내 예약');

    const statusFilter = resolveOptionParam(urlSearchParams, 'status', STATUS_OPTIONS, 'ALL');
    const sort = resolveOptionParam(urlSearchParams, 'sort', SORT_OPTIONS, 'recent');
    const [view, setView] = useViewModeParam(urlSearchParams, setUrlSearchParams, 'list');
    const setToolbarParam = (key, value) => setUrlSearchParams(current => withToolbarParam(current, key, value));
    const [keyword, setKeyword] = useState('');
    const debouncedKeyword = useDebounce(keyword, 300);
    const [qrReservationId, setQrReservationId] = useState(null);
    const [detailReservation, setDetailReservation] = useState(null);

    // 코드리뷰 지적사항 반영(2026-07): 마운트마다 무조건 refetch()를 불렀는데, useQuery가 이미
    // 마운트 시 자동으로 fetch하므로 이건 대부분 중복 호출이었음 — 특히 staleTime(3분) 안에
    // 이 페이지로 다시 돌아오면(뒤로가기 등) 캐시된 데이터가 이미 있어 isLoading은 false인데도
    // 이 강제 refetch가 isFetching을 true로 만들어서 스켈레톤이 다시 뜨는 원인이었음.
    // location.state.refetch로 명시적으로 요청된 경우(다른 화면에서 예약 생성 후 넘어올 때 등)만
    // 캐시를 무시하고 강제 재조회.
    useEffect(() => {
        if (location.state?.warnMsg) {
            message.warning({ content: location.state.warnMsg, key: 'review_warn' });
        }
        if (location.state?.refetch) void refetch();
        if (location.state) navigate(location.pathname, { replace: true, state: {} });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = useMemo(
        () => filterAndSortReservations(reservations, { statusFilter, keyword: debouncedKeyword, sort }),
        [reservations, statusFilter, debouncedKeyword, sort],
    );

    const handlePay = async (res) => {
        await pay(
            { id: res.id, storeName: res.storeName, depositAmount: res.depositAmount },
            { name: user?.name, email: user?.email, phone: user?.phone }
        );
    };

    const handleRemove = (res) => {
        confirm({
            title: '예약 삭제',
            content: '이 예약을 목록에서 삭제합니다. 되돌릴 수 없습니다.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await api.delete(API_ENDPOINTS.RESERVATION.REMOVE(res.id));
                    message.success('목록에서 제거되었습니다.');
                    void refetch();
                } catch { message.error('제거에 실패했습니다.'); }
            },
        });
    };

    // 코드리뷰 지적사항 반영(2026-07): 예전엔 환불 미리보기 API 응답을 기다린 뒤에야 confirm
    // 모달을 열어서, "취소" 버튼을 눌러도 몇 초간(개발 환경 스켈레톤 딜레이 포함) 아무 반응이
    // 없다가 갑자기 모달이 튀어나왔음 — AdminPanel.jsx의 "상세보기" 모달과 동일한 문제였음.
    // 예약금이 있는 경우만 모달을 먼저 즉시 열고("환불 정보 확인 중..."), 데이터가 오면
    // modal.update()로 내용만 갱신(AntD Modal.confirm이 반환하는 핸들의 update 메서드 활용).
    const handleCancel = (res) => {
        if (!res.depositPaid) {
            confirm({
                title: '예약 취소',
                content: '예약을 취소하시겠습니까? 취소 후 되돌릴 수 없습니다.',
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
            // ★ loading 이 아니라 disabled 다 (2026-08-11).
            //   ⚠️ 오해 정정 — loading 이 클릭을 통과시키는 건 **아니다**.
            //   antd 6.2.0 Button.handleClick 은 innerLoading 이면 preventDefault 하고 빠진다
            //   (node_modules/antd/es/button/Button.js:183-188). 마우스 클릭은 이미 막혀 있었다.
            //   진짜 문제는 그 다음 줄이다 — 렌더되는 <button> 의 disabled 속성은
            //   mergedDisabled 로만 결정되고 innerLoading 은 넣지 않는다(같은 파일 302).
            //   그래서 loading 상태의 버튼은 **여전히 포커스를 받고 스크린리더에는 평범한
            //   활성 버튼으로 읽힌다.** Tab 으로 가서 Enter 를 눌러도 아무 일이 안 일어나는데
            //   왜 안 되는지 알 방법이 없다. 되돌릴 수 없는 "취소하기"에서 그러면 안 된다.
            //   disabled 는 DOM 속성까지 내려가서 포커스에서 빠지고 회색으로 바뀐다 —
            //   "아직 누를 때가 아니다"가 눈과 보조기술 양쪽에 실제로 전달된다.
            //   덤으로 본문 SpinIndicator 와 버튼 스피너가 겹치던 것도 사라진다.
            okButtonProps: { danger: true, disabled: true }, centered: true,
            onOk: () => cancelReservation(res.id),
        });

        paymentService.getRefundPreview(res.id)
            .then((preview) => {
                const content = preview.refundAmount > 0
                    ? `예약을 취소하면 ${formatCurrency(preview.refundAmount)}이 환불됩니다. (${preview.reason})`
                    : `취소 시점 기준 환불 불가 조건입니다. (${preview.reason}) 예약을 취소하시겠습니까?`;
                modalHandle.update({ content, okButtonProps: { danger: true, disabled: false } });
            })
            .catch(() => {
                // 환불 조회 실패해도 취소는 계속 가능하게 — 기본 문구로 되돌림
                modalHandle.update({
                    content: '예약을 취소하시겠습니까? 취소 후 되돌릴 수 없습니다.',
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

    // 목록 영역 — 첫 조회 스켈레톤 / 처음부터 실패 / 목록(재조회 실패 띠 포함)
    let listBody;
    if (loading) {
        listBody = (
            <LoadingStatus aria-label="예약 목록을 불러오는 중"><div aria-hidden="true">
                {view === 'cards'
                    ? <ReservationSummaryCardSkeleton count={4} />
                    : <MyReservationCardSkeleton count={4} />}
            </div></LoadingStatus>
        );
    } else if (error && reservations.length === 0) {
        listBody = (
            // 처음부터 못 불러오면 목록 자리에 띄운다 — 제목·툴바 옆이 아니라 결과가 나올 자리.
            <DataState state="error" kind="reservation" subject="예약 목록" error={error}
                onRetry={refetch} retrying={loading || refetching} style={{ marginTop: 100 }} />
        );
    } else {
        listBody = (
            <>
                {/* 다시 불러오기만 실패했으면 이전 목록은 그대로 두고, 그 위에 작은 띠로만 알린다. */}
                {error && (
                    <DataState state="error" kind="reservation" subject="예약 목록" error={error}
                        title="최신 예약을 확인하지 못해 이전 목록을 보여드리고 있습니다."
                        onRetry={refetch} retrying={loading || refetching} compact style={{ marginBottom: 16 }} />
                )}
                <ReservationResults filtered={filtered} view={view}
                    filtersActive={statusFilter !== 'ALL' || Boolean(debouncedKeyword.trim())}
                    renderItem={renderReservationItem} />
            </>
        );
    }

    return (
        <PageContainer size="xl" paddingTop="40px" className="reserve-myreservation-page" aria-busy={loading || refetching}>
            <div style={{ marginBottom: 32 }}>
                <Title level={2} style={styles.title}>내 예약 확인</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    예약 현황을 확인하고 방문 후 리뷰를 남겨보세요
                </Text>
            </div>

            <ReservationListingToolbar view={view}
                onViewChange={setView}
                status={statusFilter} onStatusChange={nextStatus => setToolbarParam('status', nextStatus)}
                statusOptions={STATUS_OPTIONS} sort={sort}
                onSortChange={nextSort => setToolbarParam('sort', nextSort)} sortOptions={SORT_OPTIONS}
                count={loading || (error && reservations.length === 0) ? undefined : filtered.length} disabled={loading || refetching} />
            <FilterToolbar
                search={{ value: keyword, onChange: e => setKeyword(e.target.value), placeholder: '가게명, 예약번호로 검색', disabled: loading || refetching }}
                onReload={refetch}
                loading={loading || refetching}
            />

            {/* 첫 조회에만 스켈레톤을 표시한다. 폴링·창 포커스·수동 새로고침은 현재 예약과
                읽던 위치를 유지하고 툴바에서만 진행 상태를 알린다. */}
            {listBody}
            <QrCodeModal
                reservationId={qrReservationId}
                open={qrReservationId != null}
                onClose={() => setQrReservationId(null)}
            />
            <ReservationDetailModal
                reservation={detailReservation}
                open={detailReservation != null}
                onClose={() => setDetailReservation(null)}
            />
        </PageContainer>
    );
};

const styles = {
    title:    { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
    divider:  { height: 1, background: colors.border?.light || '#f0f0f0' },
    rejection: { fontSize: fontSize.xs, textAlign: 'right', width: '100%' },
};

export default MyReservations;
