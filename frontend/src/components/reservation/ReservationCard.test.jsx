import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ReservationCard from './ReservationCard';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({ confirm: vi.fn(), info: vi.fn() }));

vi.mock('antd', () => ({
    Flex: ({ children }) => <div>{children}</div>,
    Modal: ({ open, title, children, onOk, onCancel, okText, cancelText }) => open && <section role="dialog">
        {title}{children}<button onClick={onOk}>{okText}</button><button onClick={onCancel}>{cancelText}</button>
    </section>,
}));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ confirm: fixture.confirm, message: { info: fixture.info } }) }));
vi.mock('../common', () => ({
    Button: ({ children, onClick, disabled, loading, unavailableReason, onUnavailable }) => <button disabled={disabled || loading}
        aria-disabled={unavailableReason ? true : undefined} onClick={event => unavailableReason ? onUnavailable?.(unavailableReason) : onClick?.(event)}>{children}</button>,
    FormTextArea: ({ value, onChange }) => <textarea aria-label="처리 사유" value={value} onChange={onChange} />,
}));
vi.mock('./ReservationRow', () => ({ default: ({ renderActions }) => <div>{renderActions()}</div> }));
vi.mock('./ReservationSummaryCard', () => ({ default: ({ actions }) => <div>{actions}</div> }));
vi.mock('./ReservationDetailModal', () => ({ default: () => null }));

beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 7, role: 'BUSINESS' }, sessionRevision: 1, isLoggedIn: true });
});

const noShowReservation = overrides => ({ id: 91, status: 'CONFIRMED', depositPaid: true, depositAmount: 10000,
    noShowAvailableAt: new Date(Date.now() - 3600000).toISOString(), ...overrides });

it('이용 종료 시각 전에는 노쇼 확인창이나 요청을 열지 않아요', () => {
    const onNoShow = vi.fn();
    render(<ReservationCard reservation={noShowReservation({ noShowAvailableAt: new Date(Date.now() + 3600000).toISOString() })} onNoShow={onNoShow} />);
    fireEvent.click(screen.getByRole('button', { name: /노쇼$/ }));
    expect(fixture.info).toHaveBeenCalledWith('이용 종료 시각이 지난 뒤 방문 여부를 확인하고 노쇼로 처리해주세요.');
    expect(fixture.confirm).not.toHaveBeenCalled();
    expect(onNoShow).not.toHaveBeenCalled();
});

it('체크인된 예약은 노쇼를 막고 이유를 안내해요', () => {
    const onNoShow = vi.fn();
    render(<ReservationCard reservation={noShowReservation({ checkedInAt: new Date().toISOString() })} onNoShow={onNoShow} />);
    fireEvent.click(screen.getByRole('button', { name: /노쇼$/ }));
    expect(fixture.info).toHaveBeenCalledWith('체크인된 예약은 노쇼로 처리할 수 없어요.');
    expect(fixture.confirm).not.toHaveBeenCalled();
    expect(onNoShow).not.toHaveBeenCalled();
});

it('노쇼의 예약금 처리를 알리고 최종 확인 뒤에만 실행해요', async () => {
    const onNoShow = vi.fn();
    render(<ReservationCard reservation={noShowReservation()} onNoShow={onNoShow} />);
    fireEvent.click(screen.getByRole('button', { name: /노쇼$/ }));
    expect(onNoShow).not.toHaveBeenCalled();
    const approval = fixture.confirm.mock.calls[0][0];
    expect(approval.content).toContain('결제된 예약금은 자동 환불되지 않으며');
    await act(async () => approval.onOk());
    expect(onNoShow).toHaveBeenCalledExactlyOnceWith(91);
});

it('노쇼 확인창을 연 뒤 계정이 바뀌면 이전 예약을 처리하지 않아요', async () => {
    const onNoShow = vi.fn();
    render(<ReservationCard reservation={noShowReservation()} onNoShow={onNoShow} />);
    fireEvent.click(screen.getByRole('button', { name: /노쇼$/ }));
    const approval = fixture.confirm.mock.calls[0][0];
    act(() => useAuthStore.setState({ user: { id: 8 }, sessionRevision: 2 }));
    await act(async () => approval.onOk());
    expect(onNoShow).not.toHaveBeenCalled();
});

it('예약 화면을 떠난 뒤에는 열린 노쇼 확인창으로 실행하지 않아요', async () => {
    const onNoShow = vi.fn();
    const page = render(<ReservationCard reservation={noShowReservation()} onNoShow={onNoShow} />);
    fireEvent.click(screen.getByRole('button', { name: /노쇼$/ }));
    const approval = fixture.confirm.mock.calls[0][0];
    page.unmount();
    await act(async () => approval.onOk());
    expect(onNoShow).not.toHaveBeenCalled();
});

it.each([
    ['PENDING', '거절', '거절 확인', 'onReject'],
    ['CONFIRMED', '취소', '취소 확인', 'onStoreCancel'],
])('sends the reason only to the %s reservation action and closes the dialog', (status, action, confirmText, callback) => {
    const onReject = vi.fn();
    const onStoreCancel = vi.fn();
    render(<ReservationCard reservation={{ id: 91, status }} onReject={onReject} onStoreCancel={onStoreCancel} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(action + '$') }));
    fireEvent.change(screen.getByLabelText('처리 사유'), { target: { value: '시험 사유' } });
    fireEvent.click(screen.getByRole('button', { name: confirmText }));
    expect(callback === 'onReject' ? onReject : onStoreCancel).toHaveBeenCalledWith(91, '시험 사유');
    expect(callback === 'onReject' ? onStoreCancel : onReject).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each(['list', 'cards'])('선결제 예약은 결제 전 승인 도구를 숨겨요 (%s)', view => {
    const { rerender } = render(<ReservationCard view={view} reservation={{ id: 91, status: 'PENDING', depositAmount: 10000, depositPaid: false, allowLatePayment: false }} />);
    expect(screen.queryByRole('button', { name: /승인$/ })).toBeNull();
    expect(screen.getByRole('button', { name: /거절$/ })).toBeInTheDocument();
    rerender(<ReservationCard view={view} reservation={{ id: 91, status: 'PENDING', depositAmount: 10000, depositPaid: false, allowLatePayment: true }} />);
    expect(screen.getByRole('button', { name: /승인$/ })).toBeInTheDocument();
});

it.each(['list', 'cards'])('사업자 삭제와 미확인 예약의 완료·노쇼·취소 도구를 유지해요 (%s)', view => {
    const removable = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
    const statuses = [...removable, 'PENDING', 'CONFIRMED', 'UNCONFIRMED'];
    const remove = vi.fn();
    render(<>{statuses.map((status, index) => <section key={status} data-testid={status}>
        <ReservationCard view={view} reservation={{ id: index + 1, status }} onRemove={remove} />
    </section>)}</>);
    for (const [index, status] of statuses.entries()) {
        const item = within(screen.getByTestId(status));
        const button = item.queryByRole('button', { name: /삭제$/ });
        if (removable.includes(status)) {
            expect(button.querySelector('svg')).not.toBeNull();
            fireEvent.click(button);
            expect(remove).toHaveBeenLastCalledWith(index + 1);
        } else expect(button).toBeNull();
    }
    const unresolved = within(screen.getByTestId('UNCONFIRMED'));
    for (const name of ['완료', '노쇼', '취소']) {
        expect(unresolved.getByRole('button', { name: new RegExp(name + '$') })).toBeInTheDocument();
    }
});
