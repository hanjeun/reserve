import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * "뒤로가기" 버튼의 단일 관문.
 *
 * ── 왜 navigate(-1) 을 그냥 쓰면 안 되나 (2026-09-06 운영에서 재현) ─────────────
 * navigate(-1) 은 브라우저 히스토리를 한 칸 되감을 뿐이다. 앱 안에 되돌아갈 곳이 없으면
 * **아무 일도 일어나지 않아서 버튼이 죽은 것처럼 보인다.** 다음 사용자가 정확히 그 경우다:
 *
 *   - 네이버·구글 검색 결과로 가게 상세에 바로 들어온 사람 (상세는 색인 대상 경로다)
 *   - 공유 링크·북마크·새 탭으로 그 주소를 처음 연 사람
 *   - 포트원 모바일 결제가 /payment/result 로 리다이렉트해서 문서가 새로 뜬 경우
 *
 * 갈리는 기준은 "그 탭에 처음 들어온 방법"이지 운이 아니다. 운영(reserve.it.kr)에서 직접 잰 값:
 *
 *   목록 → 상세 클릭            : idx 1  → 뒤로가기 정상
 *   주소로 바로 진입            : idx 0  → 눌러도 URL 이 그대로
 *   주소로 바로 진입 후 새로고침 : idx 0  → 여전히 안 됨
 *   목록 → 상세 후 새로고침      : idx 1  → 정상 (history.state 는 새로고침에도 살아남는다)
 *
 * ※ 새로고침 자체는 원인이 아니다. 처음에 그렇게 적었다가 위 계측으로 반증했다.
 *
 * react-router 는 자기 히스토리 위치를 history.state.idx 에 들고 있다. 0 이면 스택의 첫
 * 항목이라 되감을 앱 화면이 없다는 뜻이다. 그때는 되감는 대신 fallback 으로 보낸다.
 * (idx 가 없을 수도 있다 — 그 경우도 "모른다 = 되감지 않는다" 로 본다. 잘못 되감으면
 *  사용자가 사이트 밖으로 튕겨 나가는데, 그게 죽은 버튼보다 나쁘다.)
 *
 * fallback 은 replace 로 간다 — 되돌아갈 곳이 없어서 온 자리에 새 히스토리를 쌓으면
 * 그 화면에서 다시 뒤로가기를 눌렀을 때 같은 상세로 되돌아오는 고리가 생긴다.
 *
 * @param {string} fallback 되감을 곳이 없을 때 보낼 경로
 */
const useGoBack = (fallback = '/') => {
    const navigate = useNavigate();

    return useCallback(() => {
        const idx = window.history.state?.idx;
        if (typeof idx === 'number' && idx > 0) {
            navigate(-1);
            return;
        }
        navigate(fallback, { replace: true });
    }, [navigate, fallback]);
};

export default useGoBack;
