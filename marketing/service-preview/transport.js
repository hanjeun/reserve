import { PREVIEW_STORE_PUBLIC_ID } from './navigation';
import { RESERVATION_CONFLICT } from '../../frontend/src/utils/reservationConflicts';
import { describePreviewBookingDay, isPreviewBookingActive, previewBookingDate, previewBookingProblem, previewCalendar,
    previewSlotGrid, previewSlotTime } from './booking';
const pageOf = (all, params) => {
    const number = Math.max(0, Math.min(Number(params.get('page')) || 0, 10000));
    const size = Math.max(1, Math.min(Number(params.get('size')) || 20, 100));
    return { content: all.slice(number * size, (number + 1) * size), page: { number, size, totalElements: all.length, totalPages: Math.ceil(all.length / size) } };
};

const statisticsDays = { '7d': 7, '30d': 30, '90d': 90 };
const dailyReservations = [3, 5, 4, 7, 6, 9, 8];

function previewStatistics(store, range, now) {
    const days = Object.hasOwn(statisticsDays, range) ? statisticsDays[range] : statisticsDays['30d'];
    const reservationTrend = Array.from({ length: days }, (_, index) => ({
        date: previewBookingDate(now, index + 1 - days),
        value: dailyReservations[index % dailyReservations.length] + (store.id === 82 ? 2 : 0),
    }));
    const revenueTrend = reservationTrend.map(day => ({ ...day, value: day.value * 5000 }));
    const total = reservationTrend.reduce((sum, day) => sum + day.value, 0);
    const completed = Math.floor(total * 0.8);
    return {
        averageRating: store.rating, reviewCount: store.id === 81 ? 28 : 19,
        totalDepositRevenue: revenueTrend.reduce((sum, day) => sum + day.value, 0),
        statusBreakdown: { COMPLETED: completed, CONFIRMED: total - completed },
        reservationTrend, revenueTrend,
    };
}

