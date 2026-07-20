import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout, ConfigProvider, App as AntApp } from 'antd';
import koKR from 'antd/locale/ko_KR';
import useAuthStore from './store/useAuthStore';
import { colors, animationKeyframes } from './styles/tokens';

// 라우트 단위 Code Splitting (2026-07): 예전엔 모든 페이지를 정적 import해서 첫 번들 JS에
// 관리자 패널·예약 화면 등 무거운 페이지 코드까지 전부 번들링되었음. React.lazy로 쪼개서
// 각 페이지 청크를 처음 방문할 때만 다운로드하도록 함(초기 번들 크기 감소). Header/Footer/
// OfflineBanner는 항상 필요하므로 정적 import 유지.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const OAuthCallback = lazy(() => import('./pages/auth/OAuthCallback'));
const StoreList = lazy(() => import('./pages/store/StoreList'));
const StoreDetail = lazy(() => import('./pages/store/StoreDetail'));
const StoreRegister = lazy(() => import('./pages/store/StoreRegister'));
const StoreEdit = lazy(() => import('./pages/store/StoreEdit'));
const MyStores = lazy(() => import('./pages/store/MyStores'));
const MyReservations = lazy(() => import('./pages/reservation/MyReservations'));
const BusinessPanel = lazy(() => import('./pages/business/BusinessPanel'));
const MyPage = lazy(() => import('./pages/member/MyPage'));
const MyFavorites = lazy(() => import('./pages/favorite/MyFavorites'));
const PaymentResult = lazy(() => import('./pages/payment/PaymentResult'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const SocialAgreement = lazy(() => import('./pages/auth/SocialAgreement'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));

import Header from './components/layout/Header';
import AppFooter from './components/layout/Footer';
import OfflineBanner from './components/layout/OfflineBanner';
import Loading, { SpinIndicator } from './components/common/Loading';
import PrivateRoute from './components/PrivateRoute';
import ScrollToTop from './components/ScrollToTop';

const { Content } = Layout;

const validateMessages = {
    required: '${label}을(를) 입력해주세요.',
    types: {
        email: '올바른 이메일 형식이 아닙니다.',
        number: '숫자를 입력해주세요.',
    },
    string: {
        min: '최소 ${min}자 이상 입력해주세요.',
        max: '최대 ${max}자까지 입력 가능합니다.',
    },
};

const themeConfig = {
    token: {
        colorPrimary: colors.primary.main,
        colorBgContainer: colors.background.default,
        colorBorder: colors.border.light,
        borderRadius: 14,
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
    },
    components: {
        Button: {
            primaryColor: '#fff',
            colorPrimary: colors.primary.main,
        },
        Input: {
            colorBgContainer: colors.gray[50],
        },
        Tabs: {
            inkBarColor: colors.primary.main,
            horizontalItemGutter: 24,
            itemColor: colors.text.tertiary,
            itemHoverColor: colors.text.primary,
            itemSelectedColor: colors.primary.main,
            colorBorderSecondary: colors.border.light,
        },
    },
};

/**
 * AntD <Spin>(및 Table의 loading prop)의 기본 인디케이터를 우리 링 스피너로 교체.
 *
 * 2026-07 전수조사: 예전엔 CSS로 `.ant-spin-dot > i { display:none }` + `.ant-spin-dot::before`에
 * 링을 그리는 방식이었는데, 브라우저에서 실측(getComputedStyle + offsetWidth)해보니 antd 6의
 * Spin은 크기를 `.ant-spin-dot-holder`(1em x 1em)가 갖고 있고 안쪽 `.ant-spin-dot`은 자체 크기가
 * 없어서(0x0), 점 4개는 사라지지만 우리 링도 0x0이라 결국 "아무것도 안 보이는" 상태였음.
 * AntD 내부 DOM에 의존하는 CSS 해킹은 버전 업그레이드에 취약하므로 ConfigProvider가 정식 지원하는
 * spin.indicator로 대체 — 이제 <Spin>이든 Table loading이든 전부 우리 링 스피너를 그린다.
 */
const spinConfig = { indicator: <SpinIndicator /> };

function AppContent() {
    const { initializeAuth } = useAuthStore();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                await initializeAuth();
            } finally {
                setLoading(false);
            }
        };
        initAuth();
    }, [initializeAuth]);

    if (loading) return <Loading fullPage />;

    return <AppRoutes />;
}

