import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReservationDetailModal from './ReservationDetailModal';

vi.mock('antd', () => ({
    Modal: ({ open, children }) => <section role="dialog" data-open={String(open)}>{children}</section>,
    Typography: { Text: ({ children }) => <span>{children}</span> },
    Flex: ({ children }) => <div>{children}</div>, Divider: () => null,
}));
vi.mock('@ant-design/icons', () => ({
    UserOutlined: () => null, CalendarOutlined: () => null, ClockCircleOutlined: () => null,
    TeamOutlined: () => null, MailOutlined: () => null, DollarOutlined: () => null, CheckCircleOutlined: () => null,
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
});
