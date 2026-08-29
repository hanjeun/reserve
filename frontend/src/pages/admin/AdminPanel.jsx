import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Typography, Tabs } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    CalendarOutlined, SafetyCertificateOutlined, IdcardOutlined, MailOutlined,
    DeleteOutlined, FileTextOutlined, BarChartOutlined, TeamOutlined, ShopOutlined,
    NotificationOutlined, MessageOutlined,} from '@ant-design/icons';
import { UnreadPill } from '../../components/common';
import MailboxTab from '../../components/admin/MailboxTab';
import ChatTab from '../../components/admin/ChatTab';
import TrashTab from '../../components/admin/TrashTab';
import AuditLogTab from '../../components/admin/AuditLogTab';
import DashboardTab from '../../components/admin/DashboardTab';
import MembersTab from '../../components/admin/MembersTab';
import StoresAdminTab from '../../components/admin/StoresAdminTab';
import ReservationsAllTab from '../../components/admin/ReservationsAllTab';
import AdminAdsTab from '../../components/admin/AdminAdsTab';
import BusinessVerificationTab from '../../components/admin/BusinessVerificationTab';
import { PageContainer } from '../../components/common';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;

// 탭 라벨 공통 스타일
const tabLabel = (icon, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon}{text}
    </span>
);

/** 배지 폴링 주기. 관리자 패널은 켜둔 채로 오래 두는 화면이라 짧게 잡으면 안 된다. */
const CHAT_BADGE_POLL_MS = 60000;

/**
 * 문의 채팅 탭 라벨 — 답을 기다리는 방 개수를 배지로 보여준다.
 *
 * ★ 2026-08-24 2차: 백엔드에 {@code /api/admin/chat/waiting-count} 가 있고 queryKey 도
 *   있는데 **부르는 곳이 한 군데도 없었다.** 그래서 손님이 문의를 보내도 관리자는
 *   탭을 직접 눌러보기 전에는 알 방법이 없었다("메시지가 어디로 가는지 모르겠다"의 정체).
 *   이 프로젝트에서 "만들어두고 호출부가 없는" 패턴은 메일 휴지통에서도 한 번 났다 —
 *   기능이 아니라 **연결**이 빠지는 종류의 고장이라 테스트로도 안 잡힌다.
 *
 * 60초인 이유 — 탭 안으로 들어가면 목록이 4초 폴링으로 최신을 보여준다.
 * 배지는 "들어가 볼 이유가 있는가"만 알려주면 되므로 이 정도면 충분하고,
 * 짧게 잡으면 화면을 열어둔 것만으로 서버를 계속 두드린다.
 *
 * 배지를 지우는 쪽은 ChatTab 이다. ★ 2026-08-25: 무효화만 하면 **서버 왕복이 끝나야** 숫자가
 * 사라져서 "눌렀는데 안 없어진다"로 보였다. 이제 ChatTab 이 캐시를 먼저 내려놓고(즉시 반영),
 * 무효화는 그 값을 서버로 확인하는 역할만 한다.
 *
 * 표시는 {@code UnreadPill} — 바로 아래 방 목록과 **같은 컴포넌트**다.
 * 예전에는 탭이 AntD 기본 빨강 원, 목록이 파란 알약이라 같은 뜻의 숫자가 두 모양이었다.
 */
const ChatTabLabel = () => {
    const { data: waiting = 0 } = useQuery({
        queryKey: adminKeys.chatWaiting(),
        queryFn: () => api.get(API_ENDPOINTS.CHAT.ADMIN_WAITING),
        refetchInterval: CHAT_BADGE_POLL_MS,
    });

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MessageOutlined />문의 채팅
            <UnreadPill count={waiting} style={{ marginLeft: 2 }} />
        </span>
    );
};

