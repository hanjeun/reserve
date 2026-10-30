import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReservationRow from './ReservationRow';
import ReservationSummaryCard from './ReservationSummaryCard';
vi.mock('../../hooks', () => ({ useWindowWidth: () => 1024 }));
const pending = { id: 71, storeName: '합성 가게', status: 'PENDING', depositAmount: 10000, depositPaid: false,
    allowLatePayment: false, paymentDeadline: '2026-10-27T03:00:01Z', guestCount: 1, reservationDate: '2026-10-28', reservationTime: '17:00:00' };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T03:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
for (const [name, Component] of [['목록', ReservationRow], ['카드', ReservationSummaryCard]]) {
    it(name + '에서 만료 시 결제·변경·승인만 숨기고 취소·거절·삭제는 유지해요', () => {
        const open = vi.fn();
        const actions = [['pay', '결제하기'], ['edit', '변경'], ['cancel', '취소'], ['approve', '승인'],
            ['reject', '거절'], ['remove', '삭제'], ['delete', '휴지통']].map(([key, text]) => <button key={key}>{text}</button>);
        render(<Component reservation={pending} onOpenDetail={open} actions={actions} renderActions={() => actions} />);
        expect(screen.getByRole('button', { name: '결제하기' })).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1000));
        for (const text of ['결제하기', '변경', '승인']) expect(screen.queryByRole('button', { name: text })).toBeNull();
        for (const text of ['취소', '거절', '삭제', '휴지통']) expect(screen.getByRole('button', { name: text })).toBeInTheDocument();
        const timer = screen.getByRole('timer');
        expect(timer).toHaveAttribute('data-state', 'expired');
        expect(timer.nextElementSibling).toHaveTextContent('10,000원');
        const notice = screen.getByRole('status');
        expect(notice).toHaveTextContent('자동 취소 확인 중');
        expect(vi.getTimerCount()).toBe(0);
        if (name === '목록') {
            expect(notice.closest('.reserve-reservation-actions')).toContainElement(screen.getByRole('button', { name: '취소' }));
            expect(notice).toBe(notice.parentElement.firstElementChild);
            fireEvent.click(notice);
            expect(open).not.toHaveBeenCalled();
        }
        fireEvent.click(screen.getByRole('button', { name: '합성 가게 예약 상세 보기' }));
        expect(open).toHaveBeenCalledTimes(1);
        expect(pending.status).toBe('PENDING');
    });
    it(name + '에서 결제 상태 갱신으로 이미 만료된 예약이 들어와도 바로 실행을 차단해요', () => {
        const actions = [<button key="pay">결제하기</button>];
        const { rerender } = render(<Component reservation={{ ...pending, depositPaid: true }} onOpenDetail={() => {}}
            actions={actions} renderActions={() => actions} />);
        act(() => vi.setSystemTime(new Date('2026-10-27T03:02:00Z')));
        rerender(<Component reservation={pending} onOpenDetail={() => {}} actions={actions} renderActions={() => actions} />);
        expect(screen.queryByRole('button', { name: '결제하기' })).toBeNull();
        expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'expired');
        expect(screen.getByRole('status')).toHaveTextContent('자동 취소 확인 중');
        expect(vi.getTimerCount()).toBe(0);
    });
    it(name + '에서 서버가 취소를 확정하면 안내를 삭제 도구로 바꿔요', () => {
        const open = vi.fn(); const remove = vi.fn();
        const { rerender } = render(<Component reservation={pending} onOpenDetail={open} />);
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByRole('status')).toHaveTextContent('자동 취소 확인 중');
        fireEvent.click(screen.getByRole('status'));
        expect(open).not.toHaveBeenCalled();
        const actions = [<button key="remove" onClick={remove}>삭제</button>];
        rerender(<Component reservation={{ ...pending, status: 'CANCELLED' }} onOpenDetail={open}
            actions={actions} renderActions={() => actions} />);
        expect(screen.queryByText('자동 취소 확인 중')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '삭제' }));
        expect(remove).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
    });
    it(name + '에서 실행 도구가 없는 미확인 예약의 빈칸에 이유를 표시해요', () => {
        render(<Component reservation={{ ...pending, status: 'UNCONFIRMED' }} onOpenDetail={() => {}} />);
        expect(screen.getByRole('status')).toHaveTextContent('가게의 이용 확인 대기');
        expect(screen.queryByText('자동 취소 확인 중')).toBeNull();
    });
    it(name + '에서 나중 결제·결제 완료 예약의 정상 실행 도구는 유지해요', () => {
        const actions = [<button key="change">변경</button>];
        const { rerender } = render(<Component reservation={{ ...pending, allowLatePayment: true }} onOpenDetail={() => {}}
            actions={actions} renderActions={() => actions} />);
        act(() => vi.advanceTimersByTime(2000));
        expect(screen.getByRole('button', { name: '변경' })).toBeInTheDocument();
        expect(screen.queryByRole('timer')).toBeNull();
        expect(screen.queryByText('자동 취소 확인 중')).toBeNull();
        rerender(<Component reservation={{ ...pending, depositPaid: true, status: 'CONFIRMED' }} onOpenDetail={() => {}}
            actions={actions} renderActions={() => actions} />);
        expect(screen.getByRole('button', { name: '변경' })).toBeInTheDocument();
        expect(screen.queryByRole('timer')).toBeNull();
    });
}

it.each([false, true])('목록 오른쪽은 버튼이 없어도 상세를 열지 않고 실제 버튼과 상세 진입은 유지해요 (%s)', withActions => {
    const open = vi.fn(); const cancel = vi.fn();
    const actions = withActions ? [<button key="cancel" onClick={cancel}>취소</button>] : [];
    const { container } = render(<ReservationRow reservation={pending} onOpenDetail={open} renderActions={() => actions} />);
    const guard = container.querySelector('.reserve-reservation-row__action-guard');
    expect(guard).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(guard);
    expect(open).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
    if (withActions) {
        fireEvent.click(screen.getByRole('button', { name: '취소' }));
        expect(cancel).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
    }
    fireEvent.click(screen.getByRole('button', { name: '합성 가게 예약 상세 보기' }));
    expect(open).toHaveBeenCalledOnce();
});
