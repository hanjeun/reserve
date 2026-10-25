import { useQuery } from '@tanstack/react-query';
import storeService from '../services/storeService';
import reservationService from '../services/reservationService';
import { storeKeys } from './queryKeys';
import { httpStatusOf, isMissingRequestError } from '../utils/listErrorMessage';

/*
 * 공개·가게 수정·예약 변경 조회의 경로와 캐시 범위를 구분한다.
 * @param {string|number} storeId
 * @param {object} options
 * @param {boolean} options.forEdit true면 인증된 /edit 엔드포인트 사용 (소유자만 접근 가능)
 * @param {string|number|null} options.reservationId 본인 예약 변경에 필요한 공개 가게 정보 조회
 */
const useStoreData = (storeId, { forEdit = false, reservationId = null } = {}) => {
    const validId = /^\d+$/.test(String(storeId ?? ''))
        && Number.isSafeInteger(Number(storeId)) && Number(storeId) > 0;
    const reservationEdit = reservationId !== null;
    const validReservation = /^\d+$/.test(String(reservationId)) && Number.isSafeInteger(Number(reservationId)) && Number(reservationId) > 0;
    const enabled = validId && (!reservationEdit || validReservation);
    const { data: store, isLoading: loading, error, refetch } = useQuery({
        queryKey: reservationEdit ? [...storeKeys.detail(storeId), 'reservation-edit', reservationId]
            : forEdit ? [...storeKeys.detail(storeId), 'edit'] : storeKeys.detail(storeId),
        queryFn: context => {
            if (!enabled) return null;
            // signal 접근이 취소 참여를 뜻하므로 일반 가게 조회는 StrictMode에서 공유한다.
            if (reservationEdit) return reservationService.getEditStore(reservationId, storeId, { signal: context.signal });
            return forEdit ? storeService.getStoreForEdit(storeId) : storeService.getStoreById(storeId);
        },
        enabled,
        retry: (failureCount, requestError) => {
            const status = httpStatusOf(requestError);
            if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
            return failureCount < 1;
        },
    });

    const accessDenied = [401, 403].includes(httpStatusOf(error));
    // 접근 거부·삭제 응답 뒤에는 캐시가 있어도 이전 상세나 수정 폼을 표시하지 않는다.
    // 화면이 404·권한·일시 장애를 서로 다른 아이콘과 다음 행동으로 구분할 수 있도록
    // 메시지 문자열 대신 Axios가 정규화한 오류 객체를 그대로 전달한다.
    return { store: validId && !accessDenied && !isMissingRequestError(error) ? store ?? null : null, loading, error: error ?? null, refetch };
};

export default useStoreData;
