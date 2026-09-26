import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
    adKeys, adminKeys, favoriteKeys, reservationKeys, reviewKeys, storeKeys,
} from '../queryKeys';
import {
    invalidateAdData,
    invalidateAdminData,
    invalidateFavoriteData,
    invalidateReservationData,
    invalidateReviewData,
    invalidateStoreData,
} from '../invalidateAfterWrite';

// 화면에 떠 있을 수 있는 캐시를 대표 키로 하나씩 채워 두고,
// 쓰기 한 건 뒤에 어떤 캐시가 stale 로 표시되는지만 본다(실제 재조회는 관심사가 아니다).
const SEEDED = {
    storeList:        storeKeys.list({ page: 0 }),
    storeDetail:      storeKeys.detail(7),
    storeMy:          storeKeys.my(),
    storeStatistics:  storeKeys.statistics(7, '30d'),
    reservationMy:    reservationKeys.my(),
    reservationManage: reservationKeys.managePage({ page: 0 }),
    reservationCalendar: reservationKeys.calendar(7, '2026-09'),
    reviewByStore:    reviewKeys.byStore(7),
    favoriteMy:       favoriteKeys.my(),
    favoriteStatus:   favoriteKeys.status(7),
    adMy:             adKeys.my(),
    adAdmin:          [...adKeys.admin(), 0, ''],
    adActive:         adKeys.active('BANNER'),
    adminMembers:     [...adminKeys.members(), 0, ''],
    adminTrash:       [...adminKeys.trash(), 'ALL'],
    adminDashboard:   adminKeys.dashboardStats(),
};

let queryClient;

const invalidatedNames = () => Object.entries(SEEDED)
    .filter(([, key]) => queryClient.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort();

beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    Object.values(SEEDED).forEach((key) => queryClient.setQueryData(key, { seeded: true }));
});

describe('쓰기 후 캐시 무효화 규칙', () => {
    it('찜 토글은 내 즐겨찾기 목록만 무효화한다 — 하트는 호출부가 응답으로 직접 채운다', async () => {
        await invalidateFavoriteData(queryClient);
        expect(invalidatedNames()).toEqual(['favoriteMy']);
    });

    it('리뷰 쓰기는 가게 별점·즐겨찾기 카드·내 예약의 리뷰 버튼을 무효화한다', async () => {
        await invalidateReviewData(queryClient);
        expect(invalidatedNames()).toEqual([
            'favoriteMy', 'reservationMy',
            'storeDetail', 'storeList', 'storeMy', 'storeStatistics',
        ]);
    });

    it('예약 상태 변경은 모든 예약 목록·달력과 사업자 통계를 무효화한다', async () => {
        await invalidateReservationData(queryClient);
        expect(invalidatedNames()).toEqual([
            'reservationCalendar', 'reservationManage', 'reservationMy', 'storeStatistics',
        ]);
    });

    it('가게 등록·수정·영업 종료는 가게·즐겨찾기·광고 캐시를 무효화한다', async () => {
        await invalidateStoreData(queryClient);
        expect(invalidatedNames()).toEqual([
            'adActive', 'adAdmin', 'adMy', 'favoriteMy', 'favoriteStatus',
            'storeDetail', 'storeList', 'storeMy', 'storeStatistics',
        ]);
    });

    it('광고 변경은 모든 광고 목록과 통계의 광고 요약을 무효화한다', async () => {
        await invalidateAdData(queryClient);
        expect(invalidatedNames()).toEqual(['adActive', 'adAdmin', 'adMy', 'storeStatistics']);
    });

    it('관리자 조치는 관리자 캐시 전체를 무효화하고 공개 캐시는 건드리지 않는다', async () => {
        await invalidateAdminData(queryClient);
        expect(invalidatedNames()).toEqual(['adminDashboard', 'adminMembers', 'adminTrash']);
    });
});
