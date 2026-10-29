import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReservationCard from './ReservationCard';

vi.mock('antd', () => ({
    Flex: ({ children }) => <div>{children}</div>,
    Modal: ({ open, title, children, onOk, onCancel, okText, cancelText }) => open && <section role="dialog">
        {title}{children}<button onClick={onOk}>{okText}</button><button onClick={onCancel}>{cancelText}</button>
    </section>,
}));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ confirm: vi.fn() }) }));
vi.mock('../common', () => ({
    Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
    FormTextArea: ({ value, onChange }) => <textarea aria-label="처리 사유" value={value} onChange={onChange} />,
}));
vi.mock('./ReservationRow', () => ({ default: ({ renderActions }) => <div>{renderActions()}</div> }));
vi.mock('./ReservationSummaryCard', () => ({ default: ({ actions }) => <div>{actions}</div> }));
vi.mock('./ReservationDetailModal', () => ({ default: () => null }));

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
