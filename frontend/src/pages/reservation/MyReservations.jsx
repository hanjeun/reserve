import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Empty, Typography } from 'antd';
import {
    CreditCardOutlined, DeleteOutlined, QrcodeOutlined,
    CloseOutlined, StarOutlined, EditOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, FilterToolbar, MyReservationCardSkeleton, SpinIndicator } from '../../components/common';
import ReservationRow from '../../components/reservation/ReservationRow';
import ReservationMeta from '../../components/reservation/ReservationMeta';
import ReservationDetailModal from '../../components/reservation/ReservationDetailModal';
import QrCodeModal from '../../components/reservation/QrCodeModal';
import { useReservations, useMessage, usePayment } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useDebounce from '../../hooks/useDebounce';
import useAuthStore from '../../store/useAuthStore';
import paymentService from '../../services/paymentService';
import api from '../../api/axios';
import { formatCurrency } from '../../utils';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
    { value: 'ALL',       label: '전체 상태' },
    { value: 'PENDING',   label: '승인 대기' },
    { value: 'CONFIRMED', label: '확정' },
    { value: 'COMPLETED', label: '완료' },
    { value: 'REJECTED',  label: '거절' },
    { value: 'CANCELLED', label: '취소' },
    { value: 'NO_SHOW',   label: '노쇼' },
];

/**
 * 예약 카드의 액션 버튼 묶음(결제/변경/QR/취소/리뷰/삭제).
 * 상태별로 나오는 버튼이 달라서 별도 컴포넌트로 추출.
 * 2026-07: 감싸는 flex wrapper(정렬/간격)는 ReservationRow가 담당하므로
 * 여기선 버튼 자체만 반환한다 — 사업자 쪽(ReservationCard.jsx)과 배치 로직을 공유하기 위함.
 */
const ReservationActions = ({ res, paying, onPay, onEdit, onQr, onCancel, onReview, onRemove }) => (
    <>
        {res.status === 'PENDING' && res.depositAmount > 0 && !res.depositPaid && (
            <Button variant="ghost-sm-primary" loading={paying}
                onClick={(e) => { e.stopPropagation(); onPay(res); }}>
                <CreditCardOutlined /> 결제하기
            </Button>
        )}
        {(res.status === 'PENDING' || res.status === 'CONFIRMED') && (
            <>
                {!res.depositPaid && (
                    <Button variant="ghost-sm-primary"
                        onClick={(e) => { e.stopPropagation(); onEdit(res); }}>
                        <EditOutlined /> 변경
                    </Button>
                )}
                <Button variant="ghost-sm-primary"
                    onClick={(e) => { e.stopPropagation(); onQr(res); }}>
                    <QrcodeOutlined /> QR
                </Button>
                <Button variant="ghost-sm-danger"
                    onClick={(e) => { e.stopPropagation(); onCancel(res); }}>
                    <CloseOutlined /> 취소
                </Button>
            </>
        )}
        {res.status === 'COMPLETED' && (
            <>
                {res.reviewId
                    ? <Button variant="ghost-sm-success"
                        onClick={(e) => { e.stopPropagation(); onReview(res, true); }}>
                        <StarOutlined /> 리뷰 보기
                      </Button>
                    : <Button variant="ghost-sm-primary"
                        onClick={(e) => { e.stopPropagation(); onReview(res, false); }}>
                        <StarOutlined /> 리뷰 쓰기
                      </Button>
                }
                <Button variant="ghost-sm" size="sm"
                    onClick={(e) => { e.stopPropagation(); onRemove(res); }}
                    style={{ color: colors.text.tertiary }}>
                    <DeleteOutlined /> 삭제
                </Button>
            </>
        )}
        {['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(res.status) && (
            <Button variant="ghost-sm" size="sm"
                onClick={(e) => { e.stopPropagation(); onRemove(res); }}
                style={{ color: colors.text.tertiary }}>
                <DeleteOutlined /> 삭제
            </Button>
        )}
    </>
);

