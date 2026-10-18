import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AdminPanel from './AdminPanel';

vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../components/admin/MailboxTab', () => ({ default: () => <div>메일함 화면</div> }));
vi.mock('../../components/admin/ChatReportsPanel', () => ({ default: () => <div>독립 신고함 화면</div> }));
vi.mock('../../components/admin/TrashTab', () => ({ default: () => <div>휴지통 화면</div> }));
vi.mock('../../components/admin/AuditLogTab', () => ({ default: () => <div>로그 화면</div> }));
vi.mock('../../components/admin/DashboardTab', () => ({ default: () => <div>대시보드 화면</div> }));
vi.mock('../../components/admin/MembersTab', () => ({ default: () => <div>회원 화면</div> }));
vi.mock('../../components/admin/StoresAdminTab', () => ({ default: () => <div>가게 화면</div> }));
vi.mock('../../components/admin/ReservationsAllTab', () => ({ default: () => <div>예약 화면</div> }));
vi.mock('../../components/admin/AdminAdsTab', () => ({ default: () => <div>광고 화면</div> }));
vi.mock('../../components/admin/BusinessVerificationTab', () => ({ default: () => <div>사업자 인증 화면</div> }));
vi.mock('../../components/admin/PaymentOperationsTab', () => ({ default: () => <div>결제 화면</div> }));

function LocationProbe() {
    return <output data-testid="admin-search">{useLocation().search}</output>;
}

describe('AdminPanel navigation', () => {
    it('keeps reports as a separate menu and removes the duplicate support-chat menu', () => {
        render(<MemoryRouter initialEntries={['/admin?tab=reports']}><AdminPanel /></MemoryRouter>);

        const navigation = within(screen.getByRole('navigation', { name: '관리자 패널 메뉴' }));
        expect(navigation.getByRole('link', { name: '채팅 신고', exact: true })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByText('독립 신고함 화면')).toBeInTheDocument();
        expect(navigation.queryByRole('link', { name: /문의 채팅/ })).not.toBeInTheDocument();
    });

    it('maps an old chat bookmark to the new reports menu', () => {
        render(<MemoryRouter initialEntries={['/admin?tab=chat']}><AdminPanel /><LocationProbe /></MemoryRouter>);
        const navigation = within(screen.getByRole('navigation', { name: '관리자 패널 메뉴' }));
        expect(navigation.getByRole('link', { name: '채팅 신고', exact: true })).toHaveAttribute('aria-current', 'page');
        expect(new URLSearchParams(screen.getByTestId('admin-search').textContent).get('tab')).toBe('reports');
        expect(screen.getByText('독립 신고함 화면')).toBeInTheDocument();
    });
});
