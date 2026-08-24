import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout, ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import useAuthStore from './store/useAuthStore';
import { colors, rawColors, animationKeyframes, field, fieldPx } from './styles/tokens';
import useTheme from './hooks/useTheme';
import useImagePreviewSwipe from './hooks/useImagePreviewSwipe';

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
// 인앱 채팅 런처 — 로그인 상태에서만 스스로 렌더한다(컴포넌트 안에서 판단).
// 라우트마다 붙이지 않고 레이아웃에 한 번만 둔다 — 붙이는 걸 잊는 페이지가 생기면
// "어떤 화면에서는 문의가 안 되는" 상태가 된다.
import ChatLauncher from './components/chat/ChatLauncher';
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

/**
 * AntD 테마 설정.
 *
 * ★ 여기서는 `colors`(= var(--c-...) 문자열)를 쓰면 안 되고 `rawColors`(실제 hex)를 써야 한다.
 *   AntD는 colorPrimary 하나로 hover/active/disabled 등 10단계 파생색을 **색 연산으로 만든다**.
 *   'var(--c-primary, #3182f6)' 같은 문자열은 파싱이 안 돼 파생색이 전부 깨진다.
 *   (CSS 변수는 브라우저가 페인트 때 해석하지만, AntD의 계산은 JS에서 먼저 일어난다)
 *
 * 그래서 AntD 쪽은 CSS 변수로 자동 전환되지 않는다 → darkAlgorithm으로 별도 전환한다.
 * 우리 컴포넌트(= colors 토큰 사용)는 CSS 변수로 알아서 따라간다. 두 계층이 나뉘어 있는 셈이다.
 *
 * fontFamily도 var(--app-font)를 못 쓴다(AntD가 내부적으로 문자열을 조작하는 곳이 있다).
 * 대신 전역 CSS에서 body/:root에 --app-font를 걸어두었고, AntD 컴포넌트는 상속으로 따라온다.
 */
/**
 * @param isDark   다크 모드인지
 * @param accent   사용자가 고른 포인트 색의 **리터럴 hex** (useTheme 의 accentColors).
 *                 AntD 토큰은 CSS 변수를 못 받는다 — AntD 가 JS 로 파생색을 계산하기 때문이다.
 *                 그래서 CSS 쪽(--c-primary)과 여기(colorPrimary)를 각각 넣어야 하고,
 *                 둘 다 같은 출처(ACCENT_OPTIONS)에서 나오므로 어긋나지 않는다.
 */
