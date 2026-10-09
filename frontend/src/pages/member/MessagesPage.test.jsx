import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessagesPage from './MessagesPage';
import { requestMessengerRouteClose } from '../../components/chat/messengerRouteTransition';
import useMessengerStore from '../../store/useMessengerStore';
import { createLoadingPresentation, LoadingPresentationContext } from '../../components/layout/loadingPresentation';

const { goBack } = vi.hoisted(() => ({ goBack: vi.fn() }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => goBack }));
vi.mock('../../components/chat/MessengerContent', () => ({
    default: ({ onClose }) => <div>메시지 본문<button onClick={onClose} aria-label="메시지 닫기" /></div>,
}));

describe('MessagesPage route motion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        useMessengerStore.setState({ open: false, view: 'home', activeThread: false });
    });

    it('closes through the content X using the existing route motion without a second launcher', async () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/messages']}>
                <MessagesPage />
            </MemoryRouter>,
        );
        const page = container.querySelector('.reserve-messages-route');
        expect(page).toHaveClass('is-opening');
        const close = screen.getByRole('button', { name: '메시지 닫기' });
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
        fireEvent.click(close);
        fireEvent.click(close);
        expect(page).toHaveClass('is-closing');
        expect(goBack).not.toHaveBeenCalled();
        fireEvent.animationEnd(page);
        fireEvent.animationEnd(page);
        await waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
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

    it('keeps the selected store when a desktop login returns to a store message link', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        render(<MemoryRouter initialEntries={['/messages?storeId=42']}><MessagesPage /></MemoryRouter>);
        await waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
        expect(useMessengerStore.getState().selection).toEqual({ kind: 'store', storeId: 42 });
        expect(useMessengerStore.getState().activeThread).toBe(true);
    });

    it('does not restart opacity from zero after a route skeleton and still animates closing', async () => {
        const presentation = createLoadingPresentation('messages-entry');
        presentation.markSkeletonShown();
        const { container } = render(<MemoryRouter initialEntries={['/messages']}>
            <LoadingPresentationContext.Provider value={presentation}><MessagesPage /></LoadingPresentationContext.Provider>
        </MemoryRouter>);
        const page = container.querySelector('.reserve-messages-route');
        expect(page).not.toHaveClass('is-opening');
        fireEvent.click(screen.getByRole('button', { name: '메시지 닫기' }));
        expect(page).toHaveClass('is-closing');
        fireEvent.animationEnd(page);
        await waitFor(() => expect(goBack).toHaveBeenCalledTimes(1));
    });
});
