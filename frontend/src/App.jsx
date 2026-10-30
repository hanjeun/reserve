import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useContext, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, matchPath, useLocation, useNavigationType } from 'react-router-dom';
import SessionQueryProvider from './components/common/SessionQueryProvider';
import ServiceAdmissionProvider from './components/common/ServiceAdmissionProvider';
import WorkspaceNavigationProvider from './components/layout/WorkspaceNavigationProvider';
import WorkspaceMenuProvider from './components/layout/WorkspaceMenuProvider';
import LegacyDomainNotice from './components/layout/LegacyDomainNotice';
import LoginFeedback from './components/layout/LoginFeedback';
import { uiIconConfig } from './components/common/uiIconConfig';
import { Layout, ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import useAuthStore from './store/useAuthStore';
import { colors, rawColors, semanticActionPalettes, field, fieldPx, zIndex, fontWeight, fontSize } from './styles/tokens';
import useTheme from './hooks/useTheme';
import useImagePreviewSwipe from './hooks/useImagePreviewSwipe';
import useModalScrollLock from './hooks/useModalScrollLock';
import { useWindowWidth } from './hooks/useWindowWidth';
import useRouteSeo from './hooks/useRouteSeo';
import { installRecentSearchPrivacyBoundary } from './utils/recentSearches';

// 페이지는 처음 방문할 때 청크를 요청하고 공통 앱 셸은 정적으로 가져온다.

const initialPageLoaders = [];
const lazyPublicPage = (path, loadPage) => {
    initialPageLoaders.push({ path, loadPage });
    return lazy(loadPage);
};

const Home = lazyPublicPage('/', () => import('./pages/Home'));
const SearchPage = lazyPublicPage('/search', () => import('./pages/Search'));
const Feed = lazyPublicPage('/feed', () => import('./pages/discovery/Feed'));
const FeedDetail = lazyPublicPage('/feed/posts/:id', () => import('./pages/discovery/FeedDetail'));
const FeedAuthor = lazyPublicPage('/feed/u/:publicId', () => import('./pages/discovery/FeedAuthor'));
const FeedNotifications = lazy(() => import('./pages/discovery/FeedNotifications'));
const Benefits = lazyPublicPage('/benefits', () => import('./pages/discovery/Benefits'));
const BenefitDetail = lazyPublicPage('/benefits/:id', () => import('./pages/discovery/BenefitDetail'));
const Login = lazyPublicPage('/login', () => import('./pages/auth/Login'));
const Signup = lazyPublicPage('/signup', () => import('./pages/auth/Signup'));
const ForgotPassword = lazyPublicPage('/forgot-password', () => import('./pages/auth/ForgotPassword'));
const OAuthCallback = lazy(() => import('./pages/auth/OAuthCallback'));
const StoreList = lazyPublicPage('/stores', () => import('./pages/store/StoreList'));
const StoreDetail = lazyPublicPage('/store/:id', () => import('./pages/store/StoreDetail'));
const StoreRegister = lazy(() => import('./pages/store/StoreRegister'));
const StoreEdit = lazy(() => import('./pages/store/StoreEdit'));
const DraftTransfer = lazy(() => import('./pages/store/DraftTransfer'));
const MyStores = lazy(() => import('./pages/store/MyStores'));
const MyReservations = lazy(() => import('./pages/reservation/MyReservations'));
const Waiting = lazyPublicPage('/waiting', () => import('./pages/discovery/Waiting'));
const BusinessPanel = lazy(() => import('./pages/business/BusinessPanel'));
const MyPage = lazy(() => import('./pages/member/MyPage'));
const MyFavorites = lazy(() => import('./pages/favorite/MyFavorites'));
const PaymentResult = lazy(() => import('./pages/payment/PaymentResult'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const Terms = lazyPublicPage('/terms', () => import('./pages/legal/Terms'));
const SocialAgreement = lazy(() => import('./pages/auth/SocialAgreement'));
const Privacy = lazyPublicPage('/privacy', () => import('./pages/legal/Privacy'));
const ContentSources = lazyPublicPage('/content-sources', () => import('./pages/legal/ContentSources'));
const OperationGuide = lazyPublicPage('/operation-guide', () => import('./pages/legal/OperationGuide'));
const UserGuide = lazyPublicPage('/guide/user', () => import('./pages/legal/UserGuide'));
const BusinessGuide = lazyPublicPage('/guide/business', () => import('./pages/legal/BusinessGuide'));
const CommonGuide = lazyPublicPage('/guide/common', () => import('./pages/legal/CommonGuide'));
const MessagesPage = lazy(() => import('./pages/member/MessagesPage'));

const NotFound = lazy(() => import('./pages/NotFound'));
// 로그인한 사용자만 쓰는 통합 메신저는 익명 랜딩의 초기 번들에서 제외한다.
const MessengerShell = lazy(() => import('./components/chat/MessengerShell'));
const DiscoverySwipe = lazy(() => import('./components/layout/DiscoverySwipe'));

const preloadInitialPage = pathname => {
    // 고정된 보호 경로가 공개 상세 경로의 :id로 잡히지 않게 한다.
    if (matchPath('/store/register', pathname)) return;
    const page = initialPageLoaders.find(candidate => matchPath(candidate.path, pathname));
    if (!page) return;
    // 미리 읽기 오류를 React.lazy에 남기지 않아 실제 렌더에서 다시 시도한다.
    void page.loadPage().catch(() => null);
};

import Header, { HeaderPlaceholder } from './components/layout/Header';
import DiscoveryNav from './components/layout/DiscoveryNav';
import RouteLoadingSkeleton from './components/layout/RouteLoadingSkeleton';
import { resolveRouteSkeletonLocation } from './components/layout/routeSkeletonKind';
import { applyRouteEntryMotion, clearRouteEntryMotion, getRouteHistoryIndex, resolveRouteEntryMotion } from './components/layout/routeEntryMotion';
import { SEARCH_MOTION_DURATION_MS } from './components/layout/searchTransition';
import { TooltipScopeContext } from './components/common/tooltipScope';
import { LoadingPresentationContext, useRouteLoadingPresentation, useDocumentEntry, useSkeletonShown } from './components/layout/loadingPresentation';
import { DISCOVERY_NAV_ITEMS, isDiscoveryRootPath } from './constants/discovery';
import AppFooter from './components/layout/Footer';
import SignupLegalLayout from './components/layout/SignupLegalLayout';
import OfflineBanner from './components/layout/OfflineBanner';
import { loadingConfig } from './components/common/loadingConfig';
import PrivateRoute from './components/PrivateRoute';
import ScrollToTop from './components/ScrollToTop';
import { AppErrorBoundary, RouteErrorBoundary } from './components/layout/AppErrorBoundary';

const { Content } = Layout;

const validateMessages = {
    required: '${label}을(를) 입력해주세요.',
    types: {
        email: '올바른 이메일 형식이 아니에요.',
        number: '숫자를 입력해주세요.',
    },
    string: {
        min: '최소 ${min}자 이상 입력해주세요.',
        max: '최대 ${max}자까지 입력할 수 있어요.',
    },
};

const buildNeutralFocus = isDark => ({
    activeBorderColor: isDark ? '#8b939e' : rawColors.gray[500],
    hoverBorderColor: isDark ? '#5c636d' : rawColors.gray[400],
    activeShadow: 'none',
});

/*
 * AntD는 JS에서 파생색·글꼴을 계산하므로 CSS 변수 대신 색 리터럴과 글꼴 상속을 사용한다. 테마 변경은 AntD 알고리즘에도 별도로 반영한다.
 */
/**
 * @param isDark   다크 모드인지
 * @param accent   사용자가 고른 포인트 색의 **리터럴 hex** (useTheme 의 accentColors).
 *                 AntD 토큰은 CSS 변수를 못 받는다 — AntD 가 JS 로 파생색을 계산하기 때문이다.
 *                 그래서 CSS 쪽(--c-primary)과 여기(colorPrimary)를 각각 넣어야 하고,
 *                 둘 다 같은 출처(ACCENT_OPTIONS)에서 나오므로 어긋나지 않는다.
 */
const buildThemeConfig = (isDark, accent) => {
    const neutralFocus = buildNeutralFocus(isDark);
    const semantic = semanticActionPalettes[isDark ? 'dark' : 'light'];
    return {
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            colorPrimary: accent.main,
            colorBgContainer: isDark ? '#1e2126' : '#ffffff',
            colorBorder: isDark ? '#2d3138' : rawColors.gray[100],
            borderRadius: fieldPx(field.radius),
            // 고정 헤더·메신저보다 위에 모달을 두어 입력·결제 도구를 가리지 않는다.

            zIndexPopupBase: zIndex.modal,
            // 검증 메시지·테두리·아이콘은 같은 의미별 색 리터럴을 사용한다.

            colorError: semantic.error.main,
            colorWarning: isDark ? '#ffc633' : '#ffb800',
            // 다크 배경의 자리표시자·비활성 문구 대비를 보정하고 라이트 기본값은 유지한다.

            colorTextPlaceholder: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.25)',
            colorTextDisabled:    isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(0, 0, 0, 0.25)',
            // 사용자가 선택한 글꼴을 body에서 상속한다.

            fontFamily: 'inherit',
        },
        components: {
            Tooltip: {
                colorBgSpotlight: isDark ? '#ffffff' : '#1a1f27',
                colorTextLightSolid: isDark ? '#1a1f27' : '#ffffff',
                borderRadius: 10,
            },
            Button: {
                primaryColor: accent.foreground,
                colorPrimaryHover: accent.solidHover,
                colorPrimaryActive: accent.solidHover,
                dangerColor: semantic.error.foreground,
                colorError: semantic.error.solid,
                colorErrorHover: semantic.error.solidHover,
                colorErrorActive: semantic.error.solidHover,
                colorPrimary: accent.solid,
                borderRadius: 16,
                borderRadiusSM: 10,
                borderRadiusLG: 16,
            },
            // 입력 포커스는 같은 중립 테두리를 사용한다.

            Input: {
                colorBgContainer: isDark ? '#23262b' : rawColors.gray[50],
                ...neutralFocus,
            },
            InputNumber: { ...neutralFocus },
            DatePicker: { ...neutralFocus },
            // 채움형 입력은 gray[50], 비활성 입력은 gray[100]을 사용한다.

            Select: {
                colorBgContainer: isDark ? '#23262b' : rawColors.gray[50],
                colorBgElevated: isDark ? '#1e2126' : '#ffffff',
                optionSelectedBg: isDark ? '#2d3138' : rawColors.gray[200],
                activeBorderColor: neutralFocus.activeBorderColor,
                hoverBorderColor: neutralFocus.hoverBorderColor,
                activeOutlineColor: 'transparent',
            },
            // 카드 하단 도구는 전용 actionsBg 토큰을 사용한다.

            Card: {
                actionsBg: isDark ? '#1e2126' : '#ffffff',
            },
            Tabs: {
                inkBarColor: accent.main,
                horizontalItemGutter: 24,
                itemColor: isDark ? '#8b939e' : rawColors.gray[500],
                itemHoverColor: isDark ? '#e8eaed' : rawColors.gray[900],
                itemSelectedColor: accent.main,
                colorBorderSecondary: isDark ? '#23262b' : rawColors.gray[100],
            },
        },
    };
};

const isSearchPath = pathname => /^\/search\/?$/.test(pathname);
const isMessagesPath = pathname => /^\/messages\/?$/.test(pathname);
const appLayoutStyle = { backgroundColor: colors.background.default, '--reserve-search-motion-duration': `${SEARCH_MOTION_DURATION_MS}ms` };

// 부트 셸과 실제 화면은 같은 레이아웃 클래스로 너비·좌우 여백을 공유한다.

function appLayoutClassName(pathname) {
    if (pathname === '/') return 'reserve-app-layout reserve-app-layout--home';
    if (isSearchPath(pathname)) return 'reserve-app-layout reserve-app-layout--search';
    if (isMessagesPath(pathname)) return 'reserve-app-layout reserve-app-layout--messages';
    return 'reserve-app-layout';
}

function AppContent() {
    const location = useLocation();
    const { pathname, search } = location;
    const initialPathnameRef = useRef(pathname);
    const presentation = useRouteLoadingPresentation(location, useNavigationType());
    const { initializeAuth, sessionRevision } = useAuthStore();
    const [loading, setLoading] = useState(true);

    useEffect(() => installRecentSearchPrivacyBoundary(useAuthStore), []);

    useEffect(() => {
        // 현재 공개 페이지의 코드만 인증 복구와 병렬로 받는다. 마운트와 API 조회는 인증 뒤에 유지한다.
        preloadInitialPage(initialPathnameRef.current);
        const initAuth = async () => {
            try {
                await initializeAuth();
            } finally {
                setLoading(false);
            }
        };
        // 인증·네트워크 오류를 처리한 초기화는 null을 반환한다.
        void initAuth();
    }, [initializeAuth]);

    // 인증 복구 중에는 실제 배치를 공유하는 정적 헤더·탭·페이지 골격을 표시한다.
    // 인증 전에 실제 헤더·메신저를 붙이지 않아 토큰 갱신 중복을 방지한다.

    if (loading) {
        const pending = resolveRouteSkeletonLocation(pathname, search);
        const discoveryRoot = isDiscoveryRootPath(pending.pathname, pending.search);
        return (
            <LoadingPresentationContext.Provider value={presentation}>
            <Layout className={appLayoutClassName(pending.pathname) + ' reserve-boot-shell'} style={appLayoutStyle}>
                {!isSearchPath(pending.pathname) && !isMessagesPath(pending.pathname) && <HeaderPlaceholder discoveryRoot={discoveryRoot} workspace={/^\/(admin|business)\/?$/.test(pending.pathname)} />}
                {discoveryRoot && <DiscoveryNav pendingPathname={pending.pathname} />}
                <Content>
                    <RouteLoadingSkeleton />
                </Content>
            </Layout>
            </LoadingPresentationContext.Provider>
        );
    }

    return (
        <LoadingPresentationContext.Provider value={presentation}>
        <AntApp message={{ maxCount: 3, styles: {
            list: { willChange: 'auto' }, listContent: { willChange: 'auto', pointerEvents: 'none' },
            root: { willChange: 'auto', backfaceVisibility: 'visible' },
            title: { color: colors.text.primary, fontWeight: fontWeight.medium, fontSize: fontSize.base, lineHeight: '24px' },
        } }}>
            <LoginFeedback />
            <SessionQueryProvider key={sessionRevision}>
                <ServiceAdmissionProvider>
                    <WorkspaceNavigationProvider><WorkspaceMenuProvider><AppRoutes /></WorkspaceMenuProvider></WorkspaceNavigationProvider>
                </ServiceAdmissionProvider>
            </SessionQueryProvider>
        </AntApp>
        </LoadingPresentationContext.Provider>
    );
}

function AppRoutes() {
    const isLoggedIn = useAuthStore((state) => !!state.user);
    const { pathname, search, key: locationKey, state: locationState } = useLocation();
    const isOAuthCallback = /^\/oauth2\/callback\/?$/.test(pathname);
    const displayLocation = resolveRouteSkeletonLocation(pathname, search);
    const discoveryRoot = isDiscoveryRootPath(displayLocation.pathname, displayLocation.search);
    const isSearchLayout = isSearchPath(displayLocation.pathname);
    const isMessagesLayout = isMessagesPath(displayLocation.pathname);
    const skeletonShown = useSkeletonShown();
    const presentation = useContext(LoadingPresentationContext);
    const documentEntry = useDocumentEntry();
    const navigationType = useNavigationType();
    const isSearchPage = isSearchPath(pathname);
    const homeLogoEntry = pathname === '/' && locationState?.reserveHomeEntry === true;
    const routeContentRef = useRef(null);
    const mobileDiscovery = useWindowWidth() <= 767 && discoveryRoot && !isOAuthCallback;
    const previousPathnameRef = useRef(/** @type {string | null} */ (null));
    const previousDiscoveryTabRef = useRef(null);
    const previousHistoryIndexRef = useRef(null);
    useRouteSeo();

    useLayoutEffect(() => {
        const content = routeContentRef.current;
        const normalizedPath = pathname.replace(/\/$/, '') || '/';
        const currentTabIndex = isDiscoveryRootPath(pathname, search)
            ? DISCOVERY_NAV_ITEMS.findIndex(item => item.to === normalizedPath)
            : -1;
        const previousPathname = previousPathnameRef.current;
        const previousTabIndex = previousDiscoveryTabRef.current;
        const historyIndex = getRouteHistoryIndex();
        const resolvedRouteMotion = resolveRouteEntryMotion({
            previousPathname,
            pathname,
            previousDiscoveryTabIndex: previousTabIndex,
            currentDiscoveryTabIndex: currentTabIndex,
            previousHistoryIndex: previousHistoryIndexRef.current,
            historyIndex,
            navigationType,
            explicitDirection: locationState?.reserveRouteMotion,
        });
        // 검색의 헤더/본문 전환과 복원은 전용 모션을 사용해 가로 페이지 전환을 겹치지 않는다.
        const routeMotion = isSearchPage || homeLogoEntry ? null : resolvedRouteMotion;

        // 검색 뒤 복원되는 헤더와 본문에 같은 진입 표식을 둔다. 쿼리 정규화에서는 유지한다.
        if (previousPathname !== pathname) {
            content?.parentElement?.toggleAttribute('data-search-restored',
                /^\/search\/?$/.test(previousPathname || '') && !isSearchPage);
        }

        applyRouteEntryMotion(content, {
            pathnameChanged: previousPathname !== pathname,
            direction: routeMotion,
            skeletonShown: presentation?.getSnapshot() ?? skeletonShown,
            documentEntry,
        });
        previousPathnameRef.current = pathname;
        previousDiscoveryTabRef.current = currentTabIndex;
        previousHistoryIndexRef.current = historyIndex;
    }, [pathname, search, locationKey, locationState, navigationType, isSearchPage, homeLogoEntry, skeletonShown, presentation, documentEntry]);

    return (
        <TooltipScopeContext.Provider value={locationKey}>
        <Layout className={appLayoutClassName(displayLocation.pathname)} style={appLayoutStyle}>
            <ScrollToTop />
            {mobileDiscovery && <Suspense fallback={null}><DiscoverySwipe contentRef={routeContentRef} /></Suspense>}
            <OfflineBanner />
            {!isSearchLayout && !isMessagesLayout && (isOAuthCallback ? <HeaderPlaceholder discoveryRoot={discoveryRoot} /> : <Header />)}
            {discoveryRoot && <DiscoveryNav pendingPathname={isOAuthCallback ? displayLocation.pathname : undefined} />}
            <Content ref={routeContentRef} data-skeleton-shown={skeletonShown ? 'true' : undefined}
                data-document-entry={documentEntry ? 'true' : undefined}
                data-home-logo-entry={homeLogoEntry ? 'true' : undefined}
                onAnimationEnd={event => {
                    if (['reserve-discovery-page-from-right', 'reserve-discovery-page-from-left'].includes(event.animationName)) {
                        clearRouteEntryMotion(routeContentRef.current);
                    }
                }}>
                {/* 라우트 콘텐츠의 렌더 오류는 여기서 멈춘다 — 헤더·푸터는 남아 다른 화면으로 갈 수 있다. */}
                <RouteErrorBoundary>
                <LegacyDomainNotice />
                <Suspense fallback={<RouteLoadingSkeleton />}>
                <Routes>
                    {/* 공용 페이지 */}
                    <Route path="/" element={<Home />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/benefits" element={<Benefits />} />
                    <Route path="/benefits/:id" element={<BenefitDetail />} />
                    <Route path="/waiting" element={<Waiting />} />
                    <Route path="/feed" element={<Feed />} />
                    <Route path="/feed/posts/:id" element={<FeedDetail />} />
                    <Route path="/feed/u/:publicId" element={<FeedAuthor />} />
                    <Route path="/login" element={<Login />} />
                    <Route element={<SignupLegalLayout signup={<Signup />} socialAgreement={<SocialAgreement />} />}>
                        <Route path="/signup" element={null} />
                        <Route path="/signup/social" element={null} />
                        <Route path="/terms" element={<Terms />} />
                        <Route path="/privacy" element={<Privacy />} />
                    </Route>
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/oauth2/callback" element={<OAuthCallback />} />
                    <Route path="/stores" element={<StoreList />} />
                    <Route path="/store/:id" element={<StoreDetail />} />
                    <Route path="/content-sources" element={<ContentSources />} />
                    <Route path="/operation-guide" element={<OperationGuide />} />
                    <Route path="/guide/user" element={<UserGuide />} />
                    <Route path="/guide/business" element={<BusinessGuide />} />
                    <Route path="/guide/common" element={<CommonGuide />} />

                    {/* OWNER / ADMIN 전용 */}
                    <Route element={<PrivateRoute allowedRoles={['ADMIN', 'BUSINESS']} />}>
                        <Route path="/my-stores" element={<MyStores />} />
                        <Route path="/store/register" element={<StoreRegister />} />
                        <Route path="/store/:id/edit" element={<StoreEdit />} />
                        <Route path="/drafts/transfer" element={<DraftTransfer />} />
                        <Route path="/business" element={<BusinessPanel />} />
                    </Route>

                    {/* ADMIN 전용 */}
                    <Route element={<PrivateRoute allowedRoles={['ADMIN']} />}>
                        <Route path="/admin" element={<AdminPanel />} />
                    </Route>

                    {/* 로그인 유저 공통 */}
                    <Route element={<PrivateRoute />}>
                        <Route path="/feed/notifications" element={<FeedNotifications />} />
                        <Route path="/my-reservations" element={<MyReservations />} />
                        <Route path="/my-favorites" element={<MyFavorites />} />
                        <Route path="/payment/result" element={<PaymentResult />} />
                        <Route path="/my-page" element={<MyPage />} />
                        <Route path="/messages" element={<MessagesPage />} />
                    </Route>

                    {/* 위 어디에도 맞지 않는 주소. robots noindex 는 useRouteSeo 가 경로 기준으로 붙인다. */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                </RouteErrorBoundary>
            </Content>

            {!isMessagesLayout && !isSearchLayout && <AppFooter />}
            {/* 라우트마다 붙이지 않고 레이아웃에 한 번만 둔다. 익명 사용자는 청크도 받지 않는다. */}
            {isLoggedIn && !isOAuthCallback && (
                <LoadingPresentationContext.Provider value={null}>
                <Suspense fallback={null}>
                    <MessengerShell launcherImageSrc="/icons/R_logo.png" />
                </Suspense>
                </LoadingPresentationContext.Provider>
            )}
        </Layout>
        </TooltipScopeContext.Provider>
    );
}

function App() {
    // 테마의 색 리터럴과 AntD 알고리즘을 함께 전환한다.

    const { resolvedTheme, accentColors } = useTheme();
    // 훅·직접 미리보기 두 경로를 지원하도록 DOM 기준 스와이프 처리기를 한 번 설치한다.

    useImagePreviewSwipe();
    useModalScrollLock();
    const themeConfig = useMemo(
        () => buildThemeConfig(resolvedTheme === 'dark', accentColors),
        // 안정 참조인 accentColors 객체를 의존성으로 사용해 컴파일러가 추론한 경계를 유지한다.

        [resolvedTheme, accentColors]
    );

    return (
            <BrowserRouter useTransitions={false}>
                <ConfigProvider
                    locale={koKR}
                    theme={themeConfig}
                    {...uiIconConfig}
                    {...loadingConfig}
                    select={{ ...uiIconConfig.select, ...loadingConfig.select }}
                    form={{ validateMessages }}
                >
                    {/* 앱 셸 오류도 경계에서 처리해 전체 화면이 비지 않게 한다. */}
                    <AppErrorBoundary>
                        <AppContent />
                    </AppErrorBoundary>
                </ConfigProvider>
            </BrowserRouter>
    );
}

export default App;
