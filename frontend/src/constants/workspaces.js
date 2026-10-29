import {
    BarChartOutlined, CalendarOutlined, ClockCircleOutlined, DeleteOutlined, DollarOutlined,
    FileTextOutlined, FlagOutlined, IdcardOutlined, MailOutlined, MessageOutlined,
    NotificationOutlined, PartitionOutlined, QrcodeOutlined, SafetyCertificateOutlined,
    ShopOutlined, TeamOutlined,
} from '../components/common/icons';

// 메뉴, 직접 진입 정규화, 로딩 화면이 같은 항목과 이름을 사용한다.
export const ADMIN_WORKSPACE_GROUPS = [
    { key: 'operations', label: '운영 현황', items: [
        { key: 'dashboard', label: '대시보드', icon: BarChartOutlined },
        { key: 'reservations', label: '전체 예약', icon: CalendarOutlined },
        { key: 'members', label: '회원 관리', icon: TeamOutlined },
        { key: 'stores-admin', label: '가게 관리', icon: ShopOutlined },
    ] },
    { key: 'review', label: '인증·문의·신고', items: [
        { key: 'pending', label: '인증 대기', icon: IdcardOutlined },
        { key: 'all', label: '인증 전체 목록', icon: SafetyCertificateOutlined },
        { key: 'mailbox', label: '메일함', icon: MailOutlined },
        { key: 'reports', label: '채팅 신고', icon: FlagOutlined },
        { key: 'feed-reports', label: '피드·소식 신고', icon: FlagOutlined },
        { key: 'benefit-applications', label: '혜택 신청', icon: NotificationOutlined },
        { key: 'chat-intro', label: '채팅 관리', icon: MessageOutlined },
    ] },
    { key: 'commerce', label: '결제·광고', items: [
        { key: 'payments', label: '결제 운영', icon: DollarOutlined },
        { key: 'ads', label: '광고 관리', icon: NotificationOutlined },
    ] },
    { key: 'system', label: '시스템', items: [
        { key: 'audit-logs', label: '시스템 로그', icon: FileTextOutlined },
        { key: 'trash', label: '휴지통', icon: DeleteOutlined },
    ] },
];

export const BUSINESS_WORKSPACE_GROUPS = [
    { key: 'operations', label: '예약·현장 운영', items: [
        { key: 'reservations', label: '예약 관리', icon: CalendarOutlined },
        { key: 'waiting', label: '웨이팅', icon: ClockCircleOutlined },
        { key: 'qr-checkin', label: 'QR 체크인', icon: QrcodeOutlined },
    ] },
    { key: 'customers', label: '가게 소식·고객 응대', items: [
        { key: 'news', label: '가게 소식', icon: NotificationOutlined },
        { key: 'chat-intro', label: '채팅 관리', icon: MessageOutlined },
    ] },
    { key: 'growth', label: '광고·통계', items: [
        { key: 'ads', label: '광고 관리', icon: NotificationOutlined },
        { key: 'analytics', label: '통계 · 분석', icon: PartitionOutlined },
        { key: 'settlements', label: 'TEST 가상 정산', icon: DollarOutlined },
    ] },
];

const adminKeys = new Set(ADMIN_WORKSPACE_GROUPS.flatMap(group => group.items.map(item => item.key)));
const businessKeys = new Set(BUSINESS_WORKSPACE_GROUPS.flatMap(group => group.items.map(item => item.key)));

export const resolveAdminTab = requested => {
    const key = requested === 'chat' ? 'reports' : requested;
    return adminKeys.has(key) ? key : 'pending';
};
export const resolveBusinessTab = requested => businessKeys.has(requested) ? requested : 'reservations';
