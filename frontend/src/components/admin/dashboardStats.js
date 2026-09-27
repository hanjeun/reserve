import api from '../../api/axios';
import { API_ENDPOINTS, RESERVATION_STATUS_ORDER, RESERVATION_STATUS_LABELS } from '../../constants';

const SOURCE_LABELS = {
    business: '사업자 신청',
    reservations: '예약 집계',
    trash: '휴지통',
    audit: '감사 로그',
};

/** 네 개의 독립 API를 합치되 일부 실패를 정상 0건으로 숨기지 않는다. */
export const fetchDashboardStats = async () => {
    const [bizAll, reservationSummary, trash, auditLogs] = await Promise.allSettled([
        api.get(API_ENDPOINTS.BUSINESS.ADMIN_LIST, { params: { page: 0, size: 1 } }),
        api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATION_SUMMARY),
        api.get(API_ENDPOINTS.TRASH.LIST, { params: { page: 0, size: 50 } }),
        api.get(API_ENDPOINTS.AUDIT_LOG.LIST, { params: { page: 0, size: 50 } }),
    ]);

    const trashList = trash.status === 'fulfilled' ? (trash.value?.content ?? []) : [];
    const logList = auditLogs.status === 'fulfilled' ? (auditLogs.value?.content ?? []) : [];
    const statusCount = reservationSummary.status === 'fulfilled'
        ? (reservationSummary.value?.statusCounts ?? {})
        : {};
    const sources = {
        business: bizAll.status === 'fulfilled',
        reservations: reservationSummary.status === 'fulfilled',
        trash: trash.status === 'fulfilled',
        audit: auditLogs.status === 'fulfilled',
    };
    const failedSources = Object.entries(sources)
        .filter(([, available]) => !available)
        .map(([name]) => SOURCE_LABELS[name]);

    // 네 요청이 모두 실패했는데 빈 대시보드로 정상 반환하면 운영자가 "0건"으로 오해한다.
    if (failedSources.length === Object.keys(sources).length) {
        throw new Error('Every dashboard source failed');
    }

    // 상태 목록·순서·라벨은 constants/status.js 한 곳에서만 온다.
    const reservationPieData = RESERVATION_STATUS_ORDER
        .map((key) => ({ key, name: RESERVATION_STATUS_LABELS[key], value: statusCount[key] || 0 }))
        .filter((item) => item.value > 0);

    const entityCount = trashList.reduce((acc, item) => {
        const label = {
            MAIL: '수신메일', SENT_MAIL: '발송메일',
            MEMBER: '회원', STORE: '가게',
            RESERVATION: '예약', REVIEW: '리뷰',
        }[item.entityType] || item.entityType;
        acc[label] = (acc[label] || 0) + 1;
        return acc;
    }, {});
    const trashBarData = Object.entries(entityCount).map(([name, count]) => ({ name, count }));

    const actionCount = logList.reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
    }, {});

    // Spring Boot 3.5 Page는 totalElements가 page 아래다. 구 응답은 하위 호환으로만 읽는다.
    return {
        totalBiz: bizAll.status === 'fulfilled'
            ? (bizAll.value?.page?.totalElements ?? bizAll.value?.totalElements ?? 0)
            : '-',
        totalRes: reservationSummary.status === 'fulfilled'
            ? (reservationSummary.value?.total ?? 0)
            : '-',
        trashCount: trash.status === 'fulfilled'
            ? (trash.value?.page?.totalElements ?? trash.value?.totalElements ?? trashList.length)
            : '-',
        logCount: auditLogs.status === 'fulfilled'
            ? (auditLogs.value?.page?.totalElements ?? auditLogs.value?.totalElements ?? 0)
            : '-',
        reservationPieData,
        trashBarData,
        actionCount,
        sources,
        failedSources,
    };
};