export function createPreviewTransport({ scene, now = Date.now } = {}) {
    const startedAt = now();
    const firstOpenDay = (store, offset) => [offset, offset + 1].map(days => previewBookingDate(startedAt, days))
        .find(date => describePreviewBookingDay(store, date, [], startedAt).status === 'OPEN');
    const business = scene === 'business';
    const member = { id: business ? 8 : 41, name: business ? '미리보기 사업자' : '미리보기 회원',
        email: 'preview@example.test', role: business ? 'BUSINESS' : 'USER', termsAgreed: true, emailNotificationEnabled: true, marketingAgreed: false };
    const store = { id: 81, publicId: PREVIEW_STORE_PUBLIC_ID, name: '모던 필라테스 스튜디오', category: '필라테스', serviceDomain: 'SPORTS', ownerId: 8, status: 'ACTIVE',
        description: '몸을 움직이는 시간을 함께해요.', address: '서울 종로구 예시길 12', phone: '02-0000-0000',
        mainImageUrl: '/marketing-images/pilates.jpg', mainImageWidth: 400, mainImageHeight: 267,
        detailImageUrls: ['/marketing-images/pilates.jpg'], bookingType: 'SLOT', reservationEnabled: true, waitingEnabled: true,
        waitingIntakeMode: 'BOTH', waitingTeams: 2, reservationSlotMinutes: 60, openTime: '10:00', closeTime: '16:00',
        breakStartTime: '12:00', breakEndTime: '14:00',
        rating: 4.8, reviewCount: 0, noShowDeposit: 0, maxCapacityPerSlot: 6, bookingDeadlineHours: 1, maxAdvanceBookingDays: 30,
        closedDays: [1], allowDuplicateReservation: false, autoApprovalEnabled: true };
    const stores = [store, { ...store, id: 82, publicId: '00000000-0000-4000-8000-000000000082', name: '청담 헤어살롱', category: '헤어', serviceDomain: 'BEAUTY_CLINIC', address: '서울 강남구 예시길 24', mainImageUrl: '/marketing-images/hair.jpg', detailImageUrls: ['/marketing-images/hair.jpg'] }];
    const ownedStores = business ? stores.filter(item => item.ownerId === member.id) : [];
    const busyDate = firstOpenDay(store, 1);
    // 한 날짜의 마지막 두 자리를 채워 마감과 취소 후 복원을 시연할 수 있게 한다.
    const backgroundBookings = previewSlotGrid(store).map(time => ({
        id: 'occupied-' + time, storeId: store.id, reservationDate: busyDate, reservationTime: time,
        guestCount: store.maxCapacityPerSlot - (time === '15:00' ? 2 : 0), status: 'CONFIRMED',
    }));
    let reservationId = 700;
    const createBooking = (selected, values, createdAt) => ({
        ...values, id: ++reservationId, reservationCode: `DEMO-${reservationId}`, storeId: selected.id,
        storePublicId: selected.publicId, storeName: selected.name, storeMainImageUrl: selected.mainImageUrl,
        memberId: member.id, memberName: member.name, status: 'CONFIRMED', depositAmount: 0, depositPaid: false,
        canCancel: true, canEdit: true, createdAt: new Date(createdAt).toISOString(),
    });
    const reservations = [createBooking(store, { reservationDate: firstOpenDay(store, 3),
        reservationTime: '14:00:00', guestCount: 2 }, startedAt)];
    const noticeOf = selected => ({
        enabled: true, version: 'preview-v1', hash: String(selected.id).padStart(64, '0'),
        storeId: selected.id, storePublicId: selected.publicId, storeName: selected.name,
    });
    const waiting = [{ storeName: store.name, storePublicId: store.publicId, storeImageUrl: store.mainImageUrl, teamsAhead: 2, entry: { id: 801, storeId: store.id, entryNumber: 12,
        status: 'WAITING', partySize: 2, displayName: member.name, businessDate: previewBookingDate(startedAt), createdAt: new Date(startedAt).toISOString() } }];
    let waitingId = 801;
    const hiddenWaiting = new Set();
    const waitingPolicy = { intakeReady: true, noticePublishedAt: '2026-01-01T00:00:00Z', finishedRecordRetentionDays: 7, customerHistoryDays: 365, storeHistoryDays: 30 };
    const favorites = new Set();
    const reject = (config, status = 403, message = '이 동작은 소개 미리보기에서 제공하지 않아요.', code) => {
        const error = new Error(message); error.config = config;
        error.response = { status, data: { success: false, message, ...(code && { data: { code } }) }, headers: {}, config };
        throw error;
    };
    const adapter = async config => {
        if (config.signal?.aborted) throw Object.assign(new Error('Preview request cancelled'), { name: 'AbortError' });
        const url = new URL(config.url, 'https://preview.invalid');
        if (url.origin !== 'https://preview.invalid') return reject(config);
        const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, '/api');
        const params = new URLSearchParams(url.search);
        Object.entries(config.params || {}).forEach(([key, value]) => { if (value != null) params.set(key, String(value)); });
        const method = (config.method || 'get').toUpperCase();
        const requestTime = now();
        const describeDay = (selected, date, excludeId) =>
            describePreviewBookingDay(selected, date, [...backgroundBookings, ...reservations], requestTime, excludeId);
        const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
        const respond = data => ({ data: { success: true, data: structuredClone(data) }, status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, config });
        if (method === 'GET') {
            if (path === '/api/auth/session') return respond({ member, refreshPossible: false });
            if (path === '/api/member/me') return respond(member);
            if (path === '/api/service-admission') return respond({ campaignId: 'service-entry', mode: 'OFF', state: 'BYPASS', position: 0,
                expiresAt: 0, absoluteExpiresAt: 0, serverTime: Date.now(), heartbeatTimeoutSeconds: 60, pollAfterSeconds: 60 });
            if (path === '/api/stores') {
                const keyword = (params.get('keyword') || '').toLocaleLowerCase();
                const region = params.get('region');
                return respond(pageOf(stores.filter(item => item.name.toLocaleLowerCase().includes(keyword)
                    && (!params.get('domain') || item.serviceDomain === params.get('domain'))
                    && (!region || region === 'all' || item.address.startsWith(region))), params));
            }
            const addressedStore = stores.find(item => path === '/api/stores/' + item.publicId);
            if (addressedStore) return respond(addressedStore);
            if (path === '/api/stores/regions') return respond([{ name: '서울', count: 2, areas: [{ name: '종로구', count: 1 }, { name: '강남구', count: 1 }] }]);
            if (path === '/api/stores/my') return respond(ownedStores);
            const statisticsStore = ownedStores.find(item => path === `/api/stores/${item.id}/statistics`);
            if (statisticsStore) return respond(previewStatistics(statisticsStore, params.get('range'), requestTime));
            if (path === '/api/tourism/region-photos' || path === '/api/tourism/region-photos/catalog') return respond([]);
            if (path.startsWith('/api/favorites/status/')) return respond({ isFavorite: favorites.has(Number(path.split('/').at(-1))) });
            if (path === '/api/reservations/my/page') return respond(pageOf(reservations.filter(item =>
                (!params.get('keyword') || item.storeName.includes(params.get('keyword')) || item.reservationCode.includes(params.get('keyword')))
                && (!params.get('status') || params.get('status') === 'ALL' || item.status === params.get('status'))), params));
            if (/^\/api\/reservations\/\d+\/qr-token$/.test(path)) return respond({ token: 'https://app.reserve.it.kr/stores?demo=1' });
            const schedule = path.match(/^\/api\/reservations\/(?:(\d+)\/)?(calendar|availability)$/);
            if (schedule) {
                const [, editId, kind] = schedule;
                const selected = stores.find(item => item.id === Number(params.get('storeId')));
                const editing = editId && reservations.find(item => item.id === Number(editId) && item.canEdit);
                if (!selected || (editId && editing?.storeId !== selected.id)) return reject(config, 404);
                if (kind === 'calendar') {
                    const month = previewCalendar(params.get('month'), date => describeDay(selected, date, editing?.id));
                    return month ? respond(month) : reject(config, 400);
                }
                const day = describeDay(selected, params.get('date'), editing?.id);
                return day.status === 'INVALID' ? reject(config, 400) : respond(day.slots);
            }
            if (path.startsWith('/api/reservations/notices/')) {
                const selected = stores.find(item => item.id === Number(path.split('/').at(-1)));
                return selected ? respond(noticeOf(selected)) : reject(config, 404);
            }
            if (/^\/api\/reservations\/my\/store\/\d+\/completed$/.test(path)) return respond(null);
            if (/^\/api\/reservations\/\d+\/edit-store$/.test(path)) {
                const entry = reservations.find(item => item.id === Number(path.split('/').at(-2)));
                const editStore = stores.find(item => item.id === entry?.storeId && item.publicId === params.get('storePublicId'));
                return editStore ? respond(editStore) : reject(config, 404);
            }
            if (/^\/api\/reservations\/\d+$/.test(path)) return respond(reservations.find(item => item.id === Number(path.split('/').at(-1))) ?? null);
            if (path === '/api/reservations/admission') return respond(null);
            if (path === '/api/waiting/my') return respond(pageOf(waiting.filter(item =>
                !hiddenWaiting.has(item.entry.id)
                && (!params.get('keyword') || item.storeName.includes(params.get('keyword')))
                && (!params.get('status') || params.get('status') === 'ALL' || item.entry.status === params.get('status'))), params));
            if (/^\/api\/waiting\/entries\/\d+\/qr$/.test(path)) return respond({ token: 'https://app.reserve.it.kr/stores?demo=waiting', expiresAt: new Date(Date.now() + 300000).toISOString() });
            if (path === '/api/waiting/stores') return respond(pageOf(stores, params));
            if (path === '/api/waiting/retention-policy') return respond(waitingPolicy);
            if (path === '/api/store-news/config') return respond({ enabled: false, imageEnabled: false, benefitEventsEnabled: false });
            if (/^\/api\/reviews\/store\/8[12]$/.test(path)) return respond([]);
            if (path === '/api/holidays' || path === '/api/advertisements/active') return respond([]);
            if (path.includes('/unread') || path.includes('/unread-count')) return respond(0);
        }
        // 실제 계정·결제·관리 경로로 넘기는 기본 어댑터는 두지 않는다.
        if (method === 'POST' && /^\/api\/favorites\/toggle\/\d+$/.test(path)) {
            const id = Number(path.split('/').at(-1)); if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
            return respond({ isFavorite: favorites.has(id) });
        }
        if (method === 'POST' && path === '/api/reservations') {
            const selected = stores.find(item => item.id === Number(body.storeId));
            if (!selected) return reject(config, 404);
            const { reservationDate, guestCount, specialRequest, requestId, legalConsent } = body;
            const time = previewSlotTime(body.reservationTime);
            const previous = requestId && reservations.find(item => item.requestId === requestId);
            if (previous) {
                if (previous.storeId === selected.id && previous.reservationDate === reservationDate
                    && previewSlotTime(previous.reservationTime) === time && previous.guestCount === guestCount) return respond(previous);
                return reject(config, 409, '같은 예약 요청으로 다른 날짜·시간·인원을 신청할 수 없어요.');
            }
            const notice = noticeOf(selected);
            if (legalConsent?.conditionsAccepted !== true || legalConsent.privacyAccepted !== true) {
                return reject(config, 400, '예약 조건과 개인정보 제공 안내를 확인하고 동의해주세요.');
            }
            if (legalConsent.version !== notice.version || legalConsent.noticeHash !== notice.hash) {
                return reject(config, 409, '예약 안내가 변경됐어요. 새 내용을 확인한 뒤 다시 신청해주세요.', RESERVATION_CONFLICT.NOTICE_CHANGED);
            }
            const day = describeDay(selected, reservationDate);
            const problem = previewBookingProblem(selected, day, body, reservations);
            if (problem) return reject(config, problem.status, problem.message, problem.code);
            const entry = createBooking(selected, { reservationDate, reservationTime: time + ':00', guestCount, specialRequest, requestId }, requestTime);
            reservations.unshift(entry);
            return respond(entry);
        }
        if (method === 'POST' && path === '/api/reservations/requests/result') {
            const entry = body.requestId && reservations.find(item => item.requestId === body.requestId);
            if (!entry) return respond({ outcome: 'NOT_SUBMITTED', reservation: null });
            const closed = !isPreviewBookingActive(entry);
            return respond({ outcome: closed ? 'CLOSED' : 'RESERVED', reservation: closed ? null : entry });
        }
        if (method === 'PATCH' && /^\/api\/reservations\/\d+\/cancel$/.test(path)) {
            const entry = reservations.find(item => item.id === Number(path.split('/').at(-2)));
            if (!entry) return reject(config, 404);
            if (!entry.canCancel) return reject(config, 409, '종료된 예약은 취소할 수 없어요.');
            entry.status = 'CANCELLED';
            entry.canCancel = false;
            entry.canEdit = false;
            return respond(entry);
        }
        if (method === 'PATCH' && /^\/api\/reservations\/\d+$/.test(path)) {
            const entry = reservations.find(item => item.id === Number(path.split('/').at(-1)));
            if (!entry) return reject(config, 404);
            if (!entry.canEdit) return reject(config, 409, '종료된 예약은 변경할 수 없어요.');
            const selected = stores.find(item => item.id === entry.storeId);
            const values = {
                reservationDate: body.reservationDate ?? entry.reservationDate, reservationTime: body.reservationTime ?? entry.reservationTime,
                guestCount: body.guestCount ?? entry.guestCount, specialRequest: body.specialRequest ?? entry.specialRequest,
            };
            const day = describeDay(selected, values.reservationDate, entry.id);
            const problem = previewBookingProblem(selected, day, values, reservations, entry.id);
            if (problem) return reject(config, problem.status, problem.message, problem.code);
            Object.assign(entry, values, { reservationTime: previewSlotTime(values.reservationTime) + ':00' });
            return respond(entry);
        }
        if (method === 'DELETE' && /^\/api\/reservations\/\d+\/remove$/.test(path)) {
            const index = reservations.findIndex(item => item.id === Number(path.split('/').at(-2)));
            if (index < 0) return reject(config, 404);
            if (isPreviewBookingActive(reservations[index])) return reject(config, 409);
            reservations.splice(index, 1); return respond(null);
        }
        if (method === 'POST' && /^\/api\/waiting\/stores\/8[12]\/entries$/.test(path)) {
            const selectedStore = stores.find(item => item.id === Number(path.split('/').at(-2)));
            if (!body.privacyAgreed || body.privacyNoticePublishedAt !== waitingPolicy.noticePublishedAt
                || !Number.isInteger(body.partySize) || body.partySize < 1 || body.partySize > 100) return reject(config, 400);
            const previous = body.clientRequestId && waiting.find(item => item.entry.clientRequestId === body.clientRequestId);
            if (previous) return respond(previous.entry);
            const entry = { id: ++waitingId, storeId: selectedStore.id, entryNumber: waitingId - 788, status: 'WAITING',
                partySize: body.partySize, clientRequestId: body.clientRequestId, displayName: member.name, businessDate: previewBookingDate(requestTime), createdAt: new Date(requestTime).toISOString() };
            waiting.unshift({ storeName: selectedStore.name, storePublicId: selectedStore.publicId, storeImageUrl: selectedStore.mainImageUrl, teamsAhead: 2, entry });
            return respond(entry);
        }
        if (method === 'DELETE' && /^\/api\/waiting\/my\/\d+$/.test(path)) {
            const entry = waiting.find(item => item.entry.id === Number(path.split('/').at(-1)))?.entry;
            if (!entry) return reject(config, 404);
            if (entry.status !== 'CANCELLED') return reject(config, 409);
            hiddenWaiting.add(entry.id);
            return respond(null);
        }
        if (method === 'POST' && /^\/api\/waiting\/entries\/\d+\/cancel$/.test(path)) {
            const entry = waiting.find(item => item.entry.id === Number(path.split('/').at(-2)))?.entry;
            if (!entry) return reject(config, 404);
            entry.status = 'CANCELLED'; return respond(entry);
        }
        return reject(config);
    };
    const setPlaybackPhase = phase => {
        if (!Number.isFinite(phase) || phase < 0 || phase > 1) return false;
        const entry = waiting.find(item => item.entry.id === 801)?.entry;
        if (!entry || !['WAITING', 'CALLED'].includes(entry.status)) return false;
        const status = phase >= 0.55 ? 'CALLED' : 'WAITING';
        if (entry.status === status) return false;
        entry.status = status; return true;
    };
    return { adapter, member, store, setPlaybackPhase };
}
