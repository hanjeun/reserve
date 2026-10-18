import useMemberWithdrawal from '../../hooks/useMemberWithdrawal';
import { lazy, Suspense, useEffect } from 'react';
import { Typography, Divider, Tabs } from 'antd';
import { LockOutlined, CameraOutlined, UserOutlined, ShopOutlined, EnvironmentOutlined, IdcardOutlined } from '../../components/common/icons';
import { PageContainer, Button, Avatar } from '../../components/common';
import { useSearchParams } from 'react-router-dom';
import { useWindowWidth } from '../../hooks';

import useDocumentTitle from '../../hooks/useDocumentTitle';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';


import useAuthStore from '../../store/useAuthStore';

import { colors, fontSize, breakpoints } from '../../styles/tokens';

import NameTab from '../../components/member/NameTab';
import PasswordTab from '../../components/member/PasswordTab';
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

    const isSocialUser = user?.provider && user.provider !== 'LOCAL';

    const tabItems = [
        {
            key: 'name',
            label: <span style={styles.tabLabel}><UserOutlined style={{ marginRight: 6 }} />이름</span>,
            children: <NameTab user={user} />,
        },
        ...(!isSocialUser ? [{
            key: 'password',
            label: <span style={styles.tabLabel}><LockOutlined style={{ marginRight: 6 }} />비밀번호</span>,
            children: <PasswordTab />,
        }] : []),
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

    // PC에서는 좌우 2단으로 나눈다(가게 상세의 pcLeft/pcRight와 같은 패턴).
    // 예전엔 size="sm"(maxWidth 420)이라 PC에서도 모바일 폭 그대로였고 양옆이 텅 비었다.
    // 모바일은 기존 흐름(세로 1열)을 그대로 유지한다 — 폰 화면은 건드리지 않는다는 원칙.
    // 경계는 tablet(768) — 아이패드·갤럭시탭도 PC처럼 2단으로 본다.
    // pc(900)로 잡았더니 아이패드 세로(768~820)가 모바일 1열이라 좌우가 텅 비어 어색했다.
    // 768에서도 성립하는지 계산: 컨테이너 768-48=720, gap 32 → 좌우 합 688.
    // pcLeft basis 420 + pcRight basis 300(minWidth 280)이면 688 안에 들어간다.
    const isPC = useWindowWidth() >= breakpoints.tablet;

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

            <Divider />

            {/* 회원 탈퇴 */}
            <div style={styles.deleteSection}>
                <div>
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
        </>
    );

    // 모바일: 기존과 완전히 동일한 세로 1열(size="sm", 420px). 순서도 그대로 —
    // 프로필 → 내 정보 수정 → [디자인] → 알림 → 탈퇴. 디자인 섹션만 새로 끼어든다.
    if (!isPC) {
        return (
            <PageContainer size="sm" paddingTop="48px">
                {leftColumn}
                <Divider />
                {rightColumn}
            </PageContainer>
        );
    }

    // PC: 좌우 2단. 왼쪽은 프로필·정보수정(입력 위주라 넓게), 오른쪽은 설정·탈퇴.
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
