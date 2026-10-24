import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceAdmissionController from './ServiceAdmissionController';
import useServiceAdmission from '../../hooks/useServiceAdmission';
import ResponsiveModal from './ResponsiveModal';

vi.mock('../../hooks/useServiceAdmission', () => ({ default: vi.fn() }));
vi.mock('./ResponsiveModal', () => ({ default: vi.fn(({ open, title, onCancel, closable, footer, children }) => open
    ? <section role="dialog" aria-label={title}>{closable !== false && <button aria-label="창 닫기" onClick={onCancel} />}{children}{footer}</section> : null) }));
vi.mock('./AnimatedContent', () => ({ default: ({ motionKey, children }) => <div data-testid={motionKey.startsWith('waiting:') ? 'message-motion' : 'motion'} data-motion-key={motionKey}>{children}</div> }));
const waiting = { mode: 'CORE', state: 'WAITING', position: 3, serverTime: 1 };
let admission;

describe('service admission preserves the current page', () => {
    beforeEach(() => {
        admission = { open: true, busy: false, error: null, status: waiting,
            close: vi.fn(), retry: vi.fn(), cancel: vi.fn() };
        useServiceAdmission.mockReset().mockImplementation(() => admission);
        ResponsiveModal.mockClear();
    });
    const tree = (path = '/store/31', children = <input aria-label="작성 중인 내용" defaultValue="남은 예약 내용" />) =>
        <MemoryRouter initialEntries={[path]}>{children}<ServiceAdmissionController /></MemoryRouter>;

    it('keeps the child form mounted and its input through waiting, polling, admitted, and close', () => {
        const mounted = vi.fn(); const submitted = vi.fn();
        function Form() {
            useEffect(() => { mounted(); }, []);
            return <form onSubmit={submitted}><input aria-label="작성 중인 내용" defaultValue="예약 초안" /></form>;
        }
        const view = render(tree('/store/31', <Form />));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '오래 작성한 예약 내용' } });
        expect(screen.getByRole('dialog', { name: '서비스 입장 대기' })).toBeInTheDocument();
        expect(screen.getByTestId('motion')).toHaveAttribute('data-motion-key', 'WAITING');
        admission = { ...admission, status: { ...waiting, position: 2, serverTime: 2000 } };
        view.rerender(tree('/store/31', <Form />));
        expect(screen.getByTestId('motion')).toHaveAttribute('data-motion-key', 'WAITING');
        admission = { ...admission, status: { ...waiting, state: 'ADMITTED', position: 0 } };
        view.rerender(tree('/store/31', <Form />));
        expect(submitted).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '창 닫기' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '계속 이용하기' }));
        expect(admission.close).toHaveBeenCalledOnce();
        expect(admission.cancel).not.toHaveBeenCalled();
        admission = { ...admission, open: false };
        view.rerender(tree('/store/31', <Form />));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(input).toBe(screen.getByRole('textbox'));
        expect(input).toHaveValue('오래 작성한 예약 내용');
        expect(mounted).toHaveBeenCalledOnce();
        expect(submitted).not.toHaveBeenCalled();
    });

    it.each(['/payment/result', '/my-reservations', '/my-page', '/login', '/signup/social', '/oauth2/callback', '/admin', '/store/31?edit=12'])('does not overlay preserved page %s', path => {
        render(tree(path));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('textbox')).toHaveValue('남은 예약 내용');
        expect(useServiceAdmission).toHaveBeenLastCalledWith({ workActive: false, entryAllowed: false });
    });

    it.each([
        ['/store/31', true], ['/store/31/', true], ['/store/register', true], ['/waiting', true],
        ['/stores', false], ['/feed', false], ['/store/31/edit', false], ['/payment/result', false, false], ['/store/31?edit=12', false, false],
    ])('requests CORE form keepalive only on %s', (path, expected, entryAllowed = true) => {
        render(tree(path));
        expect(useServiceAdmission).toHaveBeenLastCalledWith({ workActive: expected, entryAllowed });
    });

    it('requires explicit cancellation and preserves the content mobile sheet', () => {
        render(tree());
        expect(screen.queryByRole('button', { name: '창 닫기' })).toBeNull();
        expect(admission.close).not.toHaveBeenCalled();
        expect(admission.cancel).not.toHaveBeenCalled();
        expect(screen.getByText('취소해도 작성한 내용은 유지돼요.')).toHaveStyle({ whiteSpace: 'nowrap' });
        fireEvent.click(screen.getByRole('button', { name: '대기 취소' }));
        expect(admission.cancel).toHaveBeenCalledOnce();
        expect(ResponsiveModal.mock.calls.at(-1)[0]).toMatchObject({ mobileSize: 'content', width: 480, centered: true,
            closable: false, mask: { closable: false }, keyboard: false });
    });

    it('keeps repeated server errors under one motion key and provides an explicit retry', () => {
        admission = { ...admission, error: Object.assign(new Error('first upstream response'), { status: 503 }) };
        const view = render(tree());
        const key = screen.getByTestId('motion').getAttribute('data-motion-key');
        admission = { ...admission, error: Object.assign(new Error('second upstream response'), { status: 503 }) };
        view.rerender(tree());
        expect(screen.getByTestId('motion')).toHaveAttribute('data-motion-key', key);
        fireEvent.click(screen.getByRole('button', { name: /다시/ }));
        expect(admission.retry).toHaveBeenCalledOnce();
    });

    it('switches the near message at rank three without treating it as admission or restarting the whole body', () => {
        admission = { ...admission, status: { ...waiting, position: 7 } };
        const view = render(tree());
        expect(screen.queryByText('곧 입장할 차례예요.')).toBeNull();
        for (const position of [6, 3, 2, 1]) {
            admission = { ...admission, status: { ...waiting, position } };
            view.rerender(tree());
            expect(screen.getByTestId('motion')).toHaveAttribute('data-motion-key', 'WAITING');
            expect(screen.getByTestId('message-motion')).toHaveAttribute('data-motion-key', position <= 3 ? 'waiting:near' : 'waiting:normal');
            expect(screen.queryByRole('button', { name: '계속 이용하기' })).toBeNull();
        }
    });
});
