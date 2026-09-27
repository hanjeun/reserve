import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import StoreCard from './StoreCard';
import adService from '../../services/adService';

vi.mock('../common', () => {
    const Card = ({ children, className }) => <article className={className}>{children}</article>;
    Card.Cover = ({ alt }) => <img alt={alt} />;
    return {
        Card,
        FavoriteButton: ({ appearance, preview }) => (preview
            ? <span className="favorite-preview" data-appearance={appearance} />
            : <button aria-label="즐겨찾기 추가" data-appearance={appearance} />),
    };
});
vi.mock('../../services/adService', () => ({ default: { recordImpression: vi.fn() } }));

function LocationProbe() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname}</output>;
}

describe('photo store card rating summaries', () => {
    it('renders an inert advertised preview without a destination, favorite action, or impression', () => {
        vi.mocked(adService.recordImpression).mockClear();
        const { container } = render(
            <MemoryRouter><StoreCard store={{ id: 12, name: '미리보기 가게' }} isAdvertised adId={41} preview /></MemoryRouter>,
        );
        expect(container.querySelector('.reserve-store-card-shell')).toHaveTextContent('AD');
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
        // 미리보기도 실제 카드처럼 하트 자리를 그린다(누를 수 없는 그림).
        expect(container.querySelector('.reserve-store-card-favorite .favorite-preview')).toBeTruthy();
        expect(adService.recordImpression).not.toHaveBeenCalled();
    });

    it.each([
        { rating: 0, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: 4.8, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: undefined, reviewCount: undefined, score: '0.0', count: '(0)' },
        { rating: '4.7', reviewCount: '1200', score: '4.7', count: '(1,200)' },
        { rating: 4.86, reviewCount: 2576, score: '4.9', count: '(2,576)' },
        { rating: 'invalid', reviewCount: 3, score: '0.0', count: '(3)' },
    ])('renders the same star, one-decimal rating and parenthesized count: %j', values => {
        const { container } = render(<MemoryRouter><StoreCard store={{ id: 12, name: '가게', ...values }} /></MemoryRouter>);
        expect(screen.getByText(values.score)).toBeInTheDocument();
        expect(screen.getByText(values.count)).toBeInTheDocument();
        expect(container.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
        expect(screen.queryByText('아직 리뷰가 없어요')).toBeNull();
        expect(container).not.toHaveTextContent('NaN');
        expect(screen.getByRole('link', { name: '가게 상세 보기' })).toHaveAttribute('href', '/store/12');
    });

    it('places the heart beside the title and plain identity text before the rating', () => {
        const { container } = render(
            <MemoryRouter>
                <StoreCard
                    store={{ id: 12, name: '가게', category: '한식', latitude: 37.5, longitude: 127 }}
                    userLocation={{ latitude: 37.5, longitude: 127 }}
                    isAdvertised
                />
            </MemoryRouter>,
        );

        const titleLine = container.querySelector('.reserve-store-card-title-line');
        const info = container.querySelector('.reserve-store-card-info');
        const identity = info.querySelector('.reserve-store-identity-text');
        expect(titleLine).toHaveTextContent('가게');
        expect(titleLine.querySelector('.reserve-store-card-favorite')).toBeTruthy();
        expect(identity).toHaveTextContent('한식AD광고우리동네');
        expect(identity.querySelector('.reserve-store-identity-text-ad')).toHaveTextContent('광고');
        expect(identity.querySelector('[style*="background"]')).toBeNull();
        expect(titleLine.nextElementSibling).toBe(identity);
        expect(identity.nextElementSibling).toHaveClass('reserve-store-card-rating');
        expect(screen.getByRole('heading', { name: '가게' })).toBeInTheDocument();
        const details = screen.getByRole('link', { name: '가게 상세 보기' });
        const favorite = screen.getByRole('button', { name: '즐겨찾기 추가' });
        expect(details.contains(favorite)).toBe(false);
        expect(favorite.parentElement).toHaveClass('reserve-store-card-favorite');
        expect(favorite).toHaveAttribute('data-appearance', 'plain');
    });

    it('keeps details and favorites as distinct keyboard and click targets', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/stores']}>
                <StoreCard store={{ id: 12, name: '가게' }} />
                <LocationProbe />
            </MemoryRouter>,
        );
        const details = screen.getByRole('link', { name: '가게 상세 보기' });
        const favorite = screen.getByRole('button', { name: '즐겨찾기 추가' });
        await user.tab();
        expect(details).toHaveFocus();
        await user.tab();
        expect(favorite).toHaveFocus();
        await user.click(favorite);
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/stores');
        await user.click(details);
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/store/12');
    });
});
