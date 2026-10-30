import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import usePaymentMethodDialog from './usePaymentMethodDialog';
import { advanceSession } from '../api/sessionScope';
import { clearPaymentReturns } from '../utils/paymentReturnContext';

const fixture = vi.hoisted(() => ({ memberId: 7, revision: 1, modal: { info: vi.fn() }, settled: vi.fn() }));
vi.mock('../store/useAuthStore', () => {
    const state = () => ({ user: { id: fixture.memberId }, sessionRevision: fixture.revision });
    const store = selector => selector(state());
    store.getState = state;
    return { default: store };
});
vi.mock('./useMessage', () => ({ default: () => ({ modal: fixture.modal }) }));
vi.mock('../utils/paymentMethods', async original => ({ ...await original(), configuredPaymentMethods: () => [{ id: 'CARD', label: '카드결제', payMethod: 'CARD' }] }));
vi.mock('../components/common/FormModal', () => ({ default: ({ children, footer }) => <div role="dialog">{children}{footer}</div> }));

function CheckoutOwner({ kind }) {
    const { choosePayment, paymentDialog } = usePaymentMethodDialog();
    return <><button onClick={() => { void choosePayment({ storeId: 'synthetic-store', merchantUid: 'synthetic-order', amount: 1000,
        productName: '합성 상품' }, { kind }).then(fixture.settled); }}>결제 확인 열기</button>{paymentDialog}</>;
}
function Harness({ kind }) {
    const location = useLocation(); const navigate = useNavigate();
    return <>
        {!['/terms', '/away'].includes(location.pathname) && <CheckoutOwner kind={kind} />}
        {location.pathname === '/terms' && <h1>서비스 이용약관</h1>}
        <output data-testid="location">{JSON.stringify(location)}</output>
        <button onClick={() => navigate(-1)}>뒤로</button>
        <button onClick={() => navigate('/away')}>나가기</button>
        <button onClick={() => navigate('/store/12')}>가게로 이동</button>
    </>;
}
const location = () => JSON.parse(screen.getByTestId('location').textContent);
const notice = () => fixture.modal.info.mock.calls[0][0];
function show(path = '/store/12', kind = 'RESERVATION') {
    render(<StrictMode><MemoryRouter initialEntries={[path]}><Harness kind={kind} /></MemoryRouter></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: '결제 확인 열기' }));
    fireEvent.click(screen.getByRole('link', { name: '결제·취소·환불 안내' }));
    expect(screen.getByRole('heading', { name: '서비스 이용약관' })).toBeInTheDocument();
}
beforeEach(() => {
    fixture.memberId = 7; fixture.revision = 1; fixture.modal.info.mockReset(); fixture.settled.mockReset();
    clearPaymentReturns(); advanceSession();
});

it('약관에서 뒤로 오면 안내 한 번을 표시하고 닫힘 후 내 예약으로 이어가요', async () => {
    show();
    await act(async () => {});
    expect(fixture.settled).toHaveBeenCalledExactlyOnceWith(null);
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(fixture.modal.info).toHaveBeenCalledOnce();
    expect(notice().title).toBe('결제 내용을 다시 확인해주세요');
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => notice().onOk());
    expect(location().pathname).toBe('/store/12');
    act(() => notice().afterClose());
    expect(location().pathname).toBe('/my-reservations');
    fireEvent.click(screen.getByRole('button', { name: '결제 확인 열기' }));
    expect(screen.getByRole('checkbox', { name: /필수/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '1,000원 결제하기' })).toBeDisabled();
});
it('내 예약에서 약관을 읽고 돌아오면 목록 조건과 방문 기록을 유지해요', () => {
    show('/my-reservations?page=2&status=PENDING');
    fireEvent.click(screen.getByRole('button', { name: '뒤로' })); const before = location();
    act(() => { notice().onOk(); notice().afterClose(); });
    expect(location()).toEqual(before);
});
it('광고의 약관 복귀는 광고 안내를 보여주고 현재 관리 화면을 유지해요', () => {
    show('/business?tab=ads', 'ADVERTISEMENT');
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(notice().content).toMatch(/광고 관리/); const before = location();
    act(() => { notice().onOk(); notice().afterClose(); });
    expect(location()).toEqual(before);
});
it.each(['member', 'session'])('약관을 읽는 중 %s이 바뀌면 이전 안내를 표시하지 않아요', change => {
    show();
    if (change === 'member') fixture.memberId = 8;
    else { advanceSession(); fixture.revision++; }
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(fixture.modal.info).not.toHaveBeenCalled();
});
it('30분이 지난 약관 방문은 복구 안내를 표시하지 않아요', () => {
    show(); const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30 * 60 * 1000 + 1);
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(fixture.modal.info).not.toHaveBeenCalled(); clock.mockRestore();
});
it('같은 주소를 새로 방문한 기록에는 이전 약관 안내를 끼워 넣지 않아요', () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '가게로 이동' }));
    expect(location().pathname).toBe('/store/12');
    expect(fixture.modal.info).not.toHaveBeenCalled();
});
it('안내를 닫는 도중 다른 화면으로 가면 이전 안내가 이동을 덮지 않아요', () => {
    show(); fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    act(() => notice().onOk()); fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    act(() => notice().afterClose()); expect(location().pathname).toBe('/away');
});