const MyReservations = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { message, confirm } = useMessage();
    const { reservations, loading, refetching, cancelReservation, refetch } = useReservations();
    const { user } = useAuthStore();
    const { pay, paying } = usePayment();
    useDocumentTitle('내 예약');

    const [statusFilter, setStatusFilter] = useState('ALL');
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
        if (location.state?.refetch) refetch();
        if (location.state) navigate(location.pathname, { replace: true, state: {} });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = useMemo(() => {
        let list = statusFilter !== 'ALL'
            ? reservations.filter(r => r.status === statusFilter)
            : reservations;
        if (debouncedKeyword.trim()) {
            const kw = debouncedKeyword.toLowerCase();
            list = list.filter(r =>
                r.storeName?.toLowerCase().includes(kw) ||
                r.specialRequest?.toLowerCase().includes(kw) ||
                r.reservationCode?.toLowerCase().includes(kw)
            );
        }
        return list;
    }, [reservations, statusFilter, debouncedKeyword]);

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
                    refetch();
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
            okButtonProps: { danger: true, loading: true }, centered: true,
            onOk: () => cancelReservation(res.id),
        });

        paymentService.getRefundPreview(res.id)
            .then((preview) => {
                const content = preview.refundAmount > 0
                    ? `예약을 취소하면 ${formatCurrency(preview.refundAmount)}이 환불됩니다. (${preview.reason})`
                    : `취소 시점 기준 환불 불가 조건입니다. (${preview.reason}) 예약을 취소하시겠습니까?`;
                modalHandle.update({ content, okButtonProps: { danger: true, loading: false } });
            })
            .catch(() => {
                // 환불 조회 실패해도 취소는 계속 가능하게 — 기본 문구로 되돌림
                modalHandle.update({
                    content: '예약을 취소하시겠습니까? 취소 후 되돌릴 수 없습니다.',
                    okButtonProps: { danger: true, loading: false },
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

    const renderReservationRow = (res) => (
        <ReservationRow
            reservation={res}
            onOpenDetail={() => setDetailReservation(res)}
            renderMeta={(isWide) => (
                <ReservationMeta
                    memberName={res.memberName}
                    guestCount={res.guestCount}
                    reservationDate={res.reservationDate}
                    reservationTime={res.reservationTime}
                    isWide={isWide}
                    // 모바일: 이름/인원 대신 예약번호+날짜/시간을 보여줌(2026-07).
                    mobileCodeMode
                    reservationCode={res.reservationCode}
                />
            )}
            renderActions={() => <ReservationActions res={res} {...actionHandlers} />}
            extraNote={
                res.status === 'REJECTED' && res.rejectionReason ? (
                    <Text type="secondary" style={styles.rejection}>사유: {res.rejectionReason}</Text>
                ) : null
            }
        />
    );

    return (
        <PageContainer size="xl" paddingTop="40px">
            <div style={{ marginBottom: 32 }}>
                <Title level={2} style={styles.title}>내 예약 확인</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    예약 현황을 확인하고 방문 후 리뷰를 남겨보세요
                </Text>
            </div>

            <FilterToolbar
                selects={[{
                    value: statusFilter,
                    onChange: setStatusFilter,
                    options: STATUS_OPTIONS,
                    width: 140,
                    disabled: loading || refetching,
                }]}
                count={filtered.length}
                search={{ value: keyword, onChange: e => setKeyword(e.target.value), placeholder: '가게명, 예약번호로 검색', disabled: loading || refetching }}
                onReload={refetch}
                loading={loading || refetching}
            />

            {/* 최초 로딩뿐 아니라 백그라운드 재조회(refetching) 중에도 동일하게 스켈레톤 노출 —
                StoreList.jsx와 동일한 컨벤션(이 목록도 원래 스켈레톤이 자체 로딩 관례이므로) */}
            {(loading || refetching) ? (
                <MyReservationCardSkeleton count={4} />
            ) : filtered.length === 0 ? (
                <div style={{ marginTop: 100 }}>
                    <Empty description={
                        <span style={{ color: colors.text.tertiary }}>
                            {statusFilter === 'ALL' && !debouncedKeyword.trim()
                                ? '예약 내역이 없습니다.'
                                : '조건에 맞는 예약이 없습니다.'}
                        </span>
                    } />
                </div>
            ) : (
                <div>
                    {filtered.map((res, i) => (
                        <React.Fragment key={res.id}>
                            {renderReservationRow(res)}
                            {i < filtered.length - 1 && <div style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </div>
            )}
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