function AppRoutes() {
    return (
        <Layout style={{ minHeight: '100vh', backgroundColor: colors.background.default }}>
            <ScrollToTop />
            <OfflineBanner />
            <Header />
            <Content>
                <Suspense fallback={<Loading fullPage />}>
                <Routes>
                    {/* 공용 페이지 */}
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/oauth2/callback" element={<OAuthCallback />} />
                    <Route path="/signup/social" element={<SocialAgreement />} />
                    <Route path="/stores" element={<StoreList />} />
                    <Route path="/store/:id" element={<StoreDetail />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />

                    {/* OWNER / ADMIN 전용 */}
                    <Route element={<PrivateRoute allowedRoles={['ADMIN', 'BUSINESS']} />}>
                        <Route path="/my-stores" element={<MyStores />} />
                        <Route path="/store/register" element={<StoreRegister />} />
                        <Route path="/store/:id/edit" element={<StoreEdit />} />
                        <Route path="/business" element={<BusinessPanel />} />
                    </Route>

                    {/* ADMIN 전용 */}
                    <Route element={<PrivateRoute allowedRoles={['ADMIN']} />}>
                        <Route path="/admin" element={<AdminPanel />} />
                    </Route>

                    {/* 로그인 유저 공통 */}
                    <Route element={<PrivateRoute />}>
                        <Route path="/my-reservations" element={<MyReservations />} />
                        <Route path="/my-favorites" element={<MyFavorites />} />
                        <Route path="/payment/result" element={<PaymentResult />} />
                        <Route path="/my-page" element={<MyPage />} />
                    </Route>
                </Routes>
                </Suspense>
            </Content>

            <AppFooter />
        </Layout>
    );
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 3,
            gcTime: 1000 * 60 * 10,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <style>{animationKeyframes}{`
                    @keyframes reserve-spin { to { transform: rotate(360deg); } }

                    @keyframes reserve-arc-dash {
                        0%   { stroke-dasharray: 1 126;  stroke-dashoffset: 0; }
                        50%  { stroke-dasharray: 90 126; stroke-dashoffset: -18; }
                        100% { stroke-dasharray: 90 126; stroke-dashoffset: -124; }
                    }

                    /* AntD 기본 로딩 아이콘(Modal.confirm 비동기 onOk, Select loading 등)만 우리 링 스피너 스타일로 통일.
                       .anticon-loading만 케이스(LoadingOutlined)로 한정 — SyncOutlined spin(새로고침 버튼 회전) 같은
                       다른 의도적 애니메이션은 .anticon-spin만 가지고 있어서 건드리지 않음.
                       2026-07 버그 수정: 예전엔 14px 고정값이라 Button(Modal.confirm OK 버튼)에서 우연히 맞았을 뿐,
                       AntD Select의 suffix 아이콘처럼 font-size가 다른 곳(예: size="large")에서는 실제 아이콘
                       슬롯 크기와 안 맞아서 스피너가 중앙에 고정 안 되고 미묘하게 밀려 보였음 — AntD 아이콘 자체가
                       쓰는 관례대로 1em 기반(현재 font-size에 상대적)으로 바꿔서 어느 컴포넌트/사이즈에 붙어도
                       실제 아이콘이 차지하던 자리와 정확히 같은 크기로 맞춰지도록 함.
                       (브라우저 실측으로 정상 동작 확인 — 2026-07 전수조사) */
                    .anticon-loading.anticon-spin {
                        visibility: hidden !important;
                        position: relative;
                        display: inline-block;
                        width: 1em; height: 1em;
                    }
                    .anticon-loading.anticon-spin::before {
                        content: '';
                        visibility: visible;
                        position: absolute;
                        inset: 0;
                        border: 0.15em solid color-mix(in srgb, currentColor 30%, transparent);
                        border-top-color: currentColor;
                        border-radius: 50%;
                        animation: reserve-spin 0.6s linear infinite;
                    }

                    /* NOTE: AntD <Spin>의 "점 4개" 인디케이터는 더 이상 CSS로 덮어쓰지 않는다.
                       (예전 .ant-spin-dot::before 해킹은 antd 6에서 .ant-spin-dot이 0x0이라 무효였음 —
                        브라우저 실측으로 확인) → ConfigProvider spin.indicator로 정식 교체함. 위 spinConfig 참고. */

                    /* ── AntD 버튼에도 우리 Button 컴포넌트와 동일한 "눌리는" 피드백 부여 (2026-07 전수조사) ──
                       우리 Button(.reserve-btn)은 :active에서 scale(0.96)+투명도로 눌리는 느낌을 주는데,
                       Modal.confirm()이나 AntD <Modal>의 기본 footer는 우리 Button이 아니라 AntD 자체
                       버튼(.ant-btn)을 쓰기 때문에 이 피드백이 전혀 없었음 — 확인/취소 모달 22곳 전부
                       해당. .reserve-btn은 자체 규칙이 있으므로 :not()으로 제외해서 중복 적용 방지.
                       (브라우저 실측으로 규칙 적용 + 셀렉터 매칭 확인 완료) */
                    .ant-btn:not(.reserve-btn) {
                        transition: transform 0.12s ease, opacity 0.12s ease, background-color 0.12s ease !important;
                    }
                    .ant-btn:not(.reserve-btn):active:not(:disabled):not(.ant-btn-loading) {
                        transform: scale(0.96);
                        opacity: 0.88;
                    }

                    /* ── 모달 취소/닫기 버튼 색상 통일 (2026-07 전수조사) ─────────────────────
                       모달의 취소 버튼이 두 가지 경로로 그려진다:
                         - 우리 Button variant="outline"  (FormModal, 사업자인증 닫기)
                         - AntD 기본 footer의 .ant-btn-default (Modal.confirm 18곳, <Modal> 4곳)
                       그런데 테두리 색과 글자색이 서로 달라서(전자는 #e5e8eb/진한 글자,
                       후자는 테마의 colorBorder=#f2f4f6) "어떤 취소는 회색, 어떤 취소는 검정"으로 보였다.
                       모달 footer의 기본 버튼만 우리 outline과 동일하게 맞춘다 — 전역 colorBorder를
                       바꾸면 Input 등 다른 컴포넌트까지 영향을 받으므로 범위를 모달로 한정함. */
                    .ant-modal-footer .ant-btn-default:not(.reserve-btn),
                    .ant-modal-confirm-btns .ant-btn-default:not(.reserve-btn) {
                        border-color: ${colors.border.default};
                        color: ${colors.text.primary};
                    }
                    .ant-modal-footer .ant-btn-default:not(.reserve-btn):hover,
                    .ant-modal-confirm-btns .ant-btn-default:not(.reserve-btn):hover {
                        border-color: #adb5bd;
                        color: ${colors.text.primary};
                        background: rgba(0,0,0,0.02);
                    }

                    /* AntD Pagination(시스템 로그/광고 관리 등 테이블 페이지 버튼)도 동일한 눌림 피드백 */
                    .ant-pagination-item:active,
                    .ant-pagination-prev:active,
                    .ant-pagination-next:active {
                        transform: scale(0.94);
                    }
                    .ant-pagination-item,
                    .ant-pagination-prev,
                    .ant-pagination-next {
                        transition: transform 0.12s ease, background-color 0.15s ease;
                    }
                `}</style>
                <ConfigProvider
                    locale={koKR}
                    theme={themeConfig}
                    spin={spinConfig}
                    form={{ validateMessages }}
                >
                    <AntApp message={{ maxCount: 3 }}>
                        <AppContent />
                    </AntApp>
                </ConfigProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

export default App;
