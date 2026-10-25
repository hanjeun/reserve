import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import MessengerShell from './MessengerShell';
import MessagesPage from '../../pages/member/MessagesPage';
import SearchPage from '../../pages/Search';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';
import searchService from '../../services/searchService';

vi.mock('../../services', () => ({ chatService: { getUnread: vi.fn().mockResolvedValue(0) } }));
vi.mock('../../services/searchService', () => ({ default: { public: vi.fn(), personal: vi.fn() } }));
vi.mock('./MessengerContent', () => ({ default: ({ onClose }) => <div>
    <button type="button">기존 패널 작업</button><textarea aria-label="기존 대화 입력" />
    {onClose && <button type="button" onClick={onClose}>본문 닫기</button>}
</div> }));

const result = (keyword, keys, destination) => ({ keyword, groups: keys.map(key => ({ key, error: null, hasMore: false,
    items: key === 'messages' && destination ? [{ id: 19, type: 'MESSAGE', title: '검색 대화', path: destination, description: '합성 결과' }] : [] })) });
const publicResult = keyword => result(keyword, ['stores', 'benefits', 'feed']);
const personalResult = (keyword, destination) => result(keyword, ['reservations', 'waiting', 'messages'], destination);
const path = () => screen.getByLabelText('현재 경로').textContent;
const messageLink = destination => [...document.querySelectorAll('.reserve-search-content a')].find(link => link.getAttribute('href') === destination);
const CurrentRoute = () => { const location = useLocation(); return <output aria-label="현재 경로">{location.pathname + location.search}</output>; };
// React selects the prefixed event when jsdom has CSS animation support without AnimationEvent.
function finishAnimation(target) {
    const style = document.createElement('div').style;
    const type = 'AnimationEvent' in window ? 'animationend' : 'WebkitAnimation' in style ? 'webkitAnimationEnd'
        : 'MozAnimation' in style ? 'mozAnimationEnd' : 'animationend';
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'reserve-chat-out' });
    fireEvent(target, event);
    return event;
}
const clients = new Set();
function setup(entry) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.add(client);
    return render(<QueryClientProvider client={client}><AntApp><MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/search" element={<SearchPage />} /><Route path="/messages" element={<MessagesPage />} /></Routes>
        <MessengerShell /><CurrentRoute />
    </MemoryRouter></AntApp></QueryClientProvider>);
}
const searchEntry = (saved, keyword = '카페') => ({ pathname: '/search', search: '?keyword=' + encodeURIComponent(keyword),
    state: { searchEntry: true, ...(saved ? { searchReturn: saved } : {}) } });

