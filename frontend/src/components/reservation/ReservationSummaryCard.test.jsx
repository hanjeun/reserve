import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ReservationSummaryCard from './ReservationSummaryCard';

const reservation = {
    id: 7,
    storeName: '테스트 가게',
    storeMainImageUrl: '',
    depositAmount: 10000,
    depositPaid: true,
    status: 'CONFIRMED',
    reservationCode: 'R-20260917-ABCD',
    reservationDate: '2026-09-20',
    reservationTime: '14:00:00',
    memberName: '예약자',
    guestCount: 2,
};

describe('ReservationSummaryCard', () => {
    it('uses the shared card action bar and keeps detail and actions as separate targets', async () => {
        const user = userEvent.setup();
        const openDetail = vi.fn();
        const firstAction = vi.fn();
        const secondAction = vi.fn();
        const thirdAction = vi.fn();
        const { container } = render(
            <ReservationSummaryCard
                reservation={reservation}
                showMemberInfo
                onOpenDetail={openDetail}
                actions={[
                    <button key="one" type="button" onClick={firstAction}>완료</button>,
                    <button key="two" type="button" onClick={secondAction}>노쇼</button>,
                    <button key="three" type="button" onClick={thirdAction}>취소</button>,
                ]}
            />,
        );

        expect(container.querySelectorAll('.ant-card-actions > li')).toHaveLength(3);
        expect(container.querySelectorAll('.reserve-reservation-card-action')).toHaveLength(3);
        expect(screen.getByText('예약자')).toBeInTheDocument();
        expect(screen.getByText('10,000원')).toBeInTheDocument();
        const details = container.querySelector('.reserve-reservation-summary-card-details');
        expect(details).toHaveTextContent('R-20260917-ABCD예약자·2명2026-09-20·14:0010,000원');
        expect(details?.children[0]).toHaveClass('reserve-reservation-summary-card-code');
        expect(details?.children[1]).toHaveClass('reserve-reservation-summary-card-party');
        expect(details?.children[3]).toHaveClass('reserve-reservation-summary-card-price');

        await user.click(screen.getByRole('button', { name: '테스트 가게 예약 상세 보기' }));
        expect(openDetail).toHaveBeenCalledOnce();

        await user.click(screen.getByRole('button', { name: '노쇼' }));
        expect(secondAction).toHaveBeenCalledOnce();
        expect(openDetail).toHaveBeenCalledOnce();
    });
});
