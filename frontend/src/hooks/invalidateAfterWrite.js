import { adKeys, adminKeys, favoriteKeys, reservationKeys, storeKeys } from './queryKeys';

/**
 * 쓰기 후 캐시 무효화 규칙 (2026-09)
 *
 * 전역 staleTime 이 3분이라(SessionQueryProvider), 쓰기 뒤에 무효화하지 않은 캐시는 최대 3분 동안
 * 옛 값을 그대로 보여준다. 예전에는 "쓰기를 누른 화면의 목록"만 무효화해서, 같은 데이터를 보여주는
 * 다른 화면이 늦게 바뀌었다.
 *   - 찜을 눌러도 '내 즐겨찾기' 목록은 그대로
 *   - 리뷰를 써도 가게 상단 별점·리뷰 수, 목록 카드, '내 예약'의 리뷰 버튼은 그대로
 *   - 예약을 취소·거절해도 예약 달력의 빈자리와 사업자 통계는 그대로
 *
 * 규칙: 어느 화면에서 눌렀는지가 아니라 **그 쓰기가 바꾸는 서버 데이터**를 기준으로,
 * 그 데이터가 보이는 키를 전부 무효화한다. 새 쓰기를 추가할 때는 여기서 맞는 함수를 먼저 찾을 것.
 *
 * invalidateQueries 는 지금 화면에 떠 있는(active) 쿼리만 즉시 다시 부르고, 나머지는 stale 표시만
 * 한다 — 넓게 무효화해도 요청이 그만큼 늘지는 않는다. 다음에 그 화면을 열 때 새로 받아온다.
 *
 * 전부 Promise 를 돌려준다. 이동 직전처럼 재조회 완료를 기다려야 하면 await 하면 된다.
 */

const invalidateAll = (queryClient, keys) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

/** 찜 추가·해제. 개별 하트(status)는 호출부가 응답으로 직접 채우므로 목록만 무효화한다. */
export const invalidateFavoriteData = (queryClient) =>
    invalidateAll(queryClient, [favoriteKeys.my()]);

/**
 * 리뷰 작성·수정·삭제. 리뷰 목록(reviewKeys.byStore)은 호출부가 setQueryData 로 직접 고친다.
 * 서버는 가게의 평균 별점·리뷰 수를 다시 계산하고, 예약에 reviewId 를 연결하거나 끊는다.
 */
export const invalidateReviewData = (queryClient) =>
    invalidateAll(queryClient, [
        storeKeys.all(),        // 가게 상세 헤더·목록 카드·사업자 통계의 별점·리뷰 수
        favoriteKeys.my(),      // 즐겨찾기 카드의 별점·리뷰 수
        reservationKeys.my(),   // '내 예약'의 리뷰 쓰기 ↔ 내 리뷰 보기 버튼
    ]);

/** 예약 생성·취소·승인·거절·완료·노쇼·되돌리기. */
export const invalidateReservationData = (queryClient) =>
    invalidateAll(queryClient, [
        reservationKeys.all(),        // 내 예약·예약 관리·예약 달력의 빈자리
        storeKeys.statisticsAll(),    // 사업자 통계(예약 추이·상태 분포·매출)
    ]);

/**
 * 가게 등록·수정·영업 종료. 영업 종료 시 서버는 그 가게의 찜을 지우고 광고를 정리한다
 * (StoreService.deleteStore). 이름·대표 사진이 바뀌면 즐겨찾기 카드에도 보인다.
 */
export const invalidateStoreData = (queryClient) =>
    invalidateAll(queryClient, [storeKeys.all(), favoriteKeys.all(), adKeys.all()]);

/**
 * 광고 등록·결제·취소·수정·삭제·중단. 내 광고·관리자 광고 목록과 공개 배너·배지,
 * 사업자 통계의 광고 요약(adSummary)이 함께 바뀐다.
 */
export const invalidateAdData = (queryClient) =>
    invalidateAll(queryClient, [adKeys.all(), storeKeys.statisticsAll()]);

/**
 * 관리자 조치. 회원·가게 제재, 사업자 승인, 휴지통 이동·복원은 서로 다른 탭의 목록과
 * 대시보드 집계, 감사 로그를 함께 바꾼다. 탭별로 골라내지 않고 관리자 캐시 전체를 무효화한다.
 */
export const invalidateAdminData = (queryClient) =>
    invalidateAll(queryClient, [adminKeys.all()]);
