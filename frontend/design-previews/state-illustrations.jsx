import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PaymentResult from '../src/pages/payment/PaymentResult';
import StateIllustrationGallery from './StateIllustrationGallery';
import useAuthStore from '../src/store/useAuthStore';
import paymentService from '../src/services/paymentService';
import '../src/index.css';

if (!import.meta.env.DEV) throw new Error('State preview is development-only');
const state = new URLSearchParams(window.location.search).get('state') || 'gallery';
document.documentElement.dataset.theme = 'light';
// 격리된 개발 진입점에서는 로그인·결제·API를 합성 데이터로 대체한다.
useAuthStore.setState({ user: { id: 1, role: 'MEMBER', name: '미리보기' }, isLoggedIn: true });
paymentService.getStatus = async (type, merchantUid) => ({
    type, merchantUid, status: state === 'success' ? 'PAID' : 'FAILED',
    amount: 10000, payMethod: 'PaymentMethodCard',
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')).render(
    <ConfigProvider locale={koKR} theme={{ token: { colorPrimary: '#3182f6', fontFamily: 'inherit' } }}>
        <AntApp><QueryClientProvider client={client}>
            <MemoryRouter initialEntries={['/payment/result?type=reservation&merchant_uid=PREVIEW-ONLY']}>
                <header style={{ height: 64, borderBottom: '1px solid var(--c-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 32 }}>
                    <span className="reserve-header-logo-wordmark" style={{ color: 'var(--c-primary)' }}>RESERVE</span>
                    <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>아이콘 미리보기 · 예시 결제 정보</span>
                </header>
                {state === 'gallery' ? <StateIllustrationGallery /> : <PaymentResult />}
            </MemoryRouter>
        </QueryClientProvider></AntApp>
    </ConfigProvider>,
);
