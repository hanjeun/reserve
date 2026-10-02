import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
