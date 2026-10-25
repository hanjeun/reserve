import { adKeys, adminKeys, benefitKeys, favoriteKeys, reservationKeys, storeKeys } from './queryKeys';

/*
 * 쓰기가 바꾸는 서버 데이터를 기준으로 관련 캐시를 함께 무효화한다. 활성 쿼리만 즉시 다시 조회하며 완료를 기다릴 수 있도록 Promise를 반환한다.
 */

const invalidateAll = (queryClient, keys) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

/** 찜 추가·해제. 목록과 피드의 관심 가게 필터를 갱신하며 개별 하트는 응답으로 채운다. */
export const invalidateFavoriteData = (queryClient) =>
    invalidateAll(queryClient, [favoriteKeys.my(), ['feed', 'posts']]);

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
    invalidateAll(queryClient, [storeKeys.all(), favoriteKeys.all(), adKeys.all(), ['feed'], ['store-news'], benefitKeys.all()]);

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
    invalidateAll(queryClient, [adminKeys.all(), ['feed'], ['store-news'], benefitKeys.all()]);
