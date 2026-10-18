// Example data only; messages follow the current check-in services and API error mapping.
const reservation = {
    id: 1, reservationCode: 'R-PREVIEW-0001', storeId: 1, storeName: '예시 가게',
    memberName: '예시 고객', guestCount: 2, reservationDate: '2026-10-08',
    reservationTime: '18:30:00', checkedInAt: '2026-10-08T18:25:00', status: 'CONFIRMED',
};
const entry = { id: 1, storeId: 1, entryNumber: 7, displayName: '예시 고객', partySize: 2,
    businessDate: '2026-10-08', status: 'SEATED', calledAt: '2026-10-08T09:20:00Z', finishedAt: '2026-10-08T09:25:00Z' };
const error = (message, status = 400) => ({ message, status });
const waitingInvalid = '웨이팅 QR이 올바르지 않거나 유효 시간이 지났어요. 새 QR을 확인해주세요.';

export const QR_PREVIEW_CASES = [
    { key: 'idle', label: '스캔 전', idle: true },
    { key: 'starting', label: '카메라 준비 중', starting: true },
    { key: 'scanning', label: '고정 가이드 · 스캔 대기', noScan: true },
    { key: 'tracking', label: '위치 추적 가이드 · 예시 좌표', noScan: true, tracking: true },
    { key: 'checking', label: '체크인 확인 중', pending: true },
    { key: 'reservation-success', label: '예약 체크인 완료', response: { reservation, alreadyCheckedIn: false } },
    { key: 'reservation-duplicate', label: '이미 체크인한 예약', response: { reservation, alreadyCheckedIn: true } },
    { key: 'reservation-unconfirmed', label: '승인 후 미확인 예약의 체크인', response: { reservation: { ...reservation, status: 'UNCONFIRMED' }, alreadyCheckedIn: false } },
    { key: 'reservation-expired', label: '예약 QR 만료', error: error('만료된 QR 코드예요. 예약 상세에서 QR을 다시 열어주세요.') },
    { key: 'reservation-invalid', label: '잘못된 예약 QR', error: error('유효하지 않은 QR 코드예요.') },
    { key: 'reservation-missing', label: '예약 없음', error: error('예약을 찾을 수 없어요.', 404) },
    { key: 'reservation-wrong-store', label: '다른 가게 예약', error: error('가게 소유자만 접근할 수 있어요.', 403) },
    { key: 'reservation-wrong-date', label: '방문일 아님', error: error('방문 당일에만 QR 체크인을 할 수 있어요. (예약일: 2026-10-09)') },
    ...['PENDING', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].map(status => ({
        key: `reservation-${status.toLowerCase()}`, label: `체크인 불가 · ${status}`,
        error: error(`승인된 예약만 QR 체크인을 할 수 있어요. (현재 상태: ${status})`),
    })),
    { key: 'waiting-success', label: '웨이팅 입장 완료', kind: 'waiting', response: { entry, alreadyCheckedIn: false } },
    { key: 'waiting-duplicate', label: '이미 입장한 웨이팅', kind: 'waiting', response: { entry, alreadyCheckedIn: true } },
    { key: 'waiting-invalid-expired', label: '웨이팅 QR 오류·유효 시간 종료', kind: 'waiting', error: error(waitingInvalid) },
    { key: 'waiting-not-called', label: '아직 호출되지 않은 웨이팅', kind: 'waiting', error: error('호출된 접수만 입장할 수 있어요.', 409) },
    { key: 'waiting-cancelled', label: '취소된 웨이팅', kind: 'waiting', error: error('호출된 접수만 입장할 수 있어요.', 409) },
    { key: 'waiting-cancelled-after-call', label: '호출 후 취소된 웨이팅', kind: 'waiting', error: error('호출된 접수만 입장할 수 있어요.', 409) },
    { key: 'waiting-onsite-code', label: '입장 대신 현장 접수 QR 사용', token: 'rw1.j.PREVIEW-ONLY', error: error('현장 접수용 QR이에요. 호출 후 받은 입장 QR을 비춰주세요.') },
    { key: 'waiting-mismatch', label: 'QR과 접수 불일치', kind: 'waiting', error: error('입장 QR과 접수가 일치하지 않아요.') },
    { key: 'waiting-missing', label: '웨이팅 접수 없음', kind: 'waiting', error: error('접수를 찾을 수 없어요.') },
    { key: 'waiting-store-inactive', label: '운영 중이 아닌 웨이팅 가게', kind: 'waiting', error: error('현재 입장을 처리할 수 없는 가게예요.', 409) },
    { key: 'waiting-wrong-store', label: '다른 가게 웨이팅', kind: 'waiting', error: error('내 가게의 대기 접수만 처리할 수 있어요.', 403) },
    { key: 'waiting-no-permission', label: '웨이팅 운영 권한 없음', kind: 'waiting', error: error('가게 운영 권한이 필요해요.', 403) },
    { key: 'waiting-store-missing', label: '웨이팅 가게 없음', kind: 'waiting', error: error('가게를 찾을 수 없어요.', 404) },
    { key: 'rate-limited', label: '요청 횟수 제한', error: error('요청이 너무 많아요. 잠시 후 다시 시도해주세요.', 429) },
    { key: 'server-error', label: '서버 오류', error: error('잠시 후 다시 시도해주세요.', 500) },
    { key: 'server-unavailable', label: '서버 일시 중단', error: error('현재 서비스를 이용할 수 없어요. 잠시 후 다시 시도해주세요.', 503) },
    { key: 'timeout', label: '응답 지연', error: error('응답이 너무 늦어요. 잠시 후 다시 시도해주세요.', 0) },
    { key: 'network-offline', label: '인터넷 연결 끊김', error: error('인터넷 연결이 끊겼어요.', 0) },
    { key: 'network-unreachable', label: '서버 연결 실패', error: error('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.', 0) },
    { key: 'camera-denied', label: '카메라 권한 거부', cameraError: 'NotAllowedError' },
    { key: 'camera-in-use', label: '다른 앱이 카메라 사용 중', cameraError: 'NotReadableError' },
    { key: 'camera-missing', label: '카메라 없음', cameraError: 'NotFoundError' },
    { key: 'camera-constraints', label: '카메라 조건 불일치', cameraError: 'OverconstrainedError' },
    { key: 'camera-error', label: '기타 카메라 오류', cameraError: 'UnknownError' },
];
