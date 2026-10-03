import { useQuery } from '@tanstack/react-query';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';
import { httpStatusOf, isMissingRequestError } from '../utils/listErrorMessage';

/**
 * 가게 데이터 로딩 훅
 * @param {string|number} storeId
 * @param {object} options
 * @param {boolean} options.forEdit true면 인증된 /edit 엔드포인트 사용 (소유자만 접근 가능)
 *
 * 2026-07-10: TanStack Query로 전환 — 이전엔 useState+useEffect라 캐싱이 전혀 없어서
 * 목록에서 봤던 가게를 다시 눌러 들어가도 항상 새로 요청 + 스켈레톤부터 다시 보여줬음.
 * 이제 같은 가게를 짧은 시간(staleTime) 안에 다시 열면 캐시에서 즉시 보여줌.
 */
const useStoreData = (storeId, { forEdit = false } = {}) => {
    const validId = /^\d+$/.test(String(storeId ?? ''))
        && Number.isSafeInteger(Number(storeId)) && Number(storeId) > 0;
    const { data: store, isLoading: loading, error, refetch } = useQuery({
        queryKey: forEdit ? [...storeKeys.detail(storeId), 'edit'] : storeKeys.detail(storeId),
        queryFn: () => validId ? (forEdit ? storeService.getStoreForEdit(storeId) : storeService.getStoreById(storeId)) : null,
        enabled: validId,
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
