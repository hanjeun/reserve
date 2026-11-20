import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createPreviewTransport } from '../../../marketing/service-preview/transport';
import { serviceEntryStatus } from './serviceAdmissionStatus';
import { isPreviewMessage, loadPreviewFont } from '../../../marketing/service-preview/playback';
import { PREVIEW_STORE_PUBLIC_ID, resolvePreviewLocation } from '../../../marketing/service-preview/navigation';
import { SECTIONS } from '../../../marketing/src/home/Home.constants';

const NOVEMBER_NOW = Date.parse('2026-11-09T00:00:00Z');
const busyDate = '2026-11-10';
const previewTransport = () => createPreviewTransport({ now: () => NOVEMBER_NOW });
const read = async (adapter, path, params) => (await adapter({ url: '/api/reservations/' + path, method: 'GET', params })).data.data;
const sampleBooking = async (adapter, fields) => {
    const notice = await read(adapter, 'notices/81');
    return {
        storeId: 81, reservationDate: busyDate, reservationTime: '15:00:00', guestCount: 2,
        legalConsent: { version: notice.version, noticeHash: notice.hash, conditionsAccepted: true, privacyAccepted: true },
        ...fields,
    };
};
const submit = (adapter, data) => adapter({ url: '/api/reservations', method: 'POST', data });

it('소개에 표시하는 세 장면은 서로 다른 앱 경로를 열어요', () => {
    expect(SECTIONS.map(({ demo }) => [demo, resolvePreviewLocation(demo)])).toEqual([
        ['explore', { pathname: '/stores', search: '', hash: '' }],
        ['qr', { pathname: '/my-reservations', search: '?tab=reservation', hash: '' }],
        ['business', { pathname: '/business', search: '?tab=analytics', hash: '' }],
    ]);
    expect(resolvePreviewLocation('unknown').pathname).toBe('/stores');
    expect(resolvePreviewLocation('business', '?tab=analytics&statisticsRange=7d')?.search)
        .toBe('?tab=analytics&statisticsRange=7d');
    expect(resolvePreviewLocation('business', '/admin')).toBeNull();
});

it('사업자 장면은 소유 가게의 예시 통계를 기간별로 읽어요', async () => {
    const options = { scene: 'business', now: () => NOVEMBER_NOW };
    const { adapter, member } = createPreviewTransport(options);
    const stats = (storeId, range) => adapter({ method: 'GET', url: `/api/stores/${storeId}/statistics`, params: { range } });
    expect(member.role).toBe('BUSINESS');
    const { data: { data: stores } } = await adapter({ method: 'GET', url: '/api/stores/my' });
    expect(stores.map(store => store.ownerId)).toEqual([member.id, member.id]);
    const { data: { data: recent } } = await stats(81, '7d');
    const { data: { data: longer } } = await stats(81, '30d');
    expect(recent.reservationTrend).toHaveLength(7);
    expect(longer.reservationTrend).toHaveLength(30);
    expect(recent.reservationTrend.at(-1).date).toBe('2026-11-09');
    expect(longer.totalDepositRevenue).toBeGreaterThan(recent.totalDepositRevenue);
    await expect(stats(99, '7d')).rejects.toMatchObject({ response: { status: 403 } });
    await expect(adapter({ method: 'DELETE', url: '/api/stores/81' })).rejects.toMatchObject({ response: { status: 403 } });
    await expect(previewTransport().adapter({ method: 'GET', url: '/api/stores/81/statistics' }))
        .rejects.toMatchObject({ response: { status: 403 } });
});

it('같은 내 예약 화면에서 예약·웨이팅 탭과 각 탭의 필터를 유지해요', () => {
    expect(resolvePreviewLocation('reservations').search).toBe('?tab=reservation');
    expect(resolvePreviewLocation('waiting').search).toBe('?tab=waiting');
    const waiting = resolvePreviewLocation('reservations', '?tab=waiting&waitingStatus=CALLED');
    expect(waiting).toMatchObject({ pathname: '/my-reservations', search: '?tab=waiting&waitingStatus=CALLED' });
    expect(resolvePreviewLocation('waiting', { ...waiting, search: '?tab=reservation&sort=oldest' })?.search)
        .toBe('?tab=reservation&sort=oldest');
});

