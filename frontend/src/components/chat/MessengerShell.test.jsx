import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import MessengerShell from './MessengerShell';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';
import { chatService } from '../../services';
import { chatKeys } from '../../hooks/queryKeys';

vi.mock('../../services', () => ({
    chatService: { getUnread: vi.fn().mockResolvedValue(2) },
}));

vi.mock('./MessengerContent', () => ({
    default: () => <div><button type="button">첫 작업</button><textarea aria-label="테스트 입력" /></div>,
}));

const renderShell = (props = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return { client, ...render(
        <QueryClientProvider client={client}>
            <AntApp>
                <MemoryRouter initialEntries={['/store/42']}>
                    <MessengerShell {...props} />
                    <CurrentRoute />
                </MemoryRouter>
            </AntApp>
        </QueryClientProvider>,
    ) };
};

const CurrentRoute = () => <output aria-label="현재 경로">{useLocation().pathname}</output>;

describe('MessengerShell accessibility', () => {
    beforeEach(() => {
        chatService.getUnread.mockReset().mockResolvedValue(2);
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        useAuthStore.setState({
            user: { id: 7, role: 'USER', email: 'member7@example.com' },
            isLoggedIn: true,
        });
        useMessengerStore.setState({
            open: false,
            storeOpenRevision: 0,
            view: 'home',
            activeThread: false,
            drafts: {},
            selection: { kind: 'support' },
            sessionIdentity: messengerIdentityOf(useAuthStore.getState()),
        });
    });

    it('opens the mobile message page from the single launcher without a desktop dialog', async () => {
        const user = userEvent.setup();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        renderShell();
        await user.click(await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' }));
        expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/messages');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(useMessengerStore.getState().view).toBe('home');
    });

    it('uses the click-time viewport when the debounced width is stale', async () => {
        const user = userEvent.setup();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        renderShell();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });

        await user.click(await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' }));

        expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/store/42');
        expect(useMessengerStore.getState().open).toBe(true);
    });

    it('closes with Escape and restores focus to the launcher after its exit animation', async () => {
        const user = userEvent.setup();
        renderShell();
        const launcher = await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' });
        await user.click(launcher);
        const dialog = await screen.findByRole('dialog', { name: '메시지' });

        await waitFor(() => expect(dialog).toContainElement(document.activeElement));
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(useMessengerStore.getState().open).toBe(false);
        await waitFor(() => expect(dialog).toHaveClass('is-closing'));
        fireEvent.animationEnd(dialog, { animationName: 'reserve-chat-out' });

        await waitFor(() => expect(screen.queryByRole('dialog', { name: '메시지' })).not.toBeInTheDocument());
        expect(launcher).toHaveFocus();
    });

    it('replays the existing opening animation for store contact in an open panel without remounting its conversation', async () => {
        const user = userEvent.setup();
        renderShell();
        await user.click(await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' }));
        const dialog = await screen.findByRole('dialog', { name: '메시지' });
        const input = screen.getByRole('textbox', { name: '테스트 입력' });
        const animation = { animationName: 'reserve-chat-in', currentTime: 320, play: vi.fn() };
        const getAnimations = vi.fn(() => [animation]);
        dialog.getAnimations = getAnimations;
        act(() => {
            useMessengerStore.getState().setDraft('store:42', '작성 중인 문의');
            useMessengerStore.getState().openStore(42);
        });
        expect(screen.getByRole('dialog', { name: '메시지' })).toBe(dialog);
        expect(screen.getByRole('textbox', { name: '테스트 입력' })).toBe(input);
        expect(dialog).toHaveClass('reserve-chat-panel');
        expect(animation.currentTime).toBe(0);
        expect(animation.play).toHaveBeenCalledTimes(1);
        expect(useMessengerStore.getState().selection).toEqual({ kind: 'store', storeId: 42 });
        expect(useMessengerStore.getState().drafts['store:42']).toBe('작성 중인 문의');
        act(() => useMessengerStore.getState().select({ kind: 'store', storeId: 43 }));
        expect(animation.play).toHaveBeenCalledTimes(1);
        act(() => useMessengerStore.getState().openStore(42));
        expect(animation.play).toHaveBeenCalledTimes(2);
    });

    it('supports a decorative launcher photo but keeps the open-panel close action', async () => {
        const user = userEvent.setup();
        renderShell({ launcherImageSrc: '/icons/RESERVE_logo.png' });
        const launcher = await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' });
        const image = launcher.querySelector('img');
        expect(image).toHaveAttribute('src', '/icons/RESERVE_logo.png');
        expect(image).toHaveAttribute('alt', '');
        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
        await user.click(launcher);
        const launcherClose = screen.getByRole('button', { name: '메시지 창 닫기' });
        expect(launcherClose).toBe(launcher);
        expect(launcherClose.querySelector('.anticon-close')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '메시지 닫기' })).toBeInTheDocument();
        await user.click(launcherClose);
        expect(useMessengerStore.getState().open).toBe(false);
        expect(launcher.querySelector('img')).toHaveAttribute('src', '/icons/RESERVE_logo.png');
    });

    it('stops automatic unread requests on a missing endpoint without opening a room', async () => {
        chatService.getUnread.mockRejectedValue(Object.assign(new Error('경로 없음'), { status: 404 }));
        const { client } = renderShell();
        await waitFor(() => expect(client.getQueryCache().find({ queryKey: chatKeys.unread() })?.state.status).toBe('error'));
        const query = client.getQueryCache().find({ queryKey: chatKeys.unread() });
        expect(query.options.retry(0, query.state.error)).toBe(false);
        expect(query.options.refetchInterval(query)).toBe(false);
        expect(query.options.refetchOnWindowFocus(query)).toBe(false);
        expect(query.options.refetchOnReconnect(query)).toBe(false);
        expect(chatService.getUnread).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('preserves the closed-launcher unread recovery interval at 60 seconds', async () => {
        const { client } = renderShell();
        await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' });
        const query = client.getQueryCache().find({ queryKey: chatKeys.unread() });
        expect(query.options.refetchInterval(query)).toBe(60000);
    });

    it('falls back to the message icon when a launcher photo cannot load', async () => {
        renderShell({ launcherImageSrc: '/icons/missing-launcher-photo.png' });
        const launcher = await screen.findByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' });
        fireEvent.error(launcher.querySelector('img'));
        expect(launcher.querySelector('img')).toBeNull();
        expect(launcher.querySelector('.anticon-message')).toBeInTheDocument();
    });
});
