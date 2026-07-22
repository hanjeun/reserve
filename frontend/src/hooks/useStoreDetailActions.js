/**
 * useStoreDetailActions — StoreDetail의 예약 제출 · 완료예약 조회 · 예약 수정(edit) 로직
 *
 * 분리 이유: StoreDetail Cognitive Complexity 30 → SonarCloud 임계값 15 초과
 * onFinish (분기 12개+), useEffect들을 여기로 옮겨 StoreDetail 본문을 낮춤.
 *
 * 2026-07 예약 수정: URL 쿼리 ?edit={reservationId}로 진입하면 그 예약을 불러와 폼을 prefill하고,
 * 제출 시 createReservation 대신 updateReservation을 호출한다. 폼 UI(TimeSlotPicker 등)를 그대로 재사용.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import reservationService from '../services/reservationService';
import adService from '../services/adService';
import { consumeAdClickAttribution } from '../utils/adAttribution';
import { formatDate, formatTimeForApi, formatTime } from '../utils/date';

const useStoreDetailActions = ({ id, store, isLoggedIn, user, form, pay, message }) => {
    const navigate  = useNavigate();
    const location  = useLocation();
    const [searchParams] = useSearchParams();

    const stateOpenWrite    = location.state?.openWrite    ?? false;
    const stateOpenReviewId = location.state?.openReviewId ?? null;
    const reviewSectionRef  = useRef(null);

    const [completedReservation, setCompletedReservation] = useState(null);

    // ── 예약 수정(edit) 모드 ──────────────────────────────────────────────────
    const editId = searchParams.get('edit');
    const [editingReservation, setEditingReservation] = useState(null);

    // 이 가게에서 완료된 예약이 있는지 조회 (리뷰 작성 가능 여부 판단용)
    // 서버에서 바로 필터링된 1건만 받아옴 — 이전에는 내 전체 예약을 불러와 클라이언트에서 storeId로 필터링했음
    useEffect(() => {
        if (!isLoggedIn) return;
        reservationService.getMyCompletedForStore(Number(id)).then(res => {
            if (res) setCompletedReservation({ reservationId: res.id, reviewId: res.reviewId ?? null });
        }).catch(() => {});
    }, [id, isLoggedIn]);

    // ?edit={id}로 진입 시 그 예약을 불러와 수정 대상으로 설정.
    // 이 가게의 예약이 아니거나(방어), 결제됐거나 종료된 예약이면 수정 불가로 안내 후 내 예약으로 돌려보낸다.
    useEffect(() => {
        if (!editId) { setEditingReservation(null); return; }
        if (!isLoggedIn) {
            message.warning('로그인이 필요한 서비스입니다.');
            navigate('/login', { state: { from: { pathname: `/store/${id}` } } });
            return;
        }
        let cancelled = false;
        reservationService.getReservation(Number(editId))
            .then((r) => {
                if (cancelled) return;
                if (Number(r.storeId) !== Number(id)) {
                    message.error('이 가게의 예약이 아닙니다.');
                    navigate('/my-reservations', { replace: true });
                    return;
                }
                const editable = (r.status === 'PENDING' || r.status === 'CONFIRMED') && !r.depositPaid;
                if (!editable) {
                    message.warning('결제됐거나 종료된 예약은 변경할 수 없어요. 취소 후 다시 예약해주세요.');
                    navigate('/my-reservations', { replace: true });
                    return;
                }
                setEditingReservation(r);
            })
            .catch(() => {
                if (cancelled) return;
                message.error('예약 정보를 불러오지 못했습니다.');
                navigate('/my-reservations', { replace: true });
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId, isLoggedIn, id]);

    // 수정 대상 예약이 준비되면 폼을 기존 값으로 prefill.
    // reservationDate는 dayjs, reservationTime은 TimeSlotPicker가 쓰는 "HH:mm" 문자열로 맞춘다.
    useEffect(() => {
        if (!editingReservation) return;
        form.setFieldsValue({
            reservationDate: dayjs(editingReservation.reservationDate),
            reservationTime: formatTime(editingReservation.reservationTime),
            guestCount:      editingReservation.guestCount,
            specialRequest:  editingReservation.specialRequest ?? undefined,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingReservation]);

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
        if ((Number(reservation?.depositAmount) || 0) <= 0) {
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

    // ── 예약 수정 제출 (onFinish에서 분리) ────────────────────────────────────
    const handleUpdateSubmit = async (values) => {
        try {
            await reservationService.updateReservation(editingReservation.id, {
                reservationDate: formatDate(values.reservationDate),
                reservationTime: formatTimeForApi(values.reservationTime),
                guestCount:      values.guestCount,
                specialRequest:  values.specialRequest ?? null,
            });
            message.success('예약이 변경되었습니다.');
            navigate('/my-reservations', { state: { refetch: true } });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message
                         : typeof err === 'string' ? err
                         : null;
            message.error({ content: errMsg || '예약 변경에 실패했습니다. 다시 시도해주세요.', duration: 5 });
        }
    };

    // ── 예약 제출 ────────────────────────────────────────────────────────────
    const onFinish = async (values) => {
        if (!isLoggedIn) {
            message.warning('로그인이 필요한 서비스입니다.');
            navigate('/login', { state: { from: { pathname: `/store/${id}` } } });
            return;
        }

        // 수정 모드로 진입했는데 아직 예약 정보 로딩 중이면, 실수로 새 예약이 생성되지 않도록 막는다.
        if (editId && !editingReservation) {
            message.info('예약 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        // reservationTime은 TimeSlotPicker에서 "HH:mm" 문자열로 온다(기존 dayjs 객체 전제 코드와 호환되게 formatTime으로 먼저 정규화)
        const [resHour, resMinute] = formatTime(values.reservationTime).split(':').map(Number);
        const dt = values.reservationDate
            .hour(resHour)
            .minute(resMinute)
            .second(0).millisecond(0);

        if (dt.isBefore(dayjs())) {
            form.setFields([{ name: 'reservationTime', errors: ['이미 지난 시간입니다.'] }]);
            return;
        }

        // 수정 모드
        if (editingReservation) {
            await handleUpdateSubmit(values);
            return;
        }

        // 생성 모드
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
            // 광고 전환 기록(2026-07 추가) — 이 가게에 대해 최근에 배너 광고를 클릭하고 온 이력이
            // sessionStorage에 남아있으면(24시간 이내) 전환으로 집계한다. 예약 성공 자체를 막지 않도록
            // 실패는 조용히 무시(adService.recordConversion 자체가 내부적으로 catch함).
            const attributedAdId = consumeAdClickAttribution(Number(id));
            if (attributedAdId) adService.recordConversion(attributedAdId);
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
        isEditMode: !!editId,
        editingReservation,
    };
};

export default useStoreDetailActions;
