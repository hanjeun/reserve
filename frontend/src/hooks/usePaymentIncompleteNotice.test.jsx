import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import usePaymentIncompleteNotice from './usePaymentIncompleteNotice.jsx';
import { advanceSession } from '../api/sessionScope';

const fixture = vi.hoisted(() => ({ memberId: 7, info: vi.fn() }));
vi.mock('../store/useAuthStore', () => ({ default: selector => selector({ user: { id: fixture.memberId } }) }));
vi.mock('./useMessage', () => ({ default: () => ({ modal: { info: fixture.info } }) }));

function NoticeOwner() { usePaymentIncompleteNotice(); return null; }
function Harness() {
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        {location.pathname !== '/away' && <NoticeOwner />}
        <output data-testid="location">{JSON.stringify(location)}</output>
        <button onClick={() => navigate('/store/13')}>다른 가게로</button>
        <button onClick={() => navigate('/away')}>나가기</button>
        <button onClick={() => navigate(-1)}>뒤로</button>
    </>;
}
const location = () => JSON.parse(screen.getByTestId('location').textContent);
const notice = () => fixture.info.mock.calls[0][0];
const show = (pathname = '/store/12', search = '', memberId = 7) => render(<StrictMode>
    <MemoryRouter initialEntries={[{ pathname, search, state: { paymentIncomplete: { memberId, merchantUid: 'ORDER-fixture' } } }]}>
        <Harness />
    </MemoryRouter>
</StrictMode>);
beforeEach(() => { fixture.memberId = 7; fixture.info.mockReset(); advanceSession(); });

it('안내는 한 번 표시하고 확인 후 닫힘이 끝나면 내 예약으로 이어줘요', () => {
    show();
    expect(fixture.info).toHaveBeenCalledOnce();
    expect(location().state.paymentIncomplete).toBeUndefined();
    act(() => notice().onOk());
    expect(location().pathname).toBe('/store/12');
    act(() => notice().afterClose());
    expect(location().pathname).toBe('/my-reservations');
    expect(location().state).toEqual({ refetch: true, reserveRouteMotion: 'from-right' });
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(location().pathname).toBe('/store/12');
    expect(fixture.info).toHaveBeenCalledOnce();
});

it('내 예약에서 확인하면 검색 조건과 방문 기록을 유지해요', () => {
    show('/my-reservations', '?page=2&status=PENDING&view=list');
    const before = location();
    act(() => { notice().onOk(); notice().afterClose(); });
    expect(location()).toEqual(before);
});

it('확인하지 않고 닫힌 안내는 화면을 이동하지 않아요', () => {
    show();
    act(() => notice().afterClose());
    expect(location().pathname).toBe('/store/12');
});

it('다른 계정의 복귀 안내는 표시하지 않아요', () => {
    show('/store/12', '', 8);
    expect(fixture.info).not.toHaveBeenCalled();
});

it('같은 계정이라도 재로그인한 뒤 이전 안내의 확인은 이동하지 않아요', () => {
    show();
    advanceSession();
    act(() => { notice().onOk(); notice().afterClose(); });
    expect(location().pathname).toBe('/store/12');
});

it.each([['다른 가게로', '/store/13'], ['나가기', '/away']])('닫힘 도중 %s 이동을 이전 안내가 덮지 않아요', (label, pathname) => {
    show();
    act(() => notice().onOk());
    fireEvent.click(screen.getByRole('button', { name: label }));
    act(() => notice().afterClose());
    expect(location().pathname).toBe(pathname);
});