/**
 * 관리자 패널 — 순수 탭 셸.
 *
 * 모든 탭이 자체적으로 데이터 로딩·모달·컬럼 정의를 캡슐화한 별도 컴포넌트로 분리되어 있고,
 * 각 탭은 antd Tabs에 의해 최초 활성화될 때 마운트되면서 스스로 데이터를 불러오므로,
 * 부모가 activeTab을 감시하며 수동으로 로드를 트리거해줄 필요가 없다.
 *
 * 2026-07 전수조사: 사업자 인증(대기 중 / 전체 목록) 탭만 유일하게 이 파일 안에 통째로
 * 남아 있었다 — 데이터 로딩, 3개 mutation, 컬럼 정의, 상세 모달, 거절 모달까지 전부.
 * 다른 9개 탭과 같은 컨벤션으로 components/admin/BusinessVerificationTab.jsx로 분리하면서
 * 이 파일은 탭 구성만 담당하는 셸이 됐다(약 300줄 → 90줄).
 *
 * 두 사업자 인증 탭은 같은 queryKey를 공유하므로 TanStack Query 캐시 덕에 네트워크 요청은
 * 한 번만 나간다 — 컴포넌트를 두 번 마운트해도 중복 호출이 없다.
 */
const AdminPanel = () => {
    useDocumentTitle('관리자 패널');
    const navigate = useNavigate();
    const location = useLocation();

    const activeTab = new URLSearchParams(location.search).get('tab') || 'pending';

    const handleTabChange = (key) => navigate(`?tab=${key}`, { replace: true });

    const tabItems = [
        { key: 'pending',       label: tabLabel(<IdcardOutlined />,              '대기 중'),     children: <BusinessVerificationTab mode="pending" /> },
        { key: 'all',           label: tabLabel(<SafetyCertificateOutlined />,   '전체 목록'),   children: <BusinessVerificationTab mode="all" /> },
        { key: 'mailbox',       label: tabLabel(<MailOutlined />,                '메일함'),      children: <MailboxTab /> },
        // 채팅은 메일함 바로 옆에 둔다 — 둘 다 "사람이 답을 기다리는 곳"이라 같이 본다.
        { key: 'chat',          label: <ChatTabLabel />,                                        children: <ChatTab /> },
        { key: 'trash',         label: tabLabel(<DeleteOutlined />,              '휴지통'),      children: <TrashTab /> },
        { key: 'audit-logs',    label: tabLabel(<FileTextOutlined />,            '시스템 로그'), children: <AuditLogTab /> },
        { key: 'dashboard',     label: tabLabel(<BarChartOutlined />,            '대시보드'),    children: <DashboardTab /> },
        { key: 'members',       label: tabLabel(<TeamOutlined />,                '회원 관리'),   children: <MembersTab /> },
        { key: 'stores-admin',  label: tabLabel(<ShopOutlined />,                '가게 관리'),   children: <StoresAdminTab /> },
        { key: 'reservations',  label: tabLabel(<CalendarOutlined />,            '전체 예약'),   children: <ReservationsAllTab /> },
        { key: 'ads',           label: tabLabel(<NotificationOutlined />,        '광고 관리'),   children: <AdminAdsTab /> },
    ];

    return (
        <PageContainer size="xl" paddingTop="40px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={styles.title}>관리자 패널</Title>
                <Text type="secondary" style={{ fontSize: fontSize.base }}>
                    사업자 인증 신청을 검토하고, 전체 예약 현황을 모니터링하세요.
                </Text>
            </div>

            {/* NOTE: ref 및 scrollIntoView 제거 — iOS WebKit(Safari/Chrome)에서 viewport 전체를
                수평으로 밀어버리는 버그 원인. Ant Design Tabs는 모바일에서 자체적으로 탭 스크롤을 처리함. */}
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                items={tabItems}
                className="reserve-pill-tabs"
                tabBarGutter={4}
                animated={{ inkBar: true, tabPane: false }}
            />
        </PageContainer>
    );
};

const styles = {
    title: { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
};

export default AdminPanel;
