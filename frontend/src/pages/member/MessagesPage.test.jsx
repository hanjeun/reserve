import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessagesPage from './MessagesPage';
import { requestMessengerRouteClose } from '../../components/chat/messengerRouteTransition';
import useMessengerStore from '../../store/useMessengerStore';

const { goBack } = vi.hoisted(() => ({ goBack: vi.fn() }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => goBack }));
vi.mock('../../components/chat/MessengerContent', () => ({
    default: () => <div>메시지 본문</div>,
}));

describe('MessagesPage route motion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        useMessengerStore.setState({ open: false, view: 'home', activeThread: false });
    });

    it('does not render a second close launcher on the mobile route', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/messages']}>
                <MessagesPage />
            </MemoryRouter>,
        );
        const page = container.querySelector('.reserve-messages-route');
        expect(page).toHaveClass('is-opening');
        expect(screen.queryByRole('button', { name: '메시지 화면 닫기' })).not.toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
    });

    it('uses the same close motion for the shared header back request', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/messages']}>
                <MessagesPage />
            </MemoryRouter>,
        );
        act(() => expect(requestMessengerRouteClose()).toBe(true));
        const page = container.querySelector('.reserve-messages-route');
        expect(page).toHaveClass('is-closing');
        fireEvent.animationEnd(page);
        return waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
    });

    it('plays the close motion and then goes to the requested destination', async () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/messages']}>
                <Routes>
                    <Route path="/messages" element={<MessagesPage />} />
                    <Route path="/" element={<div>home-screen</div>} />
                </Routes>
            </MemoryRouter>,
        );
        act(() => expect(requestMessengerRouteClose('/')).toBe(true));
        const page = container.querySelector('.reserve-messages-route');
        expect(page).toHaveClass('is-closing');
        fireEvent.animationEnd(page);
        expect(await screen.findByText('home-screen')).toBeInTheDocument();
        expect(goBack).not.toHaveBeenCalled();
    });

    it('hands any desktop messages route back to the desktop panel', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        const { container } = render(
            <MemoryRouter initialEntries={['/messages']}>
                <MessagesPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
        expect(useMessengerStore.getState().open).toBe(true);
        expect(container.querySelector('.reserve-messages-route')).toBeNull();
    });
});
