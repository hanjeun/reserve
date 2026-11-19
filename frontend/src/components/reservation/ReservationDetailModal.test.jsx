import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ReservationDetailModal from './ReservationDetailModal';

vi.mock('antd', () => ({
    Modal: ({ open, children }) => <section role="dialog" data-open={String(open)}>{children}</section>,
    Typography: { Text: ({ children }) => <span>{children}</span> },
    Flex: ({ children }) => <div>{children}</div>, Divider: () => null,
}));
vi.mock('../common/icons', () => ({
    UserOutlined: () => null, CalendarOutlined: () => null, ClockCircleOutlined: () => null,
    TeamOutlined: () => null, MailOutlined: () => null, DollarOutlined: () => null, CheckCircleOutlined: () => null,
    FileTextOutlined: () => <span aria-hidden="true" />,
}));
vi.mock('./ReservationStatusBadge', () => ({ default: () => null }));
vi.mock('../common/CopyableText', () => ({ default: ({ value }) => <span>{value}</span> }));

const reservation = { storeName: '예약 가게', memberName: '예약자', guestCount: 2, depositAmount: 0 };

describe('reservation details during closing', () => {
    it('keeps the same modal and its last content when the parent clears the reservation', () => {
        const rendered = render(<ReservationDetailModal reservation={reservation} open onClose={vi.fn()} />);
        const modal = screen.getByRole('dialog');
        rendered.rerender(<ReservationDetailModal reservation={null} open={false} onClose={vi.fn()} />);
        expect(screen.getByRole('dialog')).toBe(modal);
        expect(modal).toHaveAttribute('data-open', 'false');
        expect(modal).toHaveTextContent('예약 가게');
        rendered.rerender(<ReservationDetailModal reservation={{ ...reservation, storeName: '다음 가게' }} open />);
        expect(modal).toHaveTextContent('다음 가게');
        expect(modal).not.toHaveTextContent('예약 가게');
        rendered.rerender(<ReservationDetailModal reservation={null} open={false} />);
        expect(modal).toHaveTextContent('다음 가게');
    });

    it('does not mount an empty modal before a reservation exists', () => {
        render(<ReservationDetailModal reservation={null} open={false} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('내 예약의 결제 내역을 금액과 같은 정보 행으로 표시하고 닫힐 때 유지해요', () => {
        const data = { ...reservation, id: 3, depositAmount: 10000 };
        const modal = (item, open, showPaymentHistory) => <MemoryRouter>
            <ReservationDetailModal reservation={item} open={open} showPaymentHistory={showPaymentHistory} />
        </MemoryRouter>;
        const { rerender } = render(modal(data, true, false));
        expect(screen.queryByRole('link', { name: '결제 내역 보기' })).toBeNull();

        rerender(modal(data, true, true));
        const link = screen.getByRole('link', { name: '결제 내역 보기' });
        expect(link).toHaveAttribute('href', '/payment/result?reservation_id=3');
        expect(link.parentElement).toBe(screen.getByText('결제 내역').parentElement);
        expect(link.parentElement.previousElementSibling).toBe(screen.getByText('금액').parentElement);

        rerender(modal(null, false, true));
        expect(screen.getByRole('link', { name: '결제 내역 보기' })).toBe(link);
        rerender(modal(reservation, true, true));
        expect(screen.queryByRole('link', { name: '결제 내역 보기' })).toBeNull();
    });

    it('가림 응답에서 개인정보를 표시하지 않고 같은 예약의 관리자 도구를 연결해요', () => {
        const tools = vi.fn((value, open) => <span>{value.reservationCode}:{String(open)}</span>);
        render(<ReservationDetailModal reservation={{ ...reservation, memberName: null, memberEmail: null,
            personalInfoHidden: true, reservationCode: 'SYNTHETIC-1' }} open tools={tools} />);
        expect(screen.getByText('개인정보 조회 기간이 지났어요')).toBeInTheDocument();
        expect(screen.queryByText('예약자', { selector: 'span' })).toBeInTheDocument();
        expect(screen.getByText('SYNTHETIC-1:true')).toBeInTheDocument();
    });
});
