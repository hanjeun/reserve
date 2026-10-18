// Vite 전용 UI fixture. 실제 데이터/인증/홍보 조회수/광고 집계를 실행하지 않는다.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, ConfigProvider, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import Benefits, { BenefitsSkeleton } from '../src/pages/discovery/Benefits';
import BenefitDetail from '../src/pages/discovery/BenefitDetail';
import DiscoveryNav from '../src/components/layout/DiscoveryNav';
import { RouteSkeletonPreview } from '../src/components/layout/RouteLoadingSkeleton';
import benefitService from '../src/services/benefitService';
import storeService from '../src/services/storeService';
import favoriteService from '../src/services/favoriteService';
import adService from '../src/services/adService';
import { useWindowWidth } from '../src/hooks/useWindowWidth';
import '../src/index.css';
import './benefit-banners.css';

if (!import.meta.env.DEV) throw new Error('Design preview is development-only');
const previewParams = new URLSearchParams(window.location.search);
const previewState = previewParams.get('state') || 'success';
const previewTheme = previewParams.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = previewTheme;
const sample = { id: 1, storeId: 12, storeName: '소식 디자인 예시 가게', title: '새로운 계절, 새로운 메뉴를 소개해요', excerpt: '가게가 전하는 소식입니다. 실제 할인이나 예약 혜택이 아닙니다.', content: '소식·안내 상세 화면의 디자인 검증용 예시입니다.\n\n원문은 HTML로 해석하지 않고 텍스트 그대로 보여줍니다.\n가게의 제공 여부·적용 조건을 확인하는 링크는 상세 하단에 둡니다.', mainImageUrl: null, createdAt: '2026-09-13T10:00:00' };
const news = Array.from({ length: 25 }, (_, index) => ({ ...sample, id: index + 1, storeName: ['소식 디자인 예시 가게', '클래스 디자인 예시', '공간 디자인 예시'][index % 3], title: ['새로운 계절, 새로운 메뉴', '처음 방문하시는 분들께', '이번 클래스 운영 시간'][index % 3] }));
if (previewParams.get('long') === '1') Object.assign(news[0], { storeName: '아주 긴 가게 이름도 카드 너비를 넘지 않는 디자인 검증용 예시입니다', title: '긴 소식 제목도 실제 문구 그대로 유지하고 상세에서 전체 내용을 확인하는 디자인 검증용 예시입니다', excerpt: '긴 본문 미리보기는 한 줄만 표시하며 전체 원문은 상세 페이지에서 확인할 수 있어요.' });
const stores = ['FOOD', 'PERFORMANCE', 'POPUP', 'FOOD', 'PERFORMANCE', 'POPUP'].map((domain, index) => ({
    id: index + 1, name: ['맛집 디자인 예시', '클래스 디자인 예시', '공간 디자인 예시'][index % 3], domain,
    category: ['카페', '클래스', '대관'][index % 3], rating: 0, reviewCount: 0,
    mainImageUrl: new URL(`/images/discovery-v3/${['dining', 'class', 'popup'][index % 3]}-mobile.webp`, window.location.origin).href,
    mainImageWidth: 960, mainImageHeight: 640,
}));
benefitService.getList = async ({ page = 0, size = 12 } = {}) => {
    if (previewState === 'loading') return new Promise(() => {});
    if (previewState === 'error') throw new Error('Preview news unavailable');
    if (previewState === 'empty') return { content: [], page: { totalElements: 0, totalPages: 0 } };
    return { content: news.slice(page * size, (page + 1) * size), page: { totalElements: news.length, totalPages: Math.ceil(news.length / size) } };
};
benefitService.getDetail = async () => sample;
storeService.getStores = async ({ domain, page = 0, size = 12 } = {}) => {
    const filtered = stores.filter(store => !domain || store.domain === domain);
    return { content: filtered.slice(page * size, (page + 1) * size), page: { totalElements: filtered.length, totalPages: Math.ceil(filtered.length / size) } };
};
favoriteService.getStatus = async () => ({ isFavorite: false });
favoriteService.toggle = async () => { throw new Error('Preview mutations disabled'); };
adService.recordImpression = async () => { throw new Error('Preview tracking disabled'); };
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function PreviewHeader() {
    const width = useWindowWidth();
    const gutter = width < 360 ? 16 : width < 576 ? 20 : 24;
    return <header style={{ position: 'sticky', top: 0, height: 64, zIndex: 1000, background: 'var(--c-header-bg)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--c-border-light)' }}><div style={{ boxSizing: 'border-box', maxWidth: 1248, paddingInline: gutter, marginInline: 'auto', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}><span className="reserve-header-logo-wordmark" style={{ color: 'var(--c-primary)' }}>RESERVE</span><span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>디자인 검증 · 예시 데이터</span></div></header>;
}

createRoot(document.getElementById('root')).render(
    <ConfigProvider locale={koKR} theme={{ algorithm: previewTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm }}><App><QueryClientProvider client={client}><MemoryRouter initialEntries={['/benefits']}>
        <div className={previewParams.get('photos') === '1' ? 'reserve-benefit-preview-photos' : undefined} style={{ background: 'var(--c-bg-default)', minHeight: '100svh' }}>
            <PreviewHeader />
            <Routes><Route path="/benefits" element={<><DiscoveryNav /><Benefits /></>} /><Route path="/benefits/:id" element={<BenefitDetail />} /></Routes>
            <section style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 24 }}><h2 style={{ maxWidth: 1152, marginInline: 'auto', fontSize: 16, paddingInline: 20 }}>데이터 로딩 골격</h2><section className="reserve-benefits-page"><BenefitsSkeleton /></section></section>
            <section data-theme="dark" style={{ background: 'var(--c-bg-default)', color: 'var(--c-text-primary)' }}><h2 style={{ padding: '24px 20px 0', margin: 0, fontSize: 16 }}>페이지 청크 · 다크 골격</h2><RouteSkeletonPreview pathname="/store/register" /></section>
        </div>
    </MemoryRouter></QueryClientProvider></App></ConfigProvider>,
);
