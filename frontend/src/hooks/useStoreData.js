import { useQuery } from '@tanstack/react-query';
import storeService from '../services/storeService';
import reservationService from '../services/reservationService';
import { storeKeys } from './queryKeys';
import { httpStatusOf, isMissingRequestError } from '../utils/listErrorMessage';
import { isLegacyStoreId, normalizeStorePublicId } from '../utils/storePublicAddress';

/*
 * 공개·가게 수정·예약 변경 조회의 경로와 캐시 범위를 구분한다.
 * @param {string|number} storeId 수정은 내부 ID, 공개·예약 변경은 UUID
 * @param {object} options
 * @param {boolean} options.forEdit true면 인증된 /edit 엔드포인트 사용 (소유자만 접근 가능)
 * @param {string|number|null} options.reservationId 본인 예약 변경에 필요한 공개 가게 정보 조회
 * @param {string|null} options.editDraftEntryKey 초안을 이어 쓸 때 새로 확인할 수정 원본의 진입 키
 */
const useStoreData = (storeId, { forEdit = false, reservationId = null, editDraftEntryKey = null } = {}) => {
    const reservationEdit = reservationId !== null;
    const draftEdit = forEdit && editDraftEntryKey !== null;
    const publicId = forEdit ? null : normalizeStorePublicId(storeId);
    const address = publicId ?? storeId;
    const enabled = (forEdit ? isLegacyStoreId(storeId) : Boolean(publicId))
        && (!reservationEdit || isLegacyStoreId(reservationId));
    const { data: store, dataUpdatedAt, isLoading: loading, error, refetch } = useQuery({
        queryKey: reservationEdit ? [...storeKeys.detail(storeId), 'reservation-edit', reservationId]
            : forEdit ? [...storeKeys.detail(storeId), 'edit', ...(draftEdit ? [editDraftEntryKey] : [])] : storeKeys.detail(address),
        queryFn: context => {
            if (!enabled) return null;
            // signal 접근이 취소 참여를 뜻하므로 일반 가게 조회는 StrictMode에서 공유한다.
            if (reservationEdit) return reservationService.getEditStore(reservationId, publicId, { signal: context.signal });
            return forEdit ? storeService.getStoreForEdit(storeId) : storeService.getStoreById(address);
        },
        enabled,
        ...(draftEdit ? { gcTime: 0 } : {}),
        retry: (failureCount, requestError) => {
            const status = httpStatusOf(requestError);
            if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
            return failureCount < 1;
        },
    });

    const accessDenied = [401, 403].includes(httpStatusOf(error));
    const matchesAddress = !publicId || normalizeStorePublicId(store?.publicId) === publicId && isLegacyStoreId(store?.id);
    // 접근 거부·삭제 응답 뒤에는 캐시가 있어도 이전 상세나 수정 폼을 표시하지 않는다.
    // 화면이 404·권한·일시 장애를 서로 다른 아이콘과 다음 행동으로 구분할 수 있도록
    // 메시지 문자열 대신 Axios가 정규화한 오류 객체를 그대로 전달한다.
    return { store: enabled && matchesAddress && !accessDenied && !isMissingRequestError(error) ? store ?? null : null,
        loading, error: error ?? null, refetch, dataUpdatedAt };
};

export default useStoreData;