it('시연의 같은 페이지 조작을 열어도 계정 화면과 외부 주소로 이동하지 않아요', () => {
    expect(resolvePreviewLocation('booking', '/store/00000000-0000-4000-8000-000000000081?edit=701#booking')).toEqual({ pathname: '/store/00000000-0000-4000-8000-000000000081', search: '?edit=701', hash: '#booking' });
    expect(resolvePreviewLocation('booking', '/')).toBeNull();
    expect(resolvePreviewLocation('reservations', '/mypage')).toBeNull();
    expect(resolvePreviewLocation('reservations', 'https://app.reserve.it.kr/my-reservations?tab=waiting')).toBeNull();
});

it('시연은 공개 UUID로 가게를 읽고 예약 변경에 내부 번호를 계속 사용해요', async () => {
    const { adapter } = createPreviewTransport();
    const publicId = PREVIEW_STORE_PUBLIC_ID;
    const read = await adapter({ method: 'GET', url: '/api/v1/stores/' + publicId });
    expect(read.data.data).toMatchObject({ id: 81, publicId });
    const edit = await adapter({ method: 'GET', url: '/api/v1/reservations/701/edit-store', params: { storePublicId: publicId } });
    expect(edit.data.data).toMatchObject({ id: 81, publicId });
    await expect(adapter({ method: 'GET', url: '/api/v1/reservations/701/edit-store',
        params: { storePublicId: '00000000-0000-4000-8000-000000000082' } })).rejects.toMatchObject({ response: { status: 404 } });
});

it('장면 메시지는 상위 창·출처·허용된 데이터 형식을 모두 확인해요', () => {
    const parent = {}, origin = 'https://reserve.example';
    const event = { source: parent, origin, data: { type: 'reserve:service-preview:progress', progress: 0.5 } };
    expect(isPreviewMessage(event, parent, origin)).toBe(true);
    expect(isPreviewMessage({ ...event, source: {} }, parent, origin)).toBe(false);
    expect(isPreviewMessage({ ...event, origin: 'https://other.example' }, parent, origin)).toBe(false);
    for (const progress of [NaN, Infinity, -1, 2, '0.5', null]) expect(isPreviewMessage({ ...event, data: { ...event.data, progress } }, parent, origin)).toBe(false);
    expect(isPreviewMessage({ ...event, data: { type: 'reserve:service-preview:execute', url: '/api/payment/prepare' } }, parent, origin)).toBe(false);
});

it('호출 연출은 사용자가 취소한 웨이팅을 되살리지 않아요', async () => {
    const transport = createPreviewTransport();
    await transport.adapter({ url: '/api/waiting/entries/801/cancel', method: 'POST' });
    expect(transport.setPlaybackPhase(1)).toBe(false);
    expect((await transport.adapter({ url: '/api/waiting/my', method: 'GET' })).data.data.content[0])
        .toMatchObject({ storeImageUrl: '/marketing-images/pilates.jpg', entry: { status: 'CANCELLED' } });
});

it('예시 입장 상태는 실제 앱의 검증기를 통과해요', async () => {
    const { data } = await createPreviewTransport().adapter({ url: '/api/service-admission', method: 'GET' });
    expect(serviceEntryStatus(data.data)).toMatchObject({ mode: 'OFF', state: 'BYPASS' });
});

it.each(['/api/payment/prepare', '/api/auth/login', '/api/email/send', '/api/member/profile', 'https://app.reserve.it.kr/api/reservations'])(
'소개 시연은 계정·메일·결제와 외부 주소의 쓰기를 거부해요: %s', async url => {
    await expect(createPreviewTransport().adapter({ url, method: 'POST', data: '{}' })).rejects.toMatchObject({ response: { status: 403 } });
});

