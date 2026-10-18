import React, { lazy, Suspense, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MailboxTab from '../../components/admin/MailboxTab';
import ChatReportsPanel from '../../components/admin/ChatReportsPanel';
import SupportIntroTab from '../../components/admin/SupportIntroTab';
import TrashTab from '../../components/admin/TrashTab';
import AuditLogTab from '../../components/admin/AuditLogTab';
import DashboardTab from '../../components/admin/DashboardTab';
import MembersTab from '../../components/admin/MembersTab';
import StoresAdminTab from '../../components/admin/StoresAdminTab';
import ReservationsAllTab from '../../components/admin/ReservationsAllTab';
import AdminAdsTab from '../../components/admin/AdminAdsTab';
import BusinessVerificationTab from '../../components/admin/BusinessVerificationTab';
import PaymentOperationsTab from '../../components/admin/PaymentOperationsTab';
import WorkspaceLayout from '../../components/layout/WorkspaceLayout';
import WorkspacePanels from '../../components/layout/WorkspacePanels';
import useWorkspaceNavigate from '../../hooks/useWorkspaceNavigate';
import { ADMIN_WORKSPACE_GROUPS, resolveAdminTab } from '../../constants/workspaces';
import { adminTabSearch } from './adminTabQuery';
import { FeedReportsSkeleton } from '../../components/feed/FeedSkeleton';
import { BenefitApplicationsSkeleton } from '../../components/admin/ManagementReviewSkeletons';

const FeedReportsPanel = lazy(() => import('../../components/admin/FeedReportsPanel'));
const BenefitApplicationsPanel = lazy(() => import('../../components/admin/BenefitApplicationsPanel'));

/** 최초 방문 때 마운트하고 메뉴 전환 후에도 관리자 작업을 보존한다. */
export default function AdminPanel() {
    const navigate = useNavigate();
    const navigateWorkspace = useWorkspaceNavigate();
    const location = useLocation();
    const activeTab = resolveAdminTab(new URLSearchParams(location.search).get('tab'));
    const hrefFor = key => `?${adminTabSearch(location.search, key)}${location.hash}`;
    useEffect(() => {
        const normalized = adminTabSearch(location.search, activeTab);
        if (normalized !== location.search.replace(/^\?/, '')) navigate({ search: '?' + normalized, hash: location.hash }, { replace: true });
    }, [activeTab, location.search, location.hash, navigate]);

    const tabItems = [
        { key: 'pending', label: '인증 대기', children: <BusinessVerificationTab mode="pending" /> },
        { key: 'all', label: '인증 전체 목록', children: <BusinessVerificationTab mode="all" /> },
        { key: 'mailbox', label: '메일함', children: <MailboxTab /> },
        { key: 'reports', label: '채팅 신고', children: <ChatReportsPanel /> },
        { key: 'feed-reports', label: '피드·소식 신고', children: <Suspense fallback={<FeedReportsSkeleton />}><FeedReportsPanel /></Suspense> },
        { key: 'benefit-applications', label: '혜택 신청', children: <Suspense fallback={<BenefitApplicationsSkeleton />}><BenefitApplicationsPanel /></Suspense> },
        { key: 'chat-intro', label: '채팅 관리', children: <SupportIntroTab /> },
        { key: 'trash', label: '휴지통', children: <TrashTab /> },
        { key: 'audit-logs', label: '시스템 로그', children: <AuditLogTab /> },
        { key: 'dashboard', label: '대시보드', children: <DashboardTab /> },
        { key: 'members', label: '회원 관리', children: <MembersTab /> },
        { key: 'stores-admin', label: '가게 관리', children: <StoresAdminTab /> },
        { key: 'reservations', label: '전체 예약', children: <ReservationsAllTab /> },
        { key: 'payments', label: '결제 운영', children: <PaymentOperationsTab /> },
        { key: 'ads', label: '광고 관리', children: <AdminAdsTab /> },
    ];

    return <WorkspaceLayout title="관리자 패널"
        groups={ADMIN_WORKSPACE_GROUPS} activeKey={activeTab} hrefFor={hrefFor}
        onSelect={key => navigateWorkspace(hrefFor(key))}>
        <WorkspacePanels activeKey={activeTab} items={tabItems} keepMounted />
    </WorkspaceLayout>;
}
