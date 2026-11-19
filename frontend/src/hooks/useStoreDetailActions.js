/*
 * 예약 생성과 수정을 공유한다. 수정 진입은 기존 예약을 조회해 폼에 채우고 생성 대신 수정 API로 제출한다.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import reservationService from '../services/reservationService';
import { invalidateReservationData } from './invalidateAfterWrite';
import { reservationKeys } from './queryKeys';
import adService from '../services/adService';
import { consumeAdClickAttribution } from '../utils/adAttribution';
import { formatDate, formatTimeForApi, formatTime } from '../utils/date';
import { httpStatusOf } from '../utils/listErrorMessage';
import useAuthStore from '../store/useAuthStore';
import useReducedMotion from './useReducedMotion';
import useReservationAdmission from './useReservationAdmission';
import useReservationChallenge, { reservationChallengeOf } from './useReservationChallenge';
import { reservationRequestAttempt, completeReservationRequest } from '../utils/reservationRequest';
import { findCachedDuplicateReservation, reservationConflictCode, RESERVATION_CONFLICT } from '../utils/reservationConflicts';
import { currentSession, assertCurrentSession, isCurrentSession } from '../api/sessionScope';
import { prepareCoreWork } from '../services/serviceAdmissionService';
import { handleApiError, isResponseUnconfirmed } from '../utils/errorHandler';

const useStoreDetailActions = ({ id, store, isLoggedIn, user, form, pay, message, reservationDate, reservationTime, onReservationSuccess }) => {
    const navigate  = useNavigate();
    const location  = useLocation();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const admission = useReservationAdmission();
    const submitting = useRef(false);
    const duplicateNotice = useRef(null);
    const [reservationSubmitting, setReservationSubmitting] = useState(false);
    const [reservationEntry, setReservationEntry] = useState(null);

    // 예약 변경 후 관련 달력·통계 캐시도 함께 무효화한다.

    const invalidateReservations = () => invalidateReservationData(queryClient);

    const refreshReservationConflict = (error, date, reservationId) => {
        if (httpStatusOf(error) !== 409) return;
        const code = reservationConflictCode(error);
        const storeId = store?.id ?? Number(id);
        if (code === RESERVATION_CONFLICT.CAPACITY) {
            void queryClient.invalidateQueries({ queryKey: reservationKeys.availability(storeId, date, reservationId), exact: true });
        } else if (code === RESERVATION_CONFLICT.NOTICE_CHANGED) {
            const key = reservationKeys.consent(user?.id, useAuthStore.getState().sessionRevision, storeId);
            void queryClient.invalidateQueries({ queryKey: key, exact: true });
        } else if (code === RESERVATION_CONFLICT.DUPLICATE) {
            void queryClient.invalidateQueries({ queryKey: reservationKeys.my(), refetchType: 'none' });
        } else {
            void invalidateReservations();
        }
    };

    const stateOpenWrite    = location.state?.openWrite    ?? false;
    const stateOpenReviewId = location.state?.openReviewId ?? null;
    const requestedReviewReservation = stateOpenWrite && Number.isSafeInteger(location.state?.reviewReservationId)
        ? location.state.reviewReservationId : null;
    const bookingSectionRef = useRef(null);
    const scrolledEdit = useRef(null);
    const reducedMotion = useReducedMotion();

    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const lookupScope = `${id}:${isLoggedIn}:${user?.id ?? user?.email}:${user?.role}:${sessionRevision}`;
    const challenge = useReservationChallenge(lookupScope);
    useEffect(() => {
        if (!reservationEntry || reservationEntry.scope !== lookupScope) return undefined;
        const timer = setTimeout(() => setReservationEntry(value => value === reservationEntry ? null : value),
            Math.max(0, reservationEntry.expiresAt - Date.now()));
        return () => clearTimeout(timer);
    }, [reservationEntry, lookupScope]);
    const checkReviewEligibility = Boolean(id && isLoggedIn);
    const completedVisit = useQuery({
        queryKey: [...reservationKeys.my(), 'review', Number(id), user?.id, sessionRevision, requestedReviewReservation],
        enabled: checkReviewEligibility,
        retry: false,
        queryFn: async ({ signal }) => {
            const visit = await reservationService.getMyCompletedForStore(Number(id), requestedReviewReservation, signal);
            return visit?.id ? { reservationId: visit.id, reviewId: visit.reviewId ?? null, reviewWritten: Boolean(visit.reviewWritten),
                reservationDate: visit.reservationDate ?? null } : null;
        },
    });
    const completedReservation = checkReviewEligibility && !completedVisit.isError ? completedVisit.data ?? null : null;
    const reviewEligibilityError = checkReviewEligibility ? completedVisit.error : null;
    const reviewEligibilityLoading = checkReviewEligibility && completedVisit.isFetching;

    // 예약 수정(edit) 모드
    const editId = searchParams.get('edit');
    const selectedDate = reservationDate ? formatDate(reservationDate) : null;
    const selectedTime = reservationTime ? formatTimeForApi(reservationTime) : null;
    const restoreEntry = admission.restoreEntry;
    useEffect(() => {
        if (editId || !id || !isLoggedIn || !selectedDate || !selectedTime) return undefined;
        let stopped = false;
        let generation = 0;
        let controller;
        const restore = async () => {
            const run = ++generation;
            controller?.abort();
            if (document.visibilityState === 'hidden') return;
            controller = new AbortController();
            try {
                const entry = await restoreEntry({ storeId: Number(id), date: selectedDate, time: selectedTime }, controller.signal);
                if (!stopped && run === generation) setReservationEntry(entry ? { scope: lookupScope,
                    slot: `${id}:${selectedDate}:${formatTime(selectedTime)}`, expiresAt: entry.expiresAt } : null);
            } catch {
                // 확인되지 않은 입장권으로 가능 상태를 안내하지 않으며 제출 시 복구·서버 입장을 확인한다.
                if (!stopped && run === generation) setReservationEntry(null);
            }
        };
        void restore();
        document.addEventListener('visibilitychange', restore);
        return () => { stopped = true; ++generation; controller?.abort(); document.removeEventListener('visibilitychange', restore); };
    }, [editId, isLoggedIn, selectedDate, selectedTime, restoreEntry, id, lookupScope]);
    const [editingReservation, setEditingReservation] = useState(null);
    // 수정 대상의 일시적 조회 오류는 현재 화면에서 재시도한다.

    const [editLoadError, setEditLoadError] = useState(null);
    const [editRetrying, setEditRetrying] = useState(false);
    const [editLoadAttempt, setEditLoadAttempt] = useState(0);
    const editScope = `${lookupScope}:${editId ?? ''}`;
    const [observedEditScope, setObservedEditScope] = useState(editScope);
    if (observedEditScope !== editScope) {
        setObservedEditScope(editScope);
        setEditingReservation(null);
        setEditLoadError(null);
        setEditRetrying(false);
    }
    const retryEditLoad = useCallback(() => {
        setEditRetrying(true);
        setEditLoadAttempt(attempt => attempt + 1);
    }, []);

    // ?edit={id}로 진입 시 그 예약을 불러와 수정 대상으로 설정.
    // 이 가게의 예약이 아니거나(방어), 결제됐거나 종료된 예약이면 수정 불가로 안내 후 내 예약으로 돌려보낸다.
    useEffect(() => {
        if (!editId || !id) return;
        if (!isLoggedIn) {
            message.warning('로그인이 필요한 서비스예요.');
            navigate('/login', { state: { from: { pathname: location.pathname } } });
            return;
        }
        let cancelled = false;
        reservationService.getReservation(Number(editId))
            .then((r) => {
                if (cancelled) return;
                setEditRetrying(false);
                setEditLoadError(null);
                if (Number(r.storeId) !== Number(id)) {
                    message.error('이 가게의 예약이 아니에요.');
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
            .catch((error) => {
                if (cancelled) return;
                setEditRetrying(false);
                // 남의 예약(403)·없는 예약(404)은 다시 불러와도 결과가 같다 — 알리고 내 예약으로 돌려보낸다.
                const status = httpStatusOf(error);
                if (status === 403 || status === 404) {
                    message.error(status === 404 ? '예약을 찾을 수 없어요.' : '변경할 수 없는 예약이에요.');
                    navigate('/my-reservations', { replace: true });
                    return;
                }
                // 네트워크·서버 오류는 다시 시도할 가치가 있다. 튕겨내면 손님이 목록에서 다시 눌러야 한다.
                setEditLoadError(error);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId, isLoggedIn, id, editLoadAttempt, editScope]);

    // 수정 예약은 각 입력칸이 받는 형식으로 채운다.
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

    useEffect(() => {
        if (!store || !editingReservation) return undefined;
        const key = lookupScope + ':' + editingReservation.id;
        if (scrolledEdit.current === key) return undefined;
        const frame = requestAnimationFrame(() => {
            if (!bookingSectionRef.current) return;
            scrolledEdit.current = key;
            bookingSectionRef.current.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
        });
        return () => cancelAnimationFrame(frame);
    }, [store, editingReservation, lookupScope, reducedMotion]);


    // 예약 결과 처리 (onFinish에서 분리해 중첩 제거)
    const handleReservationResult = async (reservation, recovered = false) => {
        // 목록으로 넘어가기 전에 무효화한다 — 결제 분기로 빠지는 경우까지 포함해
        // 모든 경로가 한 번은 지나가는 지점이라 여기 한 곳에 두면 빠뜨릴 일이 없다.
        void invalidateReservations();
        if (reservation?.depositPaid || ['CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW'].includes(reservation?.status)) {
            navigate('/my-reservations');
            return true;
        }
        const deposit = Number(reservation.depositAmount) || 0;
        if (deposit <= 0 || store?.allowLatePayment) {
            const title = reservation.status === 'CONFIRMED' ? '예약이 완료됐어요.' : '예약을 신청했어요.';
            const detail = deposit > 0
                ? ` 예약금 ${deposit.toLocaleString('ko-KR')}원을 나중에 결제해주세요.`
                : reservation.status === 'PENDING' ? ' 가게의 승인을 기다려주세요.' : '';
            const text = title + detail;
            if (onReservationSuccess) onReservationSuccess(text);
            else navigate('/my-reservations', { state: { reservationCompletion: { text, memberId: user.id, sessionRevision } } });
            return true;
        }
        message.info({ content: recovered ? '기존 미결제 예약의 결제를 이어가요.'
            : '예약금 결제 대기 중이에요. 결제를 완료해주세요.', duration: 3 });
        const result = await pay(
            { ...reservation, storeName: store?.name || reservation.storeName },
            { name: user?.name, email: user?.email, phone: user?.phone }
        );
        // 브라우저 이동·SDK 중단은 결제 완료가 아니므로 재시도 키를 유지해요.
        return result?.success === true;
    };

    // 예약 수정 제출 (onFinish에서 분리)
    const handleUpdateSubmit = async (values, session) => {
        if (!editingReservation) return;
        try {
            assertCurrentSession(session);
            await reservationService.updateReservation(editingReservation.id, {
                reservationDate: formatDate(values.reservationDate),
                reservationTime: formatTimeForApi(values.reservationTime),
                guestCount:      values.guestCount,
                specialRequest:  values.specialRequest ?? null,
            });
            assertCurrentSession(session);
            message.success('예약이 변경됐어요.');
            // 예약 캐시를 무효화하고 호출 화면의 새로고침도 유지한다.
            void invalidateReservations();
            navigate('/my-reservations', { state: { refetch: true } });
        } catch (err) {
            if (!isCurrentSession(session) || err?.name === 'AbortError') return;
            if (isResponseUnconfirmed(err)) {
                message.warning('예약 변경 결과를 확인하지 못했어요. 내 예약에서 확인한 뒤 다시 시도해주세요.');
                void invalidateReservations();
            } else {
                refreshReservationConflict(err, formatDate(values.reservationDate), editingReservation.id);
                handleApiError(err, message, '예약을 변경하지 못했어요. 다시 시도해주세요.');
            }
        }
    };

    // 예약 제출
    const onFinish = async (values) => {
        if (!isLoggedIn) {
            message.warning('로그인이 필요한 서비스예요.');
            navigate('/login', { state: { from: { pathname: location.pathname } } });
            return;
        }

        // 수정 모드로 진입했는데 아직 예약 정보 로딩 중이면, 실수로 새 예약이 생성되지 않도록 막는다.
        if (editId && !editingReservation) {
            message.info('예약 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.');
            return;
        }

        // 문자열·dayjs 시각을 같은 형식으로 정규화한다.
        const [resHour, resMinute] = formatTime(values.reservationTime).split(':').map(Number);
        const dt = values.reservationDate
            .hour(resHour)
            .minute(resMinute)
            .second(0).millisecond(0);

        if (dt.isBefore(dayjs())) {
            form.setFields([{ name: 'reservationTime', errors: ['이미 지난 시간이에요.'] }]);
            return;
        }

        if (submitting.current) return;
        submitting.current = true;
        setReservationSubmitting(true);
        const requestScope = `${user?.id}:${user?.role}:${id}`;
        const submissionSession = currentSession();
        let creationUnconfirmed = false;
        const createForThisSession = async data => {
            assertCurrentSession(submissionSession.epoch);
            if (data.admissionTicket) {
                // 캠페인이 비활성·삭제돼도 결과 복구에는 최초 제출 키를 유지한다.
                await reservationRequestAttempt(requestScope, data, data.requestId);
                assertCurrentSession(submissionSession.epoch);
            }
            let reservation;
            try {
                reservation = await reservationService.createReservation(data);
            } catch (error) {
                const required = reservationChallengeOf(error, data.requestId);
                if (!required) {
                    creationUnconfirmed = isResponseUnconfirmed(error);
                    throw error;
                }
                const token = await challenge.solve(required, submissionSession.signal);
                if (!token) throw new DOMException('예약 확인을 취소했어요.', 'AbortError');
                assertCurrentSession(submissionSession.epoch);
                reservation = await reservationService.createReservation(data, {
                    headers: { 'X-Reserve-Turnstile': token }, signal: submissionSession.signal,
                }).catch(failure => {
                    creationUnconfirmed = failure?.data?.code !== 'RESERVATION_CHALLENGE_UNAVAILABLE' && isResponseUnconfirmed(failure);
                    throw failure;
                });
            }
            assertCurrentSession(submissionSession.epoch);
            if (!Number.isSafeInteger(reservation?.id) || reservation.id <= 0) {
                throw new Error('예약 결과를 확인하지 못했어요. 내 예약에서 확인해주세요.');
            }
            return reservation;
        };
        const recoverForThisSession = async data => {
            assertCurrentSession(submissionSession.epoch);
            const result = await reservationService.recoverReservation(data, { signal: submissionSession.signal }).catch(error => {
                if ([404, 410].includes(httpStatusOf(error))) {
                    throw new Error('이전 예약 상태를 확인하지 못했어요. 내 예약에서 확인해주세요.');
                }
                throw error;
            });
            assertCurrentSession(submissionSession.epoch);
            if (!['NOT_SUBMITTED', 'RESERVED', 'CLOSED'].includes(result?.outcome)
                || result.outcome === 'RESERVED' && (!Number.isSafeInteger(result.reservation?.id) || result.reservation.id <= 0)
                || result.outcome !== 'RESERVED' && result.reservation != null) {
                throw new Error('이전 예약 상태를 확인하지 못했어요. 내 예약에서 확인해주세요.');
            }
            return result;
        };
        try {
            if (editingReservation) {
                await handleUpdateSubmit(values, submissionSession.epoch);
                return;
            }
            const hasDeposit  = store?.noShowDeposit > 0;
            const skipPayment = hasDeposit && store?.allowLatePayment === true;
            const payload = {
                ...values,
                storeId:         Number(id),
                reservationDate: formatDate(values.reservationDate),
                reservationTime: formatTimeForApi(values.reservationTime),
                ...(skipPayment && { skipPayment: true }),
            };
            const admissionScope = { storeId: payload.storeId, date: payload.reservationDate, time: payload.reservationTime };
            const cachedDuplicate = store?.allowDuplicateReservation === false && findCachedDuplicateReservation(
                queryClient, `${sessionRevision}:${user?.id}`, payload.storeId, payload.reservationDate);
            const warnDuplicate = cachedDuplicate && cachedDuplicate !== duplicateNotice.current;
            let attempt = warnDuplicate
                ? await admission.getPendingAttempt(admissionScope, { storedTicketOnly: true })
                : await admission.getPendingAttempt(admissionScope);
            assertCurrentSession(submissionSession.epoch);
            let pendingAttempt = attempt;
            let normalAttempt;
            let reservation;
            let recovered;
            if (attempt) {
                // 결과 복구는 예약 생성·선점을 수행하지 않으며 유효 입장권 없이도 조회한다.
                recovered = await recoverForThisSession({ ...payload, admissionTicket: attempt.ticket, requestId: attempt.requestId });
            } else {
                normalAttempt = warnDuplicate
                    ? await reservationRequestAttempt(requestScope, payload, null, { reuseOnly: true })
                    : await reservationRequestAttempt(requestScope, payload);
                assertCurrentSession(submissionSession.epoch);
                if (!normalAttempt) {
                    duplicateNotice.current = cachedDuplicate;
                    message.info('이 날짜에 이미 예약이 있어요. 다시 신청하면 현재 예약 상태를 확인해요.');
                    return;
                }
                duplicateNotice.current = null;
                if (normalAttempt.reused) recovered = await recoverForThisSession({ ...payload, requestId: normalAttempt.requestId });
            }
            if (recovered?.outcome === 'CLOSED') {
                // 종료가 확인된 신청만 새 키로 진행하며 이전 예약·결제 원장은 그대로 보존해요.
                const closedAttempt = attempt || normalAttempt;
                admission.complete(closedAttempt);
                completeReservationRequest(requestScope, closedAttempt.requestId);
                attempt = null;
                pendingAttempt = null;
                normalAttempt = await reservationRequestAttempt(requestScope, payload);
                assertCurrentSession(submissionSession.epoch);
            } else if (recovered?.outcome === 'RESERVED') {
                reservation = recovered.reservation;
            }
            if (!reservation) {
                const ready = await prepareCoreWork({ method: 'post', url: '/api/reservations',
                    epoch: submissionSession.epoch, signal: submissionSession.signal });
                assertCurrentSession(submissionSession.epoch);
                if (!ready) return;
                if (attempt) {
                    try { reservation = await createForThisSession({ ...payload, admissionTicket: attempt.ticket, requestId: attempt.requestId }); }
                    catch (error) {
                        if (httpStatusOf(error) !== 409 || reservationConflictCode(error) || error?.message?.includes('요청 번호')) throw error;
                    }
                }
                if (!reservation) {
                    setReservationEntry(null);
                    attempt = await admission.enter(admissionScope);
                    assertCurrentSession(submissionSession.epoch);
                    if (attempt === false) return;
                    if (attempt) {
                        setReservationEntry({ scope: lookupScope,
                            slot: `${payload.storeId}:${payload.reservationDate}:${formatTime(payload.reservationTime)}`,
                            expiresAt: attempt.expiresAt });
                        return;
                    }
                    const requestId = pendingAttempt?.requestId ?? normalAttempt.requestId;
                    reservation = await createForThisSession({ ...payload, requestId });
                }
            }
            setReservationEntry(null);
            if (pendingAttempt) {
                await reservationRequestAttempt(requestScope, payload, pendingAttempt.requestId);
                assertCurrentSession(submissionSession.epoch);
            }
            admission.complete(attempt || pendingAttempt || { requestId: normalAttempt.requestId });
            // 배너 클릭 귀속은 같은 가게의 새 예약에만 요청한다.
            // 현재 회원·가게·기간·중복은 서버가 재검증하며 기록 오류는 예약 성공을 바꾸지 않는다.
            const attributedAdId = consumeAdClickAttribution(Number(id));
            if (attributedAdId && reservation?.id) {
                void adService.recordConversion(attributedAdId, reservation.id);
            }
            const finished = await handleReservationResult(reservation, recovered?.outcome === 'RESERVED');
            // 결제창 종료·준비 실패 뒤 같은 신청은 생성하지 않고 기존 예약부터 복구해요.
            if (finished && currentSession().epoch === submissionSession.epoch) {
                completeReservationRequest(requestScope, (attempt || pendingAttempt || normalAttempt).requestId);
            }
        } catch (err) {
            if (!isCurrentSession(submissionSession.epoch) || err?.name === 'AbortError') return;
            if (creationUnconfirmed) {
                message.warning('예약 신청 결과를 확인하지 못했어요. 내 예약에서 먼저 확인해주세요.');
                void invalidateReservations();
                return;
            }
            refreshReservationConflict(err, formatDate(values.reservationDate));
            handleApiError(err, message, '예약에 실패했어요. 다시 시도해주세요.');
        } finally {
            submitting.current = false;
            setReservationSubmitting(false);
        }
    };

    return {
        completedReservation,
        reviewEligibilityError,
        reviewEligibilityLoading,
        refetchReviewEligibility: completedVisit.refetch,
        stateOpenWrite,
        stateOpenReviewId,
        reviewNavigationKey: location.key,
        bookingSectionRef,
        onFinish,
        isEditMode: !!editId,
        editingReservation,
        editLoadError,
        editRetrying,
        retryEditLoad,
        admissionModalProps: admission.modalProps,
        reservationChallengeProps: challenge.dialogProps,
        reservationSubmitting,
        reservationEntry: !editId && reservationEntry?.scope === lookupScope ? reservationEntry : null,
    };
};

export default useStoreDetailActions;
