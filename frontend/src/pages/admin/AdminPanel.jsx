import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Typography, Tabs } from 'antd';
import {
    CalendarOutlined, SafetyCertificateOutlined, IdcardOutlined, MailOutlined,
    DeleteOutlined, FileTextOutlined, BarChartOutlined, TeamOutlined, ShopOutlined,
    NotificationOutlined,
} from '@ant-design/icons';
import MailboxTab from '../../components/admin/MailboxTab';
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
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;

// 탭 라벨 공통 스타일
const tabLabel = (icon, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon}{text}
    </span>
);

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
                animated={{ inkBar: true, tabPane: false }}
            />
        </PageContainer>
    );
};

const styles = {
    title: { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
};

export default AdminPanel;
