import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import useMessagesEntry from './useMessagesEntry';
import useAuthStore from '../store/useAuthStore';
import useMessengerStore from '../store/useMessengerStore';

function Entry() {
    const { openMessages, onMessagesLinkClick } = useMessagesEntry();
    const location = useLocation();
    return <>
        <Link to="/messages" onClick={onMessagesLinkClick}>메시지 확인</Link>
        <button onClick={() => openMessages({ toggle: true })}>메시지 창</button>
        <output aria-label="현재 주소">{location.pathname}</output>
    </>;
}

const renderEntry = () => render(<MemoryRouter initialEntries={['/guide/user']}><Entry /></MemoryRouter>);

describe('message entry without a desktop route round trip', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        useAuthStore.setState({ isLoggedIn: true, isLoggingOut: false, user: { id: 7, role: 'USER', termsAgreed: true } });
        useMessengerStore.setState({ open: false, view: 'home', activeThread: false });
    });

    it('keeps the current desktop page and opens the message panel once across repeated link clicks', () => {
        renderEntry();
        fireEvent.click(screen.getByRole('link', { name: '메시지 확인' }));
        fireEvent.click(screen.getByRole('link', { name: '메시지 확인' }));
        expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/guide/user');
        expect(useMessengerStore.getState().open).toBe(true);
        expect(useMessengerStore.getState().view).toBe('home');
    });

    it('uses the click-time mobile viewport and retains the message route', () => {
        renderEntry();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        fireEvent.click(screen.getByRole('link', { name: '메시지 확인' }));
        expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/messages');
        expect(useMessengerStore.getState().open).toBe(false);
    });

    it.each([
        { isLoggedIn: false, user: null },
        { isLoggingOut: true },
        { user: { id: 7, termsAgreed: false } },
    ])('leaves account gates to the protected route for %j', state => {
        act(() => useAuthStore.setState(state));
        renderEntry();
        fireEvent.click(screen.getByRole('link', { name: '메시지 확인' }));
        expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/messages');
        expect(useMessengerStore.getState().open).toBe(false);
    });

    it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('preserves native modified clicks for %s', modifier => {
        renderEntry();
        fireEvent.click(screen.getByRole('link', { name: '메시지 확인' }), { [modifier]: true });
        expect(useMessengerStore.getState().open).toBe(false);
    });

    it('toggles the desktop launcher without adding message history', () => {
        renderEntry();
        const launcher = screen.getByRole('button', { name: '메시지 창' });
        fireEvent.click(launcher);
        expect(useMessengerStore.getState().open).toBe(true);
        fireEvent.click(launcher);
        expect(useMessengerStore.getState().open).toBe(false);
        expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/guide/user');
    });
});
