import { useQueryClient } from '@tanstack/react-query';
import { storeKeys } from './queryKeys';
import { extractImageHint, rememberImageHints, getImageHint } from '../utils/imageHintCache';

/**
 * 가게 상세 스켈레톤의 커버 이미지를 "그 가게의 실제 이미지 비율"로 그리기 위한 힌트.
 * 상세 데이터를 대신 쓰는 게 아니라(부분 데이터로 화면을 잘못 그릴 위험이 있음),
 * 딱 커버 이미지 자리의 aspect-ratio를 맞추는 용도로만 쓴다.
 *
 * ── 조회 순서 (2026-07 전수조사에서 1번을 추가) ────────────────────────────────
 * 1) imageHintCache — 목록/상세를 볼 때마다 비율만 따로 적어둔 sessionStorage 캐시.
 * 2) TanStack Query의 목록 캐시(storeKeys.list) — 방금 목록에서 클릭해 들어온 경우.
 *    여기서 찾으면 1번 캐시에도 적어둔다.
 * 3) 둘 다 없으면 null → 스켈레톤은 1:1 정사각으로 폴백.
 *
 * 왜 1번이 필요했나:
 * 예전엔 2번만 봤는데, 목록 캐시가 없는 경우가 생각보다 흔했다 —
 * 상세 URL 직접 진입 / 상세에서 새로고침 / 홈·찜 목록에서 클릭(이건 storeKeys.list가 아님) /
 * 목록 본 지 10분 지나 gcTime으로 캐시 수거됨.
 * 그래서 "어떤 땐 비율이 딱 맞고 어떤 땐 큰 정사각형이 뜨는" 들쭉날쭉한 증상이 났다.
 * 이미지 비율은 몇 바이트짜리 메타데이터라 오래 들고 있어도 위험이 없으므로 따로 캐싱한다.
 */
const useStoreImageHint = (storeId) => {
    const queryClient = useQueryClient();
    if (!storeId) return null;

    // 1) 비율 전용 캐시 — 이 가게를 목록에서든 상세에서든 한 번이라도 본 적이 있으면 여기 있다
    const cached = getImageHint(storeId);
    if (cached) return cached;

    // 2) 목록 쿼리 캐시 — 방금 목록에서 클릭해 들어온 경우
    const queries = queryClient.getQueriesData({ queryKey: storeKeys.all() });
    for (const [key, data] of queries) {
        if (!Array.isArray(key) || key[1] !== 'list') continue;
        const pages = data?.pages;
        if (!pages) continue;
        for (const page of pages) {
            const found = page?.content?.find((s) => String(s.id) === String(storeId));
            if (!found) continue;

            const hint = extractImageHint(found);
            if (hint) {
                // 다음에 새로고침하거나 다른 경로로 들어와도 쓸 수 있게 적어둔다
                rememberImageHints(found);
                return hint;
            }
        }
    }
    return null;
};

export default useStoreImageHint;