it('예약 예시는 같은 요청 번호를 재사용하고 실제 결제 금액을 만들지 않아요', async () => {
    const { adapter } = previewTransport();
    const data = await sampleBooking(adapter, { requestId: 'sample-request', depositAmount: 100000 });
    const config = { url: '/api/v1/reservations', method: 'POST', data: JSON.stringify(data) };
    const first = await adapter(config), second = await adapter(config);
    expect(first.data.data.depositAmount).toBe(0);
    expect(second.data.data.id).toBe(first.data.data.id);
});

it('다른 기기의 미리보기는 취소 상태를 공유하지 않아요', async () => {
    const first = createPreviewTransport(), second = createPreviewTransport();
    await first.adapter({ url: '/api/reservations/701/cancel', method: 'PATCH' });
    const list = { url: '/api/reservations/my/page', method: 'GET' };
    expect((await first.adapter(list)).data.data.content[0].status).toBe('CANCELLED');
    expect((await second.adapter(list)).data.data.content[0].status).toBe('CONFIRMED');
});

it('예약 재시도는 실제 화면이 사용하는 미제출·생성·종료 응답을 구분해요', async () => {
    const { adapter } = previewTransport();
    const data = await sampleBooking(adapter, { requestId: 'retry-example' });
    const recover = () => adapter({ url: '/api/reservations/requests/result', method: 'POST', data });
    expect((await recover()).data.data).toEqual({ outcome: 'NOT_SUBMITTED', reservation: null });
    const created = await adapter({ url: '/api/reservations', method: 'POST', data });
    expect((await recover()).data.data).toMatchObject({ outcome: 'RESERVED', reservation: { id: created.data.data.id } });
    await adapter({ url: `/api/reservations/${created.data.data.id}/cancel`, method: 'PATCH' });
    expect((await recover()).data.data).toEqual({ outcome: 'CLOSED', reservation: null });
});

it('가게의 마지막 자리가 채워지면 달력이 마감되고 취소 뒤 다시 열려요', async () => {
    const { adapter } = previewTransport();
    const params = { storeId: 81, date: busyDate };
    const day = async () => (await read(adapter, 'calendar', { storeId: 81, month: '2026-11' })).find(item => item.date === busyDate);
    const slots = await read(adapter, 'availability', params);
    expect(slots.filter(slot => slot.available)).toEqual([{ time: '15:00', available: true, remainingCapacity: 2 }]);
    expect(await day()).toMatchObject({ status: 'OPEN', totalSlots: 4, openSlots: 1 });
    await expect(submit(adapter, await sampleBooking(adapter, { guestCount: 3 })))
        .rejects.toMatchObject({ response: { status: 409, data: { message: expect.stringContaining('2명'),
            data: { code: 'RESERVATION_CAPACITY' } } } });

    const { data: { data: booking } } = await submit(adapter, await sampleBooking(adapter));
    expect(await day()).toMatchObject({ status: 'FULL', openSlots: 0 });
    expect((await read(adapter, 'availability', params)).every(slot => !slot.available && slot.remainingCapacity === 0)).toBe(true);
    const editSlots = await read(adapter, booking.id + '/availability', params);
    expect(editSlots.find(slot => slot.time === '15:00')).toMatchObject({ available: true, remainingCapacity: 2 });
    await expect(adapter({ url: '/api/reservations/' + booking.id, method: 'PATCH', data: { guestCount: 0 } }))
        .rejects.toMatchObject({ response: { status: 400 } });
    await adapter({ url: '/api/reservations/' + booking.id + '/cancel', method: 'PATCH' });
    expect(await day()).toMatchObject({ status: 'OPEN', openSlots: 1 });
});

