import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoreIdentity, StoreInfoSection } from './StoreDetail';

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

describe('store operating schedule information', () => {
    it.each(['SLOT', 'SESSION', 'DAY'])('shows schedule rows in the shared PC/mobile information section for %s', bookingType => {
        render(<StoreInfoSection store={{ bookingType, openTime: '09:00', closeTime: '18:00', openDate: '2026-09-01', closeDate: '2026-12-31', closedDays: [6, 7], maxAdvanceBookingDays: 30 }} />);
        expect(screen.getByText('영업 시간')).toBeInTheDocument();
        expect(screen.getByText('운영 기간')).toBeInTheDocument();
        expect(screen.getByText('2026-09-01 ~ 2026-12-31')).toBeInTheDocument();
        expect(screen.getByText('정기 휴무')).toBeInTheDocument();
        expect(screen.getByText('매주 토·일 휴무')).toBeInTheDocument();
        expect(screen.getByText('30일 이내만 예약 가능')).toBeInTheDocument();
    });

    it.each([
        [{ openDate: '2026-10-01' }, '2026-10-01부터 운영'],
        [{ closeDate: '2026-12-31' }, '2026-12-31까지 운영'],
    ])('keeps one-sided operating periods visible: %j', (store, value) => {
        render(<StoreInfoSection store={store} />);
        expect(screen.getByText(value)).toBeInTheDocument();
    });

    it.each([undefined, Number.NaN, -1, 0])('omits unspecified schedule rows for an invalid advance range: %s', maxAdvanceBookingDays => {
        render(<StoreInfoSection store={{ description: '기존 소개', closedDays: [], maxAdvanceBookingDays }} />);
        expect(screen.queryByText('운영 기간')).toBeNull();
        expect(screen.queryByText('정기 휴무')).toBeNull();
        expect(screen.queryByText('예약 범위')).toBeNull();
    });
});
