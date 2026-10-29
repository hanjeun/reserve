import { useState } from 'react';
import { fireEvent, render as renderTesting, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const render = ui => renderTesting(ui, { wrapper: MemoryRouter });
const acknowledge = () => fireEvent.click(screen.getByRole('checkbox', { name: /필수/ }));
import { expect, it, vi } from 'vitest';
import PaymentMethodDialog from './PaymentMethodDialog';
vi.mock('../common/FormModal', () => ({ default: ({ children, footer, onSubmit, submitText, submitDisabled }) =>
    <div role="dialog">{children}{footer ?? <button disabled={submitDisabled} onClick={onSubmit}>{submitText}</button>}</div> }));
const methods = [{ id: 'CARD', label: '카드결제', payMethod: 'CARD' }, { id: 'TOSS_NAVERPAY', brand: 'NAVERPAY', label: '네이버페이', payMethod: 'EASY_PAY', testOnly: true }];
const prepared = { amount: 10000, productName: '합성 보증금', buyerName: '합성 회원' };
function Checkout({ confirm, availableMethods = methods, paymentDevice }) {
    const [selected, setSelected] = useState('CARD');
    return <PaymentMethodDialog prepared={prepared} methods={availableMethods} selectedId={selected} onChange={setSelected} onConfirm={confirm}
        paymentDevice={paymentDevice} onClose={() => {}} open summary={{ kind: 'RESERVATION', storeName: '합성 가게', reservationCode: 'R-SYNTHETIC',
            reservationDate: '2026-11-01', reservationTime: '14:00:00', guestCount: 2, attendanceRefundEnabled: true }} />;
}
it('KCP에서는 확인되지 않은 카드사의 직접 호출을 비활성화해요', () => {
    render(<Checkout confirm={vi.fn()} availableMethods={[{ ...methods[0], pgProvider: 'kcp_v2', testOnly: true }]} />);
    fireEvent.click(screen.getByRole('button', { name: '카드사 더 보기' }));
    expect(screen.getByRole('button', { name: '전북' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'KB국민' })).toBeEnabled();
});
it('예약 정보와 서버 금액을 유지하며 선택한 간편결제로 넘겨요', () => {
    const confirm = vi.fn(); render(<Checkout confirm={confirm} />);
    expect(screen.getByRole('region', { name: '예약 정보' })).toHaveTextContent('2026-11-01');
    expect(screen.getByRole('button', { name: '예약번호 복사' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '결제 금액 확인' })).toHaveTextContent('보증금 전액을 환불해요.');
    fireEvent.click(screen.getByRole('button', { name: '네이버페이 TEST' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '10,000원 결제하기' })).toBeDisabled();
    acknowledge();
    expect(screen.getByText(/TEST 연결을 시험/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '네이버페이 TEST' }).querySelector('img')).toHaveAttribute('alt', '');
    fireEvent.click(screen.getByRole('button', { name: '10,000원 결제하기' }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(methods[1]);
    expect(screen.queryByRole('textbox', { name: /카드/ })).toBeNull();
});
it('카드와 간편결제의 중복 인증 설명을 생략하고 TEST 안내는 유지해요', () => {
    render(<Checkout confirm={vi.fn()} />);
    expect(screen.queryByText('카드사를 고르면 해당 카드사의 인증 화면으로 이어져요.')).toBeNull();
    expect(screen.queryByText('선택한 간편결제의 인증 화면으로 이어져요.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '네이버페이 TEST' }));
    expect(screen.getByText(/TEST 연결을 시험/)).toBeInTheDocument();
});
it('KCP 네이버페이 TEST는 계좌 등록 대신 준비된 테스트 포인트가 필요하다고 안내해요', () => {
    const naver = { ...methods[1], id: 'KCP_NAVERPAY', pgProvider: 'kcp_v2' };
    const confirm = vi.fn();
    const { rerender } = render(<Checkout confirm={confirm} availableMethods={[methods[0], naver]} />);
    fireEvent.click(screen.getByRole('button', { name: '네이버페이 TEST' }));
    expect(screen.getByText(/테스트 계정의 포인트로만/)).toBeInTheDocument();
    const preparation = screen.getByRole('link', { name: '테스트용 포인트 받기' });
    expect(preparation).toHaveAttribute('href', 'https://developers.pay.naver.com/user/sand-box/paypoint');
    expect(preparation).toHaveAttribute('target', '_blank');
    expect(preparation).toHaveAttribute('rel', 'noopener noreferrer');
    expect(confirm).not.toHaveBeenCalled();
    rerender(<Checkout confirm={vi.fn()} availableMethods={[methods[0], { ...naver, testOnly: false }]} />);
    expect(screen.queryByText(/테스트 계정의 포인트로만/)).toBeNull();
    expect(screen.queryByRole('link', { name: '테스트용 포인트 받기' })).toBeNull();
});
it('카드사를 선택해야 인증 요청으로 넘기며 선택을 바꿀 수 있어요', () => {
    const confirm = vi.fn(); render(<Checkout confirm={confirm} />);
    const submit = screen.getByRole('button', { name: '10,000원 결제하기' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '신한', pressed: false }));
    expect(submit).toBeDisabled();
    acknowledge();
    expect(submit).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '삼성', pressed: false }));
    fireEvent.click(submit);
    expect(confirm).toHaveBeenCalledExactlyOnceWith({ ...methods[0], cardCompany: 'SAMSUNG_CARD' });
    expect(screen.getByRole('complementary', { name: '결제 금액 확인' })).toHaveTextContent('카드 · 삼성');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
});
it('추가 카드사를 펼쳐 직접 선택할 수 있어요', () => {
    const confirm = vi.fn(); render(<Checkout confirm={confirm} />);
    fireEvent.click(screen.getByRole('button', { name: '카드사 더 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '씨티' }));
    acknowledge();
    fireEvent.click(screen.getByRole('button', { name: '10,000원 결제하기' }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith({ ...methods[0], cardCompany: 'CITI_CARD' });
});
it('미지원 모바일 결제는 이유를 표시하고 선택하지 못해요', () => {
    const confirm = vi.fn(); render(<Checkout confirm={confirm} paymentDevice={{ mobile: true, apple: true, safari: false, applePay: false }}
        availableMethods={[...methods, { id: 'APPLEPAY', brand: 'APPLEPAY', label: 'Apple Pay', payMethod: 'EASY_PAY' },
            { id: 'SAMSUNGPAY', brand: 'SAMSUNGPAY', label: '삼성페이', payMethod: 'EASY_PAY' }]} />);
    expect(screen.getByRole('button', { name: 'Apple Pay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '삼성페이' })).toBeDisabled();
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('group', { name: 'Apple Pay' })).toHaveAccessibleDescription('Apple Pay를 지원하는 Apple 기기의 Safari에서 사용할 수 있어요.');
    fireEvent.click(screen.getByRole('button', { name: 'Apple Pay' }));
    expect(confirm).not.toHaveBeenCalled();
});
it('사용 가능한 수단이 없으면 결제를 진행하지 않아요', () => {
    render(<PaymentMethodDialog prepared={prepared} methods={[]} onChange={() => {}} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '10,000원 결제하기' })).toBeDisabled();
});

it('결제 수단 전환은 카드사 DOM과 선택을 보존하고 포커스를 먼저 넘겨요', () => {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
        render(<Checkout confirm={vi.fn()} />);
        const company = screen.getByRole('button', { name: '신한' });
        fireEvent.click(company);
        acknowledge();
        const naver = screen.getByRole('button', { name: '네이버페이 TEST' });
        fireEvent.click(naver);
        expect(naver).toHaveFocus();
        expect(company.isConnected).toBe(true);
        expect(company.closest('.reserve-payment-expand')).toHaveAttribute('inert');
        expect(animate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ transform: 'translateY(0)' })]), expect.objectContaining({ duration: 220 }));
        fireEvent.click(screen.getByRole('button', { name: '카드결제' }));
        expect(screen.getByRole('button', { name: '신한', pressed: true })).toBe(company);
        expect(screen.getByRole('button', { name: '10,000원 결제하기' })).toBeEnabled();
    } finally {
        if (before) Object.defineProperty(HTMLElement.prototype, 'animate', before); else delete HTMLElement.prototype.animate;
    }
});
it('비활성 수단의 사유는 키보드 포커스에서 툴팁으로 확인해요', async () => {
    render(<Checkout confirm={vi.fn()} paymentDevice={{ mobile: false, apple: false, safari: false, applePay: false }}
        availableMethods={[...methods, { id: 'APPLEPAY', brand: 'APPLEPAY', label: 'Apple Pay', payMethod: 'EASY_PAY' }]} />);
    const target = screen.getByRole('group', { name: 'Apple Pay' });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focus(target);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Apple Pay를 지원하는 Apple 기기의 Safari');
    expect(screen.getByRole('button', { name: 'Apple Pay' })).toBeDisabled();
    fireEvent.keyDown(target, { key: 'Escape' });
});