it('시연 달력과 예약 쓰기가 휴무·예약 범위·운영 시간·인원·동의를 함께 적용해요', async () => {
    const { adapter } = previewTransport();
    const month = await read(adapter, 'calendar', { storeId: 81, month: '2026-11' });
    const next = await read(adapter, 'calendar', { storeId: 81, month: '2026-12' });
    expect(month.find(day => day.date === '2026-11-08').status).toBe('PAST');
    expect(month.find(day => day.date === '2026-11-09').status).toBe('CLOSED');
    expect(next.find(day => day.date === '2026-12-10').status).toBe('TOO_FAR');

    const valid = await sampleBooking(adapter);
    for (const fields of [
        { reservationDate: '2026-11-31' }, { reservationDate: '2026-11-09' }, { reservationDate: '2026-12-10' },
        { reservationTime: '12:00:00' }, { reservationTime: '16:00:00' }, { guestCount: 1.5 },
        { guestCount: 21 }, { specialRequest: '가'.repeat(201) }, { legalConsent: null },
    ]) {
        await expect(submit(adapter, { ...valid, ...fields })).rejects.toMatchObject({ response: { status: 400 } });
    }
    await expect(submit(adapter, { ...valid, legalConsent: { ...valid.legalConsent, noticeHash: 'stale' } }))
        .rejects.toMatchObject({ response: { status: 409, data: { data: { code: 'RESERVATION_NOTICE_CHANGED' } } } });
    await expect(submit(adapter, { ...valid, reservationDate: '2026-11-12', reservationTime: '10:00:00' }))
        .rejects.toMatchObject({ response: { status: 409, data: { message: expect.stringContaining('중복 예약'),
            data: { code: 'RESERVATION_DUPLICATE' } } } });
    expect((await read(adapter, 'my/page')).content).toHaveLength(1);
});

it('예약 마감 시각은 한국 시각을 기준으로 적용해요', async () => {
    let now = Date.parse('2026-11-11T01:00:00Z');
    const { adapter } = createPreviewTransport({ now: () => now });
    const date = '2026-11-11';
    const available = async () => (await read(adapter, 'availability', { storeId: 81, date })).map(slot => slot.time);
    expect(await available()).toEqual(['11:00', '14:00', '15:00']);
    now += 1;
    expect(await available()).toEqual(['14:00', '15:00']);
    await expect(submit(adapter, await sampleBooking(adapter, { reservationDate: date, reservationTime: '11:00:00' })))
        .rejects.toMatchObject({ response: { status: 400 } });
});

it('저장소를 격리하지 못하면 앱 코드를 불러오지 않아요', () => {
    const appended = vi.fn(), postMessage = vi.fn(), status = {};
    const scope = { origin: 'null', parent: { postMessage }, URL, document: {
        baseURI: 'https://reserve.example/service-preview/index.html', getElementById: () => status, head: { append: appended },
    } };
    Object.defineProperty(scope, 'localStorage', { value: {}, configurable: false });
    runInNewContext(readFileSync(resolve('../marketing/service-preview/bootstrap.js'), 'utf8'), scope);
    expect(scope.__RESERVE_PREVIEW_ISOLATED__).toBe(false);
    expect(appended).not.toHaveBeenCalled();
    expect(status.textContent).toContain('미리보기를 열 수 없어요');
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'reserve:service-preview:unavailable' }, 'https://reserve.example');
});

it.each(['load', 'error'])('지연된 글꼴 스타일의 %s 이후에도 시연을 이어가요', async outcome => {
    const preview = document.implementation.createHTMLDocument();
    const settings = preview.createElement('script');
    settings.dataset.previewFont = '/service-preview/assets/pretendard-test.css';
    preview.head.append(settings);
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(preview, 'fonts', { value: { load } });

    expect(preview.querySelector('link')).toBeNull();
    const fontReady = loadPreviewFont(preview);
    const sheet = preview.querySelector('link[rel="stylesheet"]');
    expect(sheet?.getAttribute('href')).toBe(settings.dataset.previewFont);
    expect(load).not.toHaveBeenCalled();
    sheet.dispatchEvent(new Event(outcome));
    await fontReady;
    if (outcome === 'load') expect(load).toHaveBeenCalledExactlyOnceWith('14px "Pretendard Variable"', '예약');
    else expect(load).not.toHaveBeenCalled();
});
