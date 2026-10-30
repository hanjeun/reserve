import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentResult from './PaymentResult';
import usePaymentIncompleteNotice from '../../hooks/usePaymentIncompleteNotice.jsx';
import { clearPaymentReturns, rememberPaymentReturn } from '../../utils/paymentReturnContext';
import { createLoadingPresentation, LoadingPresentationContext } from '../../components/layout/loadingPresentation';

const fixture = vi.hoisted(() => ({ user: { id: 1 }, getStatus: vi.fn(), checkReturn: vi.fn(), invalidateReservations: vi.fn(), invalidateAds: vi.fn() }));
vi.mock('../../services/paymentService', () => ({ default: { getStatus: fixture.getStatus, checkReturn: fixture.checkReturn } }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => selector({ user: fixture.user }) }));
vi.mock('../../hooks/invalidateAfterWrite', () => ({ invalidateReservationData: fixture.invalidateReservations, invalidateAdData: fixture.invalidateAds }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../components/common/StateIllustration', () => ({ default: () => null }));

const paid = extra => ({ type: 'reservation', merchantUid: 'ORDER-fixture', status: 'PAID', amount: 10000, payMethod: 'PaymentMethodCard',
    refundedAmount: 0, reservation: { storeName: '합성 가게', reservationCode: 'R-fixture', reservationDate: '2026-11-01',
        reservationTime: '17:00:00', guestCount: 2, memberName: '합성 예약자' }, ...extra });
function ReturnStore() { usePaymentIncompleteNotice(); return <h1>원래 가게</h1>; }
function ReturnReservations() { usePaymentIncompleteNotice(); return <h1>예약 목록</h1>; }
function LocationProbe() { const location = useLocation(); return <output data-testid="payment-location">{JSON.stringify(location)}</output>; }
const show = (query = 'success=true&merchant_uid=ORDER-fixture', { documentEntry = false } = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><LoadingPresentationContext.Provider value={createLoadingPresentation('fixture', { documentEntry })}><MemoryRouter initialEntries={['/payment/result?' + query]}><AntApp><LocationProbe /><Routes>
        <Route path="/payment/result" element={<PaymentResult />} /><Route path="/my-reservations" element={<ReturnReservations />} />
        <Route path="/stores" element={<h1>가게 목록</h1>} /><Route path="/business" element={<h1>광고 목록</h1>} />
        <Route path="/store/12" element={<ReturnStore />} />
    </Routes></AntApp></MemoryRouter></LoadingPresentationContext.Provider></QueryClientProvider>);
    return client;
};

beforeEach(() => {
    vi.resetAllMocks(); fixture.user = { id: 1 }; clearPaymentReturns();
    rememberPaymentReturn('ORDER-fixture', 1, { pathname: '/store/12' });
});
describe('결제 결과와 예약 요약', () => {
    it('내 예약에서 시작한 미결제는 목록 조건을 유지하고 목록에서 모달을 한 번 표시해요', async () => {
        rememberPaymentReturn('ORDER-fixture', 1, { pathname: '/my-reservations', search: '?page=2&status=PENDING' });
        fixture.checkReturn.mockResolvedValue({ merchantUid: 'ORDER-fixture', outcome: 'INCOMPLETE', storeId: 12 });
        show('checkout_return=true&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '예약 목록' });
        const dialogs = await screen.findAllByRole('dialog');
        expect(dialogs).toHaveLength(1);
        expect(dialogs[0]).toHaveAccessibleName('결제가 완료되지 않았어요');
        const location = JSON.parse(screen.getByTestId('payment-location').textContent);
        expect(location.search).toBe('?status=PENDING&page=2');
        expect(location.state.reserveRouteMotion).toBe('from-left');
        expect(screen.queryByRole('heading', { name: '원래 가게' })).toBeNull();
    });
    it('복귀 위치가 없으면 임의의 가게 대신 내 예약에서 안내해요', async () => {
        clearPaymentReturns();
        fixture.checkReturn.mockResolvedValue({ merchantUid: 'ORDER-fixture', outcome: 'INCOMPLETE', storeId: 12 });
        show('checkout_return=true&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '예약 목록' });
        expect(await screen.findByRole('dialog')).toHaveAccessibleName('결제가 완료되지 않았어요');
    });
    it.each([true, false])('문서 진입 %s에서 첫 대기 화면의 모션 프레임을 본문까지 유지해요', async documentEntry => {
        let finish;
        fixture.getStatus.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        show('merchant_uid=ORDER-fixture', { documentEntry });
        const frame = screen.getByRole('heading', { name: '결제 처리 중' }).closest('.reserve-payment-result-page');
        expect(frame.classList.contains('reserve-route-entry--from-right')).toBe(documentEntry);
        await act(async () => finish(paid()));
        expect((await screen.findByRole('heading', { name: '결제 완료' })).closest('.reserve-payment-result-page')).toBe(frame);
        fireEvent.click(screen.getByRole('button', { name: '내 예약', exact: true }));
        expect(JSON.parse(screen.getByTestId('payment-location').textContent).state.reserveRouteMotion).toBe('from-left');
    });
    it.each(['success=false&', ''])('선결제 미완료만 원래 가게의 짧은 모달로 안내해요 (%s)', async prefix => {
        fixture.checkReturn.mockResolvedValue({ merchantUid: 'ORDER-fixture', outcome: 'INCOMPLETE', storeId: 12 });
        show(prefix + 'checkout_return=true&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '원래 가게' });
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAccessibleName('결제가 완료되지 않았어요');
        expect(dialog).toHaveTextContent('내 예약에 결제 대기 상태로 남아 있어요.');
        expect(fixture.invalidateReservations).toHaveBeenCalledOnce();
        expect(screen.queryByRole('button', { name: '내 예약', exact: true })).toBeNull();
        expect(fixture.getStatus).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
        expect(screen.getByRole('heading', { name: '원래 가게' })).toBeInTheDocument();
        await waitFor(() => expect(dialog).toHaveClass('ant-zoom-leave-active'));
        // jsdom은 AnimationEvent 지원 여부에 따라 접두사 이벤트를 사용해요.
        for (const type of ['animationend', 'webkitAnimationEnd']) fireEvent(dialog, new Event(type, { bubbles: true }));
        expect(await screen.findByRole('heading', { name: '예약 목록' })).toBeInTheDocument();
        expect(JSON.parse(screen.getByTestId('payment-location').textContent).state).toEqual({ refetch: true, reserveRouteMotion: 'from-right' });
    });
    it.each(['STATUS', 'REVIEW_REQUIRED'])('복귀 결과 %s는 미결제 모달로 오인하지 않아요', async outcome => {
        fixture.checkReturn.mockResolvedValue({ merchantUid: 'ORDER-fixture', outcome, storeId: 12 });
        fixture.getStatus.mockResolvedValue(paid({ status: outcome === 'STATUS' ? 'PAID' : 'FAILED' }));
        show('checkout_return=true&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: outcome === 'STATUS' ? '결제 완료' : '결제 내역 확인이 필요해요' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it.each([
        { merchantUid: 'OTHER', outcome: 'INCOMPLETE', storeId: 12 },
        { merchantUid: 'ORDER-fixture', outcome: 'INCOMPLETE', storeId: 'https://external.invalid' },
    ])('복귀 주문·가게가 잘못된 응답으로 이동하지 않아요 (%j)', async response => {
        fixture.checkReturn.mockResolvedValue(response);
        fixture.getStatus.mockResolvedValue(paid({ status: 'READY' }));
        show('checkout_return=true&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '결제 상태를 확인하고 있어요' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('복귀 재조회 실패는 확인 화면을 유지해요', async () => {
        fixture.checkReturn.mockRejectedValue(new Error('network'));
        fixture.getStatus.mockResolvedValue(paid({ status: 'READY' }));
        show('checkout_return=true&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '결제 상태를 확인하고 있어요' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('서버 예약 요약과 실행 버튼을 유지하고 예약 확정 안내는 표시하지 않아요', async () => {
        fixture.getStatus.mockResolvedValue(paid());
        show('success=false&error_msg=old-error&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '결제 완료' });
        const summary = screen.getByRole('region', { name: '예약 및 결제 내역' });
        for (const text of ['합성 가게', 'R-fixture', '2026-11-01', '17:00', '2명', '합성 예약자', '10,000원', '카드결제'])
            expect(within(summary).getByText(text, { exact: true })).toBeInTheDocument();
        expect(within(summary).getByRole('button', { name: '주문번호 복사' }).closest('.reserve-copyable-text'))
            .toHaveTextContent(/^ORDER-fixture$/);
        expect(summary.querySelector('.reserve-detail-info-rows')).not.toBeNull();
        expect(summary.querySelectorAll('[aria-hidden="true"] svg').length).toBeGreaterThanOrEqual(8);
        const records = screen.getByRole('button', { name: '내 예약', exact: true });
        const browse = screen.getByRole('button', { name: '가게 둘러보기', exact: true });
        expect(records.parentElement).toBe(browse.parentElement);
        expect(screen.queryByText(/예약 확정 여부/)).toBeNull();
        expect(screen.queryByText(/결제창으로 이동하지/)).toBeNull();
        expect(screen.queryByText('old-error')).toBeNull();
        expect(fixture.getStatus).toHaveBeenCalledExactlyOnceWith('reservation', 'ORDER-fixture');
        fireEvent.click(browse);
        expect(await screen.findByRole('heading', { name: '가게 목록' })).toBeInTheDocument();
    });
    it.each([
        ['FAILED', '결제가 완료되지 않았어요'], ['CANCELLED', '결제가 완료되지 않았어요'],
        ['REFUNDED', '환불 완료'], ['PARTIAL_REFUNDED', '부분 환불 완료'],
        ['REFUND_PENDING', '환불 확인 중'], ['REVIEW_REQUIRED', '결제 내역 확인이 필요해요'],
    ])('%s를 미확정이나 결제 완료로 바꾸지 않아요', async (status, title) => {
        fixture.getStatus.mockResolvedValue(paid({ status, refundedAmount: status === 'REFUNDED' ? 10000 : 4000 }));
        show();
        await screen.findByRole('heading', { name: title });
        expect(screen.queryByRole('heading', { name: '결제 완료' })).toBeNull();
        expect(screen.getByText('환불 금액')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '내 예약', exact: true })).toBeInTheDocument();
        expect(fixture.invalidateReservations).toHaveBeenCalledTimes(['REFUND_PENDING', 'REVIEW_REQUIRED'].includes(status) ? 0 : 1);
    });
    it.each([{ merchantUid: 'OTHER-order' }, { type: 'ad' }])('요청과 다른 결제 응답의 금액·개인 정보를 표시하지 않아요 (%j)', async mismatch => {
        fixture.getStatus.mockResolvedValue(paid(mismatch));
        show();
        await screen.findByRole('heading', { name: '결제 상태를 불러오지 못했어요' });
        for (const text of ['합성 예약자', '합성 가게', 'R-fixture', '10,000원', 'OTHER-order']) expect(screen.queryByText(text, { exact: true })).toBeNull();
        expect(screen.queryByRole('heading', { name: '결제 완료' })).toBeNull();
    });
    it('위조된 성공 URL과 초기 조회 실패로 성공을 표시하거나 재결제를 실행하지 않아요', async () => {
        fixture.getStatus.mockRejectedValue(new Error('fixture lookup failed'));
        show();
        await screen.findByRole('heading', { name: '결제 상태를 불러오지 못했어요' });
        expect(screen.queryByText('10,000원')).toBeNull();
        expect(screen.queryByRole('heading', { name: '결제 완료' })).toBeNull();
        fixture.getStatus.mockResolvedValue(paid({ status: 'READY' }));
        fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
        await screen.findByRole('heading', { name: '결제 상태를 확인하고 있어요' });
        expect(fixture.getStatus).toHaveBeenCalledTimes(2);
        const recovery = screen.getByRole('link', { name: '내 예약', exact: true });
        expect(recovery).toHaveAttribute('href', '/my-reservations');
        expect(recovery).toHaveClass('reserve-text-link');
        expect(recovery.closest('p')).toHaveTextContent('결제창으로 이동하지 못하셨나요? 내 예약에서 다시 열기');
        expect(screen.queryByText(/예약 확정 여부/)).toBeNull();
        fireEvent.click(recovery);
        expect(await screen.findByRole('heading', { name: '예약 목록' })).toBeInTheDocument();
    });
    it.each([['NAVERPAY', '네이버페이'], ['KAKAOPAY', '카카오페이'], ['TOSSPAY', '토스페이']])('서버가 확인한 간편결제사 이름을 표시해요 (%s)', async (provider, label) => {
        fixture.getStatus.mockResolvedValue(paid({ payMethod: 'PaymentMethodEasyPay', payProvider: provider }));
        show();
        await screen.findByRole('heading', { name: '결제 완료' });
        const summary = screen.getByRole('region', { name: '예약 및 결제 내역' });
        expect(within(summary).getByText(label)).toBeInTheDocument();
    });
    it('이미 확인한 결과는 백그라운드 재조회 중에도 유지해요', async () => {
        fixture.getStatus.mockResolvedValueOnce(paid());
        const client = show();
        await screen.findByRole('heading', { name: '결제 완료' });
        let finish;
        fixture.getStatus.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        await act(async () => { void client.refetchQueries({ queryKey: ['payment-result'] }); });
        expect(screen.getByRole('heading', { name: '결제 완료' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: '결제 처리 중' })).toBeNull();
        await act(async () => { finish(paid({ status: 'REFUNDED', refundedAmount: 10000 })); });
        expect(await screen.findByRole('heading', { name: '환불 완료' })).toBeInTheDocument();
    });
    it.each(['ACTIVE', 'EXPIRED', 'SUSPENDED'])('원장이 확인한 광고 %s는 노출 상태와 결제 완료를 구분해요', async status => {
        fixture.getStatus.mockResolvedValue({ type: 'ad', merchantUid: 'ORDER-fixture', status, amount: 10000 });
        show('type=ad&merchant_uid=ORDER-fixture');
        await screen.findByRole('heading', { name: '결제 완료' });
        fireEvent.click(screen.getByRole('button', { name: '광고 관리', exact: true }));
        expect(await screen.findByRole('heading', { name: '광고 목록' })).toBeInTheDocument();
    });
    it.each([
        ['success=true', { id: 1 }], ['merchant_uid=ORDER-fixture', null],
        ['type=unknown&merchant_uid=ORDER-fixture', { id: 1 }],
    ])('조회 조건이 없으면 상태 API를 호출하지 않아요 (%s)', (query, user) => {
        fixture.user = user; show(query);
        expect(screen.getByRole('heading', { name: '결제 정보를 확인할 수 없어요' })).toBeInTheDocument();
        expect(fixture.getStatus).not.toHaveBeenCalled();
    });
});
