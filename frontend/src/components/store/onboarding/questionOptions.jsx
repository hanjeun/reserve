import { AppstoreOutlined, CalendarOutlined, ClockCircleOutlined, GlobalOutlined, MobileOutlined, QrcodeOutlined, ScheduleOutlined, StopOutlined } from '@ant-design/icons';
export const SERVICE_OPTIONS = [
    { value: 'reservation', label: '예약', asset: 'intake-reservation', icon: <CalendarOutlined />, description: '날짜나 시간을 미리 선택해 방문해요.' },
    { value: 'waiting', label: '웨이팅', asset: 'intake-waiting', icon: <ClockCircleOutlined />, description: '대기 명단에 접수하고 순서대로 입장해요.' },
    { value: 'both', label: '예약 · 웨이팅', asset: 'intake-both', icon: <AppstoreOutlined />, description: '두 방식으로 손님을 받아요.' },
];
export const PAUSED_SERVICE = { value: 'paused', label: '접수 중지', asset: 'intake-paused', icon: <StopOutlined />, description: '새 예약과 웨이팅 접수를 꺼요. 기존 설정은 유지해요.' };
export const BOOKING_OPTIONS = [
    { value: 'SLOT', label: '시간대', asset: 'booking-slot', icon: <ClockCircleOutlined />, description: '예: 오전 10시 미용실 예약. 영업시간을 일정한 간격으로 나눠요.' },
    { value: 'SESSION', label: '회차제', asset: 'booking-session', icon: <ScheduleOutlined />, description: '예: 11시·14시 클래스. 정해둔 회차만 선택해요.' },
    { value: 'DAY', label: '날짜만', asset: 'booking-day', icon: <CalendarOutlined />, description: '예: 종일권·팝업 방문. 날짜만 선택하고 시간은 고르지 않아요.' },
];
export const WAITING_OPTIONS = [
    { value: 'ONSITE', label: '현장 QR', asset: 'waiting-onsite', icon: <QrcodeOutlined />, description: '가게에 온 손님이 현장 QR을 스캔해 접수해요.' },
    { value: 'REMOTE', label: '원격', asset: 'waiting-remote', icon: <MobileOutlined />, description: '손님이 가게 상세에서 미리 접수해요.' },
    { value: 'BOTH', label: '현장 QR · 원격', asset: 'waiting-both', icon: <GlobalOutlined />, description: '현장과 원격 접수를 같은 대기 명단으로 받아요.' },
];
export const WAITING_OFF = { value: 'OFF', label: '사용 안 함', asset: 'waiting-off', icon: <StopOutlined />, description: '웨이팅 접수를 받지 않아요.' };
