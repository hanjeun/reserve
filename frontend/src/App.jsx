import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout, ConfigProvider, App as AntApp } from 'antd';
import koKR from 'antd/locale/ko_KR';
import useAuthStore from './store/useAuthStore.js';
import { colors, animationKeyframes } from './styles/tokens';

import Home from './pages/Home';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import OAuthCallback from './pages/auth/OAuthCallback';
import StoreList from './pages/store/StoreList';
import StoreDetail from './pages/store/StoreDetail';
import StoreRegister from './pages/store/StoreRegister';
import StoreEdit from './pages/store/StoreEdit';
import MyStores from './pages/store/MyStores.jsx';
import MyReservations from './pages/reservation/MyReservations';
import BusinessPanel from './pages/business/BusinessPanel';
import MyPage from './pages/member/MyPage';
import MyFavorites from './pages/favorite/MyFavorites';
import PaymentResult from './pages/payment/PaymentResult';
import AdminPanel from './pages/admin/AdminPanel';
import Header from './components/layout/Header';
import AppFooter from './components/layout/Footer';
import Terms from './pages/legal/Terms';
import SocialAgreement from './pages/auth/SocialAgreement';
import Privacy from './pages/legal/Privacy';
import Loading from './components/common/Loading';
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
        <Layout style={{ minHeight: '100dvh', backgroundColor: colors.background.default }}>
            <ScrollToTop />
            <Header />
            <Content>
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
                `}</style>
                <ConfigProvider
                    locale={koKR}
                    theme={themeConfig}
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
