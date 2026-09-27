import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoreListRow from './StoreListRow';
import { getThumbnailUrl } from '../../utils';
import adService from '../../services/adService';

const favoriteToggle = vi.hoisted(() => vi.fn());
vi.mock('../common/FavoriteButton', () => ({
    default: ({ storeId, size, appearance, preview }) => (preview
        ? <span className="favorite-preview" data-store-id={storeId} data-appearance={appearance} />
        : <button type="button" aria-label="즐겨찾기 추가" data-store-id={storeId} data-size={size} data-appearance={appearance} onClick={favoriteToggle} />
    ),
}));
vi.mock('../../services/adService', () => ({ default: { recordImpression: vi.fn() } }));

const store = {
    id: 12,
    name: '예약 식당',
    description: '계절 재료로 준비하는 한 끼',
    category: '한식',
    mainImageUrl: '/uploads/restaurant.jpg',
    rating: 4.86,
    reviewCount: 2576,
    latitude: 37.5,
    longitude: 127,
};

function LocationProbe() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname}</output>;
}

function renderRow(props = {}) {
    return render(
        <MemoryRouter initialEntries={['/stores']}>
            <StoreListRow store={store} {...props} />
            <LocationProbe />
        </MemoryRouter>,
    );
}

describe('StoreListRow', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders an inert advertised preview without a destination, favorite action, or impression', () => {
        const { container } = renderRow({ isAdvertised: true, adId: 41, preview: true });
        expect(container.querySelector('.reserve-store-list-row')).toHaveTextContent('AD');
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
        expect(container.querySelector('.reserve-store-list-row-favorite .favorite-preview')).toBeTruthy();
        expect(adService.recordImpression).not.toHaveBeenCalled();
    });

    it('orders the actual name, description, rating/count and category next to a square thumbnail', () => {
        const { container } = renderRow();
        const article = screen.getByRole('article');
        const link = screen.getByRole('link', { name: '예약 식당 상세 보기' });
        expect(article).toHaveClass('reserve-store-list-row');
        expect(link).toHaveAttribute('href', '/store/12');
        expect(link).toHaveClass('reserve-store-list-row-link');
        const image = screen.getByRole('img', { name: '예약 식당 대표 이미지' });
        expect(image.parentElement).toHaveClass('reserve-store-list-row-image');
        expect(image).toHaveAttribute('src', getThumbnailUrl(store.mainImageUrl));
        expect(image).toHaveAttribute('width', '160');
        expect(image).toHaveAttribute('height', '160');
        expect(image).toHaveAttribute('loading', 'lazy');
        expect(image).toHaveAttribute('decoding', 'async');
        const body = container.querySelector('.reserve-store-list-row-body');
        expect([...body.children].map((child) => child.className)).toEqual([
            'reserve-store-list-row-title-line',
            'reserve-store-list-row-description',
            'reserve-store-list-row-meta',
        ]);
        expect(body.querySelector('.reserve-store-list-row-title-line .reserve-store-list-row-name')).toHaveTextContent(store.name);
        expect(screen.getByText('4.9')).toBeInTheDocument();
        expect(screen.getByText('(2,576)')).toBeInTheDocument();
        expect(screen.getByText('한식').parentElement).toHaveClass('reserve-store-identity-text');
        expect(screen.getByText('한식').closest('.reserve-store-list-row-meta')).not.toBeNull();
        expect(container.querySelector('.reserve-store-list-row-rating svg').closest('[aria-hidden="true"]')).toBeTruthy();
    });

    it('keeps the native favorite button outside the details link and does not navigate when favoriting', async () => {
        const user = userEvent.setup();
        renderRow();
        const link = screen.getByRole('link', { name: '예약 식당 상세 보기' });
        const favorite = screen.getByRole('button', { name: '즐겨찾기 추가' });
        expect(link.contains(favorite)).toBe(false);
        expect(favorite.parentElement).toHaveClass('reserve-store-list-row-favorite');
        expect(favorite).toHaveAttribute('data-store-id', '12');
        expect(favorite).toHaveAttribute('data-size', 'md');
        expect(favorite).toHaveAttribute('data-appearance', 'plain');
        await user.click(favorite);
        expect(favoriteToggle).toHaveBeenCalledOnce();
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/stores');
        await user.click(link);
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/store/12');
    });

    it('offers distinct keyboard targets for details and favorites', async () => {
        const user = userEvent.setup();
        renderRow();
        await user.tab();
        expect(screen.getByRole('link', { name: '예약 식당 상세 보기' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: '즐겨찾기 추가' })).toHaveFocus();
    });

    it('uses existing image fallback for missing images and switches a failed image only once', () => {
        const { rerender } = renderRow({ store: { ...store, mainImageUrl: null } });
        const image = screen.getByRole('img', { name: '예약 식당 대표 이미지' });
        expect(image).toHaveAttribute('src', getThumbnailUrl());
        rerender(<MemoryRouter><StoreListRow store={store} /></MemoryRouter>);
        const loadedImage = screen.getByRole('img', { name: '예약 식당 대표 이미지' });
        expect(loadedImage).toHaveAttribute('src', getThumbnailUrl(store.mainImageUrl));
        fireEvent.error(loadedImage);
        expect(loadedImage).toHaveAttribute('src', getThumbnailUrl());
        const setter = vi.spyOn(loadedImage, 'src', 'set');
        fireEvent.error(loadedImage);
        expect(setter).not.toHaveBeenCalled();
        setter.mockRestore();
    });

    it('does not invent a description and uses neutral name/category fallbacks', () => {
        const { container } = renderRow({ store: { id: 'draft' } });
        expect(screen.getByRole('link', { name: '가게 상세 보기' })).toHaveAttribute('href', '/store/draft');
        expect(screen.getByText('기타')).toBeInTheDocument();
        expect(screen.getByText('0.0')).toBeInTheDocument();
        expect(screen.getByText('(0)')).toBeInTheDocument();
        expect(container.querySelector('.reserve-store-list-row-description')).toBeNull();
        expect(container.querySelector('.reserve-store-identity-text')).toHaveTextContent('기타');
    });

    it('formats valid API number strings without displaying a fictitious zero rating', () => {
        renderRow({ store: { ...store, rating: '4.7', reviewCount: '1200' } });
        expect(screen.getByText('4.7')).toBeInTheDocument();
        expect(screen.getByText('(1,200)')).toBeInTheDocument();
        expect(screen.queryByText('아직 리뷰가 없어요')).toBeNull();
    });

    it.each([
        { rating: 0, reviewCount: 0, count: 0 },
        { rating: 4.5, reviewCount: 0, count: 0 },
        { rating: undefined, reviewCount: 3, count: 3 },
        { rating: null, reviewCount: 3, count: 3 },
        { rating: '', reviewCount: 3, count: 3 },
        { rating: ' ', reviewCount: 3, count: 3 },
        { rating: 'invalid', reviewCount: 3, count: 3 },
        { rating: Infinity, reviewCount: 3, count: 3 },
        { rating: -1, reviewCount: 3, count: 3 },
        { rating: 6, reviewCount: 3, count: 3 },
        { rating: 4.5, reviewCount: -3, count: 0 },
        { rating: 4.5, reviewCount: 1.5, count: 0 },
    ])('shows a safe numeric summary for absent or invalid rating/count data: %j', (values) => {
        const { container } = renderRow({ store: { ...store, ...values } });
        expect(screen.getByText('0.0')).toBeInTheDocument();
        expect(screen.getByText(`(${values.count})`)).toBeInTheDocument();
        expect(container.querySelector('.reserve-store-list-row-rating')).not.toBeNull();
        expect(screen.queryByText('아직 리뷰가 없어요')).toBeNull();
        expect(screen.queryByText('NaN')).toBeNull();
    });

    it('shows nearby as plain identity text for an existing supplied location', () => {
        const { container } = renderRow({ userLocation: { latitude: 37.5, longitude: 127 } });
        expect(screen.getByText('우리동네')).toBeInTheDocument();
        expect(screen.getByText('우리동네').parentElement).toHaveClass('reserve-store-identity-text');
        expect(container.querySelector('.reserve-store-identity-text').parentElement).toHaveClass('reserve-store-list-row-meta');
        expect(container.querySelector('.reserve-store-list-row-title-line')).not.toHaveTextContent('우리동네');
        expect(container.querySelector('.reserve-store-list-row-body')).toHaveClass('reserve-store-list-row-body');
    });

    it.each([
        { userLocation: undefined },
        { userLocation: { latitude: 37.5, longitude: 127 }, store: { ...store, nearbyRadiusKm: 0 } },
        { userLocation: { latitude: 35, longitude: 127 } },
    ])('does not create nearby text without an eligible saved location', (props) => {
        renderRow(props);
        expect(screen.queryByText('우리동네')).toBeNull();
    });

    it('shows advertised and nearby as plain text and preserves impression effect semantics', () => {
        const props = { store, userLocation: { latitude: 37.5, longitude: 127 }, isAdvertised: true, adId: 41 };
        const { rerender } = renderRow(props);
        // 화면에는 AD, 화면 낭독기에는 '광고' (AdMark)
        const adMark = screen.getByText('AD').parentElement;
        expect(adMark).toHaveClass('reserve-ad-mark', 'reserve-store-identity-text-ad');
        expect(screen.getByText('광고')).toHaveClass('reserve-sr-only');
        expect(screen.getByText('우리동네')).toBeInTheDocument();
        expect(adMark.parentElement).toHaveClass('reserve-store-identity-text');
        expect(adMark.parentElement).toHaveTextContent('한식AD광고우리동네');
        expect(adMark.parentElement.parentElement).toHaveClass('reserve-store-list-row-meta');
        expect(adService.recordImpression).toHaveBeenCalledExactlyOnceWith(41);
        rerender(<MemoryRouter><StoreListRow {...props} store={{ ...store, name: '이름 수정' }} /></MemoryRouter>);
        expect(adService.recordImpression).toHaveBeenCalledTimes(1);
        rerender(<MemoryRouter><StoreListRow {...props} adId={42} /></MemoryRouter>);
        expect(adService.recordImpression).toHaveBeenCalledTimes(2);
        expect(adService.recordImpression).toHaveBeenLastCalledWith(42);
    });

    it.each([
        { isAdvertised: false, adId: 41 },
        { isAdvertised: true, adId: undefined },
    ])('does not record impressions without both advertisement status and id', (props) => {
        renderRow(props);
        expect(adService.recordImpression).not.toHaveBeenCalled();
    });
});