describe('search return through the real messages route and desktop shell', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        window.history.replaceState({ ...window.history.state, idx: 1 }, '');
        window.scrollTo = vi.fn();
        useAuthStore.setState({ user: { id: 7, role: 'USER', termsAgreed: true }, isLoggedIn: true,
            authRestoring: false, isLoggingOut: false, sessionRevision: 70 });
        useMessengerStore.setState({ open: false, view: 'home', activeThread: false, selection: { kind: 'support' },
            storeSearch: null, drafts: {}, sessionIdentity: messengerIdentityOf(useAuthStore.getState()) });
        searchService.public.mockImplementation(keyword => Promise.resolve(publicResult(keyword)));
        searchService.personal.mockImplementation(keyword => Promise.resolve(personalResult(keyword, '/messages?kind=support')));
    });
    afterEach(() => { clients.forEach(client => client.clear()); clients.clear(); });

    it.each([
        ['menu', '/messages', '메시지', 'USER', false],
        ['personal support', '/messages?kind=support', '카페', 'USER', true],
        ['personal store', '/messages?storeId=42', '카페', 'USER', false],
        ['owner inbox', '/messages?ownerRoomId=78', '카페', 'BUSINESS', false],
    ])('opens only the explicitly selected %s panel after the real route effect and restores its result focus', async (_name, destination, keyword, role, delayReturn) => {
        useAuthStore.setState({ user: { ...useAuthStore.getState().user, role } });
        let finishReturn;
        searchService.personal.mockImplementation(term => Promise.resolve(personalResult(term, destination)));
        if (delayReturn) searchService.personal.mockResolvedValueOnce(personalResult(keyword, destination))
            .mockImplementationOnce(() => new Promise(resolve => { finishReturn = resolve; }));
        const user = userEvent.setup();
        const { container } = setup(searchEntry(null, keyword));
        await waitFor(() => expect(messageLink(destination)).toBeVisible());
        expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull();
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
        await user.click(messageLink(destination));
        const dialog = await screen.findByRole('dialog', { name: '메시지' });
        expect(path()).toBe('/search?keyword=' + encodeURIComponent(keyword));
        expect(container.querySelector('.reserve-messages-page')).toBeNull();
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
        await waitFor(() => expect(dialog).toContainElement(document.activeElement));
        if (delayReturn) {
            await waitFor(() => expect(finishReturn).toBeTypeOf('function'));
            await act(async () => finishReturn(personalResult(keyword, destination)));
            await waitFor(() => expect(messageLink(destination)).toBeVisible());
            await act(async () => new Promise(resolve => requestAnimationFrame(resolve)));
            expect(dialog).toContainElement(document.activeElement);
        }
        await user.click(screen.getByRole('button', { name: '메시지 닫기' }));
        expect(dialog).toHaveClass('is-closing');
        if (delayReturn) await waitFor(() => expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull());
        else {
            expect(screen.getByRole('dialog', { name: '메시지' })).toBe(dialog);
            await act(async () => { finishAnimation(screen.getByRole('button', { name: '기존 패널 작업' })); });
            expect(screen.getByRole('dialog', { name: '메시지' })).toBe(dialog);
            let received;
            await act(async () => { received = finishAnimation(dialog); });
            expect(received.target).toBe(dialog);
            expect(received.animationName).toBe('reserve-chat-out');
        }
        expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull();
        expect(messageLink(destination)).toHaveFocus();
        expect(path()).toBe('/search?keyword=' + encodeURIComponent(keyword));
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
    });

    it('keeps a panel opened before an ordinary search entry hidden without changing its selection', () => {
        useMessengerStore.getState().openSupport();
        const { container } = setup(searchEntry(null));
        expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull();
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
        expect(useMessengerStore.getState().selection).toEqual({ kind: 'support' });
        expect(useMessengerStore.getState().open).toBe(true);
    });
    it.each([
        ['another keyword', { keyword: '다른 말', path: '/messages?kind=support' }],
        ['external URL', { keyword: '카페', path: 'https://example.test/messages?kind=support' }],
        ['extra query', { keyword: '카페', path: '/messages?kind=support&redirect=/admin' }],
        ['owner-only target', { keyword: '카페', path: '/messages?ownerRoomId=78' }],
        ['different selection', { keyword: '카페', path: '/messages?storeId=42' }],
    ])('does not reveal an existing conversation for a %s return hint', (_name, saved) => {
        useMessengerStore.getState().openSupport();
        const { container } = setup(searchEntry(saved));
        expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull();
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
    });
    it('drops the visible search-panel exception immediately when the account epoch changes', async () => {
        useMessengerStore.getState().openSupport();
        setup(searchEntry({ keyword: '카페', path: '/messages?kind=support' }));
        expect(await screen.findByRole('dialog', { name: '메시지' })).toBeInTheDocument();
        act(() => useAuthStore.setState({ user: { id: 8, role: 'USER', termsAgreed: true }, sessionRevision: 71 }));
        expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull();
        expect(screen.queryByRole('button', { name: '기존 패널 작업' })).toBeNull();
    });
    it('keeps a selected mobile conversation on the existing messages page without a desktop shell or launcher', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        const user = userEvent.setup();
        const { container } = setup(searchEntry(null));
        await waitFor(() => expect(messageLink('/messages?kind=support')).toBeVisible());
        await user.click(messageLink('/messages?kind=support'));
        await waitFor(() => expect(path()).toBe('/messages?kind=support'));
        expect(container.querySelector('.reserve-messages-page')).toBeInTheDocument();
        expect(screen.queryByRole('dialog', { name: '메시지' })).toBeNull();
        expect(container.querySelector('.reserve-messenger-launcher-wrap')).toBeNull();
    });
});