const buildThemeConfig = (isDark, accent) => ({
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
        colorPrimary: accent.main,
        colorBgContainer: isDark ? '#1e2126' : '#ffffff',
        colorBorder: isDark ? '#2d3138' : rawColors.gray[100],
        borderRadius: fieldPx(field.radius),
        // 2026-08-04 — AntD 기본 에러색(#ff4d4f)과 이 프로젝트 색(#f04452)이 달라서
        // "AntD Form.Item 이 그린 빨강"과 "FormField 가 그린 빨강"이 미묘하게 다른 색이었다.
        // 여기서 한 번 맞추면 Form 검증 메시지·에러 상태 테두리·경고 아이콘까지 전부 따라온다.
        // rawColors 를 쓰는 이유: ConfigProvider 토큰은 AntD 가 JS 로 파생색(hover/알파)을 계산하므로
        // var(--c-error) 같은 CSS 값을 넣으면 계산에 실패한다(리터럴이어야 한다).
        // 값의 출처는 styles/theme.css 의 --c-error / --c-warning (라이트 :root, 다크 [data-theme=dark]).
        // 그 파일을 고치면 여기도 함께 고쳐야 한다 — CSS 변수를 못 쓰는 자리라 중복이 불가피하다.
        colorError:   isDark ? '#ff6b76' : '#f04452',
        colorWarning: isDark ? '#ffc633' : '#ffb800',
        // 다크에서 placeholder·비활성 글자를 AntD 기본값보다 밝게 올린다.
        // 기본값은 라이트/다크 모두 25% 알파인데, 흰 배경 위의 25% 검정은 잘 보이는 반면
        // 어두운 배경(#1a1d21) 위의 25% 흰색은 사실상 어두운 회색으로 보인다 —
        // "날짜 선택", "날짜를 먼저 선택해주세요"가 검게 보인다는 증상의 실제 원인이었다.
        // 라이트는 기존 AntD 기본값을 그대로 명시해 변화가 없도록 한다.
        colorTextPlaceholder: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.25)',
        colorTextDisabled:    isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(0, 0, 0, 0.25)',
        // 'inherit' — 글꼴 옵션이 동작하려면 여기서 특정 폰트를 박으면 안 된다.
        // 예전엔 Pretendard를 하드코딩해서 AntD가 모든 .ant-* 요소에 그 font-family를 주입했고,
        // 그래서 마이페이지에서 '명조'를 골라도 AntD 컴포넌트는 그대로 프리텐다드였다.
        // inherit면 body의 var(--app-font)를 그대로 물려받는다.
        fontFamily: 'inherit',
    },
    components: {
        Button: {
            primaryColor: '#fff',
            colorPrimary: accent.main,
        },
        Input: {
            colorBgContainer: isDark ? '#23262b' : rawColors.gray[50],
        },
        // Select는 다른 폼 컨트롤과 **같은 gray[50]**이어야 한다.
        // FormInput·FormTextArea·FormDatePicker·FormTimePicker가 전부
        // `disabled ? gray[100] : gray[50]`을 쓴다 — 이게 이 프로젝트의 채움형(filled) 입력 규칙이다.
        // 한때 "흰 배경에서 롤러가 안 보인다"고 gray[100]으로 올렸는데, 그러면 Select만 다른 톤이 되어
        // 같은 폼 안에서 입력칸끼리 색이 어긋난다. 옅게 보이는 건 채움형 입력의 의도된 특성이다
        // (토스 계열 UI의 관례 — 테두리 대신 아주 옅은 면으로 입력 영역을 암시).
        // 더 진하게 갈 거면 Select만이 아니라 5개 전부를 함께 바꾸는 디자인 시스템 결정이어야 한다.
        Select: {
            colorBgContainer: isDark ? '#23262b' : rawColors.gray[50],
            colorBgElevated: isDark ? '#1e2126' : '#ffffff',   // 드롭다운 패널
            optionSelectedBg: isDark ? '#2d3138' : rawColors.gray[200],
        },
        // Card의 actions(가게 카드 하단 수정/삭제 줄)는 전용 토큰(actionsBg)을 쓴다.
        // 전역 colorBgContainer를 따라가지 않아서, 다크에서 이 줄만 흰 띠로 남아 있었다.
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
});

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
            <ChatLauncher />
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
    // 우리 컴포넌트 색은 CSS 변수라 자동으로 따라오지만, AntD는 JS로 파생색을 계산하므로
    // 여기서 resolvedTheme을 읽어 algorithm을 갈아끼워야 한다(buildThemeConfig 주석 참고).
    // accentColors 는 지금 테마에 맞는 **리터럴 hex** 다(useTheme 참고).
    // CSS 쪽은 --c-primary 로 이미 바뀌어 있고, AntD 쪽만 여기서 따로 먹여준다.
    const { resolvedTheme, accentColors } = useTheme();
    // 이미지 프리뷰 좌우 스와이프 — 전역 1회 설치.
    // 프리뷰를 여는 경로가 두 가지(useImagePreview 훅 / PreviewGroup 직접 사용)라
    // 어느 한쪽 state 에 묶으면 반쪽만 동작한다. DOM 을 기준으로 붙는다.
    useImagePreviewSwipe();
    const themeConfig = useMemo(
        () => buildThemeConfig(resolvedTheme === 'dark', accentColors),
        // accentColors 는 **안정 참조**다 — useTheme 이 모듈 상수 ACCENT_OPTIONS 안의
        // light/darkMode 객체를 그대로 돌려주므로, 색이 바뀌지 않으면 같은 객체가 온다.
        // 그래서 객체를 그대로 deps 에 넣어도 불필요한 재생성이 없다.
        //
        // ★ accentColors.main 처럼 **속성**을 deps 에 쓰면 안 된다.
        //   이 프로젝트의 ESLint 에 react-hooks/preserve-manual-memoization 이 켜져 있어
        //   "추론된 의존성(accentColors)보다 덜 구체적인 속성을 적었다"며 에러가 나고,
        //   React Compiler 가 이 컴포넌트 최적화를 **건너뛴다**(실제로 그렇게 lint 를 깨뜨렸다).
        [resolvedTheme, accentColors]
    );

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
