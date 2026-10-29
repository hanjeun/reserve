import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReservationConsentField from './ReservationConsentField';
import useAuthStore from '../../store/useAuthStore';
const fixture = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { get: fixture.get } }));
vi.mock('../common/ResponsiveModal', () => ({ default: ({ open, children }) => open ? <div role="dialog">{children}</div> : null }));
const notice = { enabled: true, version: 'fixture-version', hash: 'fixture-hash', details: {
    recipient: '합성 가게 운영자', purpose: '합성 예약 처리', items: ['예약자 이름'], retention: '합성 보유기간',
    refusal: '동의를 거부할 수 있습니다.', sellerAddress: '합성 주소', sellerPhone: '000-0000-0000',
    depositAmount: 10000, fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50,
}};
function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const done = vi.fn();
    render(<QueryClientProvider client={client}><Form onFinish={done}>
        <ReservationConsentField storeId={7} /><button type="submit">예약 신청</button>
    </Form></QueryClientProvider>);
    return { client, done };
}
describe('예약 동의 경계', () => {
    beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ user: { id: 3 }, sessionRevision: 1 }); fixture.get.mockResolvedValue(notice); });
    it('조건 확인과 개인정보 제공을 따로 확인한 뒤 서버 버전·해시를 제출해요', async () => {
        const { done } = show();
        const privacy = await screen.findByRole('checkbox', { name: /가게에 예약 정보/ });
        fireEvent.click(privacy);
        fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
        await screen.findByText('예약 조건과 개인정보 제공 안내를 확인하고 동의해주세요.');
        expect(done).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('checkbox', { name: /예약·취소·환불 조건/ }));
        fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
        await waitFor(() => expect(done).toHaveBeenCalledWith({ legalConsent: {
            version: notice.version, noticeHash: notice.hash, privacyAccepted: true, conditionsAccepted: true,
        } }));
        fireEvent.click(screen.getByRole('button', { name: '예약 및 개인정보 제공 안내' }));
        expect(await screen.findByRole('dialog')).toHaveTextContent('합성 보유기간');
    });
    it('정책이 바뀌면 이전 체크를 새 동의에 자동으로 넘기지 않아요', async () => {
        const { client, done } = show();
        fireEvent.click(await screen.findByRole('checkbox', { name: /가게에 예약 정보/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /예약·취소·환불 조건/ }));
        act(() => client.setQueryData(['reservation-consent', 3, 1, 7], { ...notice, hash: 'new-hash' }));
        await waitFor(() => expect(screen.getByRole('checkbox', { name: /가게에 예약 정보/ })).not.toBeChecked());
        fireEvent.click(screen.getByRole('checkbox', { name: /예약·취소·환불 조건/ }));
        expect(screen.getByRole('checkbox', { name: /가게에 예약 정보/ })).not.toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
        await screen.findByText('예약 조건과 개인정보 제공 안내를 확인하고 동의해주세요.');
        expect(done).not.toHaveBeenCalled();
    });
    it('안내 조회 실패는 동의를 생략하는 성공으로 취급하지 않아요', async () => {
        fixture.get.mockRejectedValue(new Error('synthetic unavailable')); const { done } = show();
        await screen.findByText('예약 안내를 불러오지 못했어요.');
        fireEvent.click(screen.getByRole('button', { name: '예약 신청' }));
        await screen.findByText('예약 안내를 먼저 확인해주세요.');
        expect(done).not.toHaveBeenCalled();
    });
    it('익명과 비활성 기능은 불필요한 동의 조회를 만들지 않아요', () => {
        useAuthStore.setState({ user: null });
        const { container } = render(<ReservationConsentField storeId={7} />);
        expect(container).toBeEmptyDOMElement(); expect(fixture.get).not.toHaveBeenCalled();
    });
});
