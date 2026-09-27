import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Benefits from './Benefits';
import BenefitDetail from './BenefitDetail';
import benefitService from '../../services/benefitService';
import { BENEFIT_IMAGE_FALLBACK, getBenefitImageUrl } from './benefitPresentation';

vi.mock('../../services/benefitService', () => ({ default: { getList: vi.fn(), getDetail: vi.fn() } }));
vi.mock('./BenefitStoreDiscovery', () => ({ default: () => <section id="benefit-stores" aria-label="일반 가게 탐색" /> }));
const item = { id: 1, storeId: 12, storeName: '가게 이름', title: '신메뉴 안내', excerpt: '가게의 새 소식', content: '<img src=x onerror="window.hacked=true">\n<script>alert(1)</script>', mainImageUrl: 'https://tracker.example/photo.png', createdAt: '2026-09-13T10:00:00' };
const StoreRouteProbe = () => {
    const location = useLocation();
    return <output data-testid="store-route">{location.pathname}{location.search}</output>;
};
const renderPage = (path = '/benefits') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path="/benefits" element={<Benefits />} /><Route path="/benefits/:id" element={<BenefitDetail />} /><Route path="/stores" element={<StoreRouteProbe />} /></Routes></MemoryRouter></QueryClientProvider>);

describe('public store news and benefit guidance', () => {
    beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn(); });
    it('shows only actual photo news banners beneath an accessible hidden benefits title', async () => {
        benefitService.getList.mockResolvedValue({ content: [item], page: { totalElements: 1 } });
        renderPage();
        const title = screen.getByRole('heading', { level: 1, name: '혜택' });
        expect(title).toHaveClass('reserve-discovery-visually-hidden');
        expect(title.querySelector('br')).toBeNull();
        const news = screen.getByRole('region', { name: '가게 소식' });
        expect(news).toHaveAttribute('id', 'benefit-news');
        expect(document.querySelector('#benefit-stores')).toBeNull();
        expect(screen.queryByRole('navigation', { name: '소식과 가게 탐색' })).toBeNull();
        expect(document.querySelector('.reserve-benefits-campaign, .reserve-benefits-campaign-art')).toBeNull();
        const link = await within(news).findByRole('link', { name: '가게 이름 · 신메뉴 안내 소식 보기' });
        expect(within(link).getByRole('heading', { level: 2, name: item.storeName })).toBeInTheDocument();
        expect(link.querySelector('.reserve-benefit-ticket')).toHaveTextContent(item.title);
        expect(link.querySelector('p')).toHaveTextContent(item.excerpt);
        expect(link.querySelector('time')).toBeNull();
        expect(within(news).getAllByRole('link')).toHaveLength(1);
        expect(screen.queryByText(/개 소식|쿠폰 발급·사용 기능/)).toBeNull();
    });
    it('offers the existing general store route only from the concise genuinely empty state', async () => {
        benefitService.getList.mockResolvedValue({ content: [], page: { totalElements: 0 } });
        renderPage('/benefits?page=2&domain=SPORTS&sort=recent&storePage=3');
        await screen.findByText('아직 등록된 가게 소식이 없어요.');
        await waitFor(() => expect(benefitService.getList).toHaveBeenCalledWith({ page: 0, size: 12 }, expect.any(AbortSignal)));
        const link = await screen.findByRole('link', { name: '가게 둘러보기' });
        expect(link).toHaveAttribute('href', '/stores');
        expect(document.querySelector('.reserve-benefits-empty img')).toBeNull();
        fireEvent.click(link);
        expect(await screen.findByTestId('store-route')).toHaveTextContent('/stores');
        expect(benefitService.getDetail).not.toHaveBeenCalled();
    });
    it('shows skeleton until the real list resolves, then navigates to the detail', async () => {
        benefitService.getList.mockResolvedValue({ content: [item], page: { totalElements: 1 } });
        benefitService.getDetail.mockResolvedValue(item);
        renderPage();
        const loading = screen.getByRole('status', { name: '가게 소식을 불러오는 중' });
        expect(loading).toBeInTheDocument();
        expect(loading.querySelectorAll('.reserve-benefit-row--skeleton')).toHaveLength(6);
        const link = await screen.findByRole('link', { name: '가게 이름 · 신메뉴 안내 소식 보기' });
        expect(link).toHaveAttribute('href', '/benefits/1');
        fireEvent.click(link);
        expect(await screen.findByRole('heading', { name: '신메뉴 안내' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '가게 보기 →' })).toHaveAttribute('href', '/store/12');
        expect(document.querySelector('.reserve-benefit-detail-content').textContent).toBe(item.content);
        expect(document.querySelector('.reserve-benefit-detail-content script, .reserve-benefit-detail-content img')).toBeNull();
        expect(screen.getByRole('img', { name: '가게 사진이 등록되지 않았습니다' })).toHaveAttribute('src', BENEFIT_IMAGE_FALLBACK);
    });
    it('reads the requested page and Spring Boot nested page total', async () => {
        benefitService.getList.mockResolvedValue({ content: [item], page: { totalElements: 25 } });
        renderPage('/benefits?page=2');
        expect(await screen.findByRole('link', { name: '가게 이름 · 신메뉴 안내 소식 보기' })).toBeInTheDocument();
        expect(screen.queryByText('25개 소식')).toBeNull();
        expect(benefitService.getList).toHaveBeenCalledWith({ page: 1, size: 12 }, expect.any(AbortSignal));
        expect(screen.getByRole('navigation', { name: '가게 소식 페이지' })).toBeInTheDocument();
    });
    it('distinguishes a genuinely empty list from a failed API and permits retry', async () => {
        benefitService.getList.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ content: [], page: { totalElements: 0 } });
        renderPage();
        expect(await screen.findByText('가게 소식을 불러오지 못했어요.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByText('아직 등록된 가게 소식이 없어요.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /쿠폰/ })).toBeNull();
    });
    it('rejects invalid detail IDs without sending a request', async () => {
        renderPage('/benefits/invalid');
        expect(screen.getByText('현재 공개된 가게 소식이 아니에요.')).toBeInTheDocument();
        expect(benefitService.getDetail).not.toHaveBeenCalled();
    });
    it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'https://cdn.reserve.it.kr.evil.test/photo', '//evil.test/x', '/uploads/../admin', 'https://evil.test/photo'])('does not fetch an arbitrary image: %s', url => {
        expect(getBenefitImageUrl(url)).toBe(BENEFIT_IMAGE_FALLBACK);
    });
    it('allows only owned CDN photos and the local upload path', () => {
        expect(getBenefitImageUrl('https://cdn.reserve.it.kr/stores/photo.png')).toBe('https://cdn.reserve.it.kr/stores/photo.png');
        expect(getBenefitImageUrl('/uploads/photo.png')).toMatch(/\/uploads\/photo.png$/);
    });
});
