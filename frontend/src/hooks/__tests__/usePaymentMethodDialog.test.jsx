import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePaymentMethodDialog from '../usePaymentMethodDialog';
import useAuthStore from '../../store/useAuthStore';
const fixture = vi.hoisted(() => ({ done: vi.fn() }));
vi.mock('../../components/payment/PaymentMethodDialog', () => ({ default: props => <div aria-label="결제 선택">
    <button onClick={() => props.onConfirm({ ...props.methods[0], cardCompany: 'SHINHAN_CARD' })}>선택 확인</button>
    <button onClick={props.afterClose}>닫힘 완료</button>
</div> }));
const prepared = { amount: 10000, storeId: 'synthetic-store', merchantUid: 'synthetic-order' };
function Harness() {
    const { choosePayment, paymentDialog } = usePaymentMethodDialog();
    return <><button onClick={() => choosePayment(prepared).then(fixture.done)}>열기</button>{paymentDialog}</>;
}
describe('결제 확인창 수명', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_PORTONE_KCP_TEST_CHANNEL_KEY', ''); vi.stubEnv('VITE_PORTONE_TOSS_CHANNEL_KEY', 'channel-key-11111111-1111-4111-8111-111111111111'); useAuthStore.setState({ sessionRevision: 1 }); });
    afterEach(() => vi.unstubAllEnvs());
    it('닫힘이 끝나기 전에는 PG 인계를 시작하지 않아요', async () => {
        render(<Harness />); fireEvent.click(screen.getByRole('button', { name: '열기' }));
        fireEvent.click(screen.getByRole('button', { name: '선택 확인' }));
        expect(fixture.done).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '닫힘 완료' }));
        await waitFor(() => expect(fixture.done).toHaveBeenCalledWith(expect.objectContaining({ id: 'CARD' })));
    });
    it('계정이 바뀌면 이전 선택을 폐기하고 내용을 숨겨요', async () => {
        render(<Harness />); fireEvent.click(screen.getByRole('button', { name: '열기' }));
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        await waitFor(() => expect(fixture.done).toHaveBeenCalledWith(null));
        expect(screen.queryByLabelText('결제 선택')).toBeNull();
    });
    it('서버 금액이 유효하지 않으면 선택창을 열지 않아요', () => {
        const { result } = renderHook(() => usePaymentMethodDialog());
        expect(() => result.current.choosePayment({ ...prepared, amount: -1 })).toThrow('결제 금액');
    });
});
