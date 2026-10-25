import useMemberWithdrawal from '../../hooks/useMemberWithdrawal';
import { lazy, Suspense, useEffect } from 'react';
import { Typography, Divider, Tabs } from 'antd';
import { CameraOutlined, UserOutlined, ShopOutlined, EnvironmentOutlined, IdcardOutlined } from '../../components/common/icons';
import { PageContainer, Button, Avatar } from '../../components/common';
import { useSearchParams } from 'react-router-dom';
import { useWindowWidth } from '../../hooks';

import useDocumentTitle from '../../hooks/useDocumentTitle';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';

import useAuthStore from '../../store/useAuthStore';

import { colors, fontSize, breakpoints } from '../../styles/tokens';

import NameTab from '../../components/member/NameTab';
import LoginSecuritySection from '../../components/member/LoginSecuritySection';
import ProfileImageTab from '../../components/member/ProfileImageTab';
import LocationTab from '../../components/member/LocationTab';
import BusinessTab from '../../components/member/BusinessTab';
import { NotificationSection, StoreDraftSection, AppearanceSection } from '../../components/member/AccountPreferences';
import styles from '../../components/member/myPageStyles';
import PublicProfileSkeleton from '../../components/member/PublicProfileSkeleton';

const { Text } = Typography;
const PublicProfileTab = lazy(() => import('../../components/member/PublicProfileTab'));
const MyPage = () => {
    const { user, checkAuth } = useAuthStore();
    useDocumentTitle('마이페이지');
    const { handleDeleteAccount, withdrawChecking } = useMemberWithdrawal();
    const [params, setParams] = useSearchParams();

    // 마이페이지 진입 시 항상 최신 user 정보를 서버에서 재조회 (localStorage 캐시 신뢰하지 않음)
    useEffect(() => { checkAuth(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const tabItems = [
        {
            key: 'name',
            label: <span style={styles.tabLabel}><UserOutlined style={{ marginRight: 6 }} />이름</span>,
            children: <NameTab user={user} />,
        },
        {
            key: 'photo',
            label: <span style={styles.tabLabel}><CameraOutlined style={{ marginRight: 6 }} />사진</span>,
            children: <ProfileImageTab user={user} />,
        },
        {
            key: 'public-profile',
            label: <span style={styles.tabLabel}><IdcardOutlined style={{ marginRight: 6 }} />공개 프로필</span>,
            children: <Suspense fallback={<PublicProfileSkeleton />}><PublicProfileTab /></Suspense>,
        },
        {
            key: 'location',
            label: <span style={styles.tabLabel}><EnvironmentOutlined style={{ marginRight: 6 }} />위치</span>,
            children: <LocationTab user={user} />,
        },
        ...(!hasAdminAccess(user?.role) ? [{
            key: 'business',
            label: <span style={styles.tabLabel}><ShopOutlined style={{ marginRight: 6 }} />사업자</span>,
            children: <BusinessTab user={user} />,
        }] : []),
    ];
    const requestedTab = params.get('tab');
    const activeTab = tabItems.some(item => item.key === requestedTab) ? requestedTab : 'name';
    useEffect(() => {
        if (requestedTab === activeTab) return;
        setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', activeTab); return next; }, { replace: true });
    }, [requestedTab, activeTab, setParams]);
    const selectTab = key => setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', key); return next; });

    // 마이페이지는 태블릿부터 두 열로 배치하고 모바일은 한 열을 사용한다.

    const isPC = useWindowWidth() >= breakpoints.tablet;

    const securitySection = (
        <LoginSecuritySection user={user} initialPasswordOpen={requestedTab === 'password'}>
            <div style={{ ...styles.notifRow, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main }}>회원 탈퇴</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: fontSize.xs, marginTop: 2 }}>
                        개인정보는 제거되며 필요한 거래 기록은 비식별 상태로 보존돼요
                    </Text>
                </div>
                <Button variant="danger" size="sm" loading={withdrawChecking} onClick={handleDeleteAccount}
                    style={{ flexShrink: 0, padding: '0 16px', minWidth: 72 }}>
                    탈퇴하기
                </Button>
            </div>
        </LoginSecuritySection>
    );

    const leftColumn = (
        <>
            {/* 프로필 헤더 */}
            <div style={styles.profileHeader}>
                <Avatar src={user?.profileImageUrl || user?.profileImage} size={56} />
                <div>
                    <Text strong style={styles.userName}>{user?.name}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>
                    {user?.role !== 'USER' && (
                        <Text style={styles.userRole}>
                            {user?.role === 'BUSINESS' ? '파트너 사장님' : '시스템 관리자'}
                        </Text>
                    )}
                </div>
            </div>

            {/* 정보 수정 탭 */}
            <div style={styles.tabsCard}>
                <Text strong style={styles.sectionTitle}>내 정보 수정</Text>
                <Tabs activeKey={activeTab} onChange={selectTab} items={tabItems} className="reserve-pill-tabs" tabBarGutter={4} animated={{ inkBar: true, tabPane: false }} />
            </div>
            {isPC && securitySection}
        </>
    );

    const rightColumn = (
        <>
            {/* 디자인(모양·글꼴) */}
            <AppearanceSection />

            <Divider />

            {/* 알림 설정 + 마케팅 수신 동의 (통합 카드) */}
            <NotificationSection user={user} />

            {hasOwnerAccess(user?.role) && (
                <>
                    <Divider />
                    <StoreDraftSection user={user} />
                </>
            )}

        </>
    );

    // 모바일: 같은 카드들을 세로 1열(size="sm", 420px)로 배치한다.
    // 프로필 → 내 정보 수정 → 디자인 → 알림·가게 설정 → 로그인 및 보안·탈퇴.
    if (!isPC) {
        return (
            <PageContainer size="sm" paddingTop="48px">
                {leftColumn}
                <Divider />
                {rightColumn}
                <Divider />
                {securitySection}
            </PageContainer>
        );
    }

    // PC: 왼쪽은 프로필·정보수정·계정 보안, 오른쪽은 앱 설정.
    // 오른쪽을 sticky로 두면 왼쪽 탭 내용이 길어져도 설정이 따라온다(StoreDetail과 같은 패턴).
    return (
        <PageContainer size="lg" paddingTop="48px">
            <div style={styles.pcGrid}>
                <div style={styles.pcLeft}>{leftColumn}</div>
                <div style={styles.pcRight}>{rightColumn}</div>
            </div>
        </PageContainer>
    );
};

export default MyPage;
