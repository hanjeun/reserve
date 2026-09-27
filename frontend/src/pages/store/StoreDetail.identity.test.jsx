import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoreIdentity } from './StoreDetail';

vi.mock('../../api/axios', () => ({ default: {} }));
vi.mock('../../components/common', () => ({
    Button: ({ children }) => <button>{children}</button>,
    Badge: ({ children }) => <span>{children}</span>,
    PageContainer: () => null, FormTextArea: () => null,
    FavoriteButton: ({ appearance }) => <button type="button" aria-label="즐겨찾기 추가" data-appearance={appearance}>♥</button>,
    KakaoMap: () => null, StoreDetailSkeleton: () => null, Bone: () => null,
}));
vi.mock('../../components/store', () => ({ BookingCalendar: () => null }));
vi.mock('../../components/review', () => ({ ReviewList: () => null }));
vi.mock('../../hooks', () => ({
    useStoreData: vi.fn(), useMessage: vi.fn(), usePayment: vi.fn(), useWindowWidth: vi.fn(),
    useStoreDetailActions: vi.fn(), useStoreImageHint: vi.fn(),
}));

describe('store detail identity rating', () => {
    it('puts favorite, chat and registered phone actions beside the title without covering the description', () => {
        const { container } = render(<StoreIdentity store={{ id: 31, name: '가게', category: '맛집', keywords: ['주차'], description: '소개', phone: '02-1234-5678' }} nearby canContact onContact={() => {}} />);
        const identity = container.querySelector('.reserve-store-identity');
        expect(Array.from(identity.children).map(child => child.className)).toEqual([
            'reserve-store-identity-title-row',
            'reserve-store-identity-rating',
            'reserve-store-identity-summary',
            'reserve-store-identity-tags',
        ]);
        expect(identity).not.toHaveClass('reserve-store-identity--has-contact-actions');
        expect(identity.querySelector('.reserve-store-identity-actions').parentElement).toHaveClass('reserve-store-identity-title-row');
        expect(identity.querySelector('.reserve-store-identity-actions [aria-label="즐겨찾기 추가"]')).toHaveAttribute('data-appearance', 'plain');
        expect(identity.querySelector('.reserve-store-identity-text')).toHaveTextContent('맛집우리동네');
        expect(identity.querySelector('.reserve-store-identity-summary')).toHaveTextContent('맛집우리동네·소개');
        expect(identity.querySelector('.reserve-store-identity-tags')).toHaveTextContent('주차');
        expect(screen.getByRole('button', { name: '가게에 채팅 문의하기' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '가게에 전화하기 02-1234-5678' })).toHaveAttribute('href', 'tel:0212345678');
    });

    it('does not show a dead phone action when the store has no registered number', () => {
        render(<StoreIdentity store={{ id: 32, name: '가게' }} canContact onContact={() => {}} />);
        expect(screen.getByRole('button', { name: '가게에 채팅 문의하기' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /전화하기/ })).toBeNull();
    });

    it.each([
        { rating: 0, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: 4.8, reviewCount: 0, score: '0.0', count: '(0)' },
        { rating: undefined, reviewCount: undefined, score: '0.0', count: '(0)' },
        { rating: '4.7', reviewCount: '1200', score: '4.7', count: '(1,200)' },
        { rating: 'invalid', reviewCount: 3, score: '0.0', count: '(3)' },
    ])('shows the same zero-safe star and count in the PC/mobile shared identity: %j', values => {
        const { container } = render(<StoreIdentity store={{ name: '가게', ...values }} />);
        const summary = container.querySelector('.reserve-store-identity-rating');
        expect(summary).toHaveTextContent(`${values.score}${values.count}`);
        expect(summary.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
        expect(summary).not.toHaveTextContent('NaN');
        expect(screen.queryByText('아직 리뷰가 없어요')).toBeNull();
    });
});
