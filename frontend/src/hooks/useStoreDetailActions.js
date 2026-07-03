/**
 * useStoreDetailActions — StoreDetail의 예약 제출 · 완료예약 조회 로직
 *
 * 분리 이유: StoreDetail Cognitive Complexity 30 → SonarCloud 임계값 15 초과
 * onFinish (분기 12개+), useEffect 2개를 여기로 옮겨 StoreDetail 본문을 ~10 이하로 낮춤.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import reservationService from '../services/reservationService';
import { formatDate, formatTimeForApi } from '../utils/date';

const useStoreDetailActions = ({ id, store, isLoggedIn, user, form, pay, message }) => {
    const navigate  = useNavigate();
    const location  = useLocation();

    const stateOpenWrite    = location.state?.openWrite    ?? false;
    const stateOpenReviewId = location.state?.openReviewId ?? null;
    const reviewSectionRef  = useRef(null);

    const [completedReservation, setCompletedReservation] = useState(null);

    // 이 가게에서 완료된 예약이 있는지 조회 (리뷰 작성 가능 여부 판단용)
    // 서버에서 바로 필터링된 1건만 받아옴 — 이전에는 내 전체 예약을 불러와 클라이언트에서 storeId로 필터링했음
    useEffect(() => {
        if (!isLoggedIn) return;
        reservationService.getMyCompletedForStore(Number(id)).then(res => {
            if (res) setCompletedReservation({ reservationId: res.id, reviewId: res.reviewId ?? null });
        }).catch(() => {});
    }, [id, isLoggedIn]);

    // 리뷰 섹션 자동 스크롤 (외부에서 상태를 통해 트리거)
    useEffect(() => {
        const shouldScroll = (stateOpenWrite || stateOpenReviewId) && reviewSectionRef.current;
        if (!shouldScroll) return;
        const t = setTimeout(() =>
            reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
        return () => clearTimeout(t);
    }, [stateOpenWrite, stateOpenReviewId]);

    // ── 예약 결과 처리 (onFinish에서 분리해 중첩 제거) ──────────────────────
    const handleReservationResult = async (reservation) => {
        if (!reservation?.depositAmount) {
            message.success('예약이 완료되었습니다.');
            navigate('/my-reservations');
            return;
        }
        if (store?.allowLatePayment) {
            const amount = Number(reservation.depositAmount).toLocaleString('ko-KR');
            message.success({
                content: `예약이 완료되었습니다. 예약금 ${amount}원을 나중에 결제해주세요.`,
                duration: 4,
            });
            navigate('/my-reservations');
            return;
        }
        message.info({ content: '예약이 접수되었습니다. 노쇼 예약금을 결제해주세요.', duration: 3 });
        await pay(
            { id: reservation.id, storeName: store?.name, depositAmount: reservation.depositAmount },
            { name: user?.name, email: user?.email, phone: user?.phone }
        );
    };

    // ── 예약 제출 ────────────────────────────────────────────────────────────
    const onFinish = async (values) => {
        if (!isLoggedIn) {
            message.warning('로그인이 필요한 서비스입니다.');
            navigate('/login', { state: { from: { pathname: `/store/${id}` } } });
            return;
        }

        const dt = values.reservationDate
            .hour(values.reservationTime.hour())
            .minute(values.reservationTime.minute())
            .second(0).millisecond(0);

        if (dt.isBefore(dayjs())) {
            form.setFields([{ name: 'reservationTime', errors: ['이미 지난 시간입니다.'] }]);
            return;
        }

        try {
            const hasDeposit  = store?.noShowDeposit > 0;
            const skipPayment = hasDeposit && store?.allowLatePayment === true;
            const reservation = await reservationService.createReservation({
                ...values,
                storeId:         Number(id),
                reservationDate: formatDate(values.reservationDate),
                reservationTime: formatTimeForApi(values.reservationTime),
                ...(skipPayment && { skipPayment: true }),
            });
            await handleReservationResult(reservation);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message
                         : typeof err === 'string' ? err
                         : null;
            message.error({ content: errMsg || '예약에 실패했습니다. 다시 시도해주세요.', duration: 5 });
        }
    };

    return {
        completedReservation,
        stateOpenWrite,
        stateOpenReviewId,
        reviewSectionRef,
        onFinish,
    };
};

export default useStoreDetailActions;
