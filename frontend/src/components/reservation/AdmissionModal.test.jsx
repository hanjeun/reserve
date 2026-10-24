import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdmissionModal from './AdmissionModal';
import ResponsiveModal from '../common/ResponsiveModal';

vi.mock('../common/ResponsiveModal', () => ({ default: vi.fn(({ open, title, onCancel, closable, footer, children }) => open
    ? <section role="dialog" aria-label={title}>{closable !== false && <button type="button" aria-label="창 닫기" onClick={onCancel} />}{children}{footer}</section> : null) }));

describe('reservation admission decisions', () => {
    it('is safe before the hook has supplied modal props', () => {
        render(<AdmissionModal />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('requires explicit cancellation or continuing instead of an implicit close', () => {
        const onClose = vi.fn();
        const onCancel = vi.fn();
        const onContinue = vi.fn();
        const view = render(<AdmissionModal open status={{ state: 'WAITING', position: 3 }} hasTicket
            onClose={onClose} onCancel={onCancel} onContinue={onContinue} />);
        expect(screen.getByText('번째').parentElement).toHaveAttribute('data-rank', '3');
        expect(screen.queryByRole('button', { name: '창 닫기' })).toBeNull();
        expect(ResponsiveModal.mock.calls.at(-1)[0]).toMatchObject({ closable: false, mask: { closable: false }, keyboard: false });
        expect(screen.getByText('취소해도 작성한 내용은 유지돼요.')).toHaveStyle({ whiteSpace: 'nowrap' });
        expect(onClose).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '예약 계속하기' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: '대기 취소' }));
        expect(onCancel).toHaveBeenCalledOnce();
        view.rerender(<AdmissionModal open status={{ state: 'ADMITTED', position: 0 }} hasTicket remainingSeconds={20}
            canContinue onClose={onClose} onCancel={onCancel} onContinue={onContinue} />);
        expect(screen.queryByRole('button', { name: '창 닫기' })).toBeNull();
        expect(onContinue).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '예약 계속하기' }));
        expect(onContinue).toHaveBeenCalledOnce();
    });

    it.each(['EXPIRED', 'CANCELLED', 'FULL'])('offers only an explicit new wait for %s', state => {
        const onRetry = vi.fn();
        const onClose = vi.fn();
        render(<AdmissionModal open status={{ state, position: 0 }} onRetry={onRetry} onClose={onClose} />);
        expect(onRetry).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '예약 계속하기' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '다시 대기하기' }));
        expect(onRetry).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it.each(['CLAIMED', 'CONSUMED'])('does not cancel or automatically submit a %s request', state => {
        render(<AdmissionModal open status={{ state, position: 0 }} hasTicket onClose={vi.fn()} />);
        expect(screen.queryByRole('button', { name: '대기 취소' })).toBeNull();
        expect(screen.queryByRole('button', { name: '예약 계속하기' })).toBeNull();
        expect(screen.getByText(/예약 내역에서/)).toBeInTheDocument();
    });

    it('offers a new reservation wait only after the previous ticket was consumed', () => {
        const onRetry = vi.fn();
        const view = render(<AdmissionModal open status={{ state: 'CLAIMED' }} hasTicket onRetry={onRetry} />);
        expect(screen.queryByRole('button', { name: '새 예약 대기' })).toBeNull();
        view.rerender(<AdmissionModal open status={{ state: 'CONSUMED' }} hasTicket onRetry={onRetry} />);
        expect(onRetry).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '새 예약 대기' }));
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('keeps near ranks waiting until the server reports ADMITTED', () => {
        const onContinue = vi.fn();
        const view = render(<AdmissionModal open status={{ state: 'WAITING', position: 7 }} hasTicket onContinue={onContinue} />);
        expect(screen.getByText('차례가 되면 예약을 계속할 수 있어요.')).toBeInTheDocument();
        for (const position of [6, 3, 2, 1]) {
            view.rerender(<AdmissionModal open status={{ state: 'WAITING', position }} hasTicket onContinue={onContinue} />);
            expect(screen.getByRole('button', { name: '예약 계속하기' })).toBeDisabled();
            if (position <= 3) expect(screen.getByText('곧 입장할 차례예요.')).toBeInTheDocument();
        }
        expect(onContinue).not.toHaveBeenCalled();
        view.rerender(<AdmissionModal open status={{ state: 'ADMITTED', position: 0 }} hasTicket canContinue onContinue={onContinue} />);
        expect(screen.getByRole('button', { name: '예약 계속하기' })).toBeEnabled();
        expect(onContinue).not.toHaveBeenCalled();
    });
});
