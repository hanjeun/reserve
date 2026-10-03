import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MessengerContent from './MessengerContent';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';

vi.mock('../../services', () => ({
    chatService: {
        listConversations: vi.fn(),
        listStoreInbox: vi.fn(),
        getSupport: vi.fn(),
        sendSupport: vi.fn(),
        getStore: vi.fn(),
        sendStore: vi.fn(),
        getStoreInboxRoom: vi.fn(),
        sendStoreInbox: vi.fn(),
        listAdminSupportInbox: vi.fn(),
        getAdminSupportRoom: vi.fn(),
        pollAdminSupportRoom: vi.fn(),
        sendAdminSupportRoom: vi.fn(),
        markAdminSupportRead: vi.fn(),
        pollRoom: vi.fn(),
        pollRetractions: vi.fn(),
        getHistory: vi.fn(),
        markRead: vi.fn(),
        setBlocked: vi.fn(),
        setHidden: vi.fn(),
        reportConversation: vi.fn(),
    },
}));

const page = (content = []) => ({
    content,
    page: { number: 0, totalPages: 1, totalElements: content.length },
});

const renderMessenger = (props = {}) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return render(
        <QueryClientProvider client={client}>
            <AntApp>
                <MemoryRouter initialEntries={['/messages']}>
                    <MessengerContent {...props} />
                </MemoryRouter>
            </AntApp>
        </QueryClientProvider>,
    );
};

describe('MessengerContent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        Element.prototype.scrollIntoView = vi.fn();
        useAuthStore.setState({
            user: { id: 7, role: 'USER', name: '회원7', email: 'member7@example.com' },
            isLoggedIn: true,
        });
        useMessengerStore.setState({
            open: false,
            view: 'conversations',
            activeThread: true,
            drafts: {},
            selection: { kind: 'support' },
            sessionIdentity: messengerIdentityOf(useAuthStore.getState()),
        });
        chatService.listConversations.mockResolvedValue(page());
        chatService.listStoreInbox.mockResolvedValue(page());
        chatService.listAdminSupportInbox.mockResolvedValue(page());
        chatService.pollAdminSupportRoom.mockResolvedValue([]);
        chatService.markAdminSupportRead.mockResolvedValue({});
        chatService.pollRoom.mockResolvedValue([]);
        chatService.pollRetractions.mockResolvedValue({ messages: [], nextRevision: 0 });
        chatService.markRead.mockResolvedValue({});
        chatService.setBlocked.mockResolvedValue({ blocked: false, blockedByMe: false });
        chatService.setHidden.mockResolvedValue(null);
        chatService.reportConversation.mockResolvedValue({ id: 5, status: 'OPEN' });
        chatService.getSupport.mockResolvedValue({
            roomId: 1,
            type: 'SUPPORT',
            title: 'RESERVE 고객지원',
            viewerRole: 'MEMBER',
            canSend: true,
            messages: [],
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('opens the hidden list separately and keeps stable room access for reporting', async () => {
        useMessengerStore.setState({ view: 'conversations', activeThread: false });
        chatService.listConversations.mockImplementation((_page, hidden) => Promise.resolve(page(hidden ? [{
            roomId: 12, type: 'STORE', storeId: 42, storeName: '숨긴 가게', counterpartName: '숨긴 가게', viewerRole: 'MEMBER',
        }] : [])));
        chatService.getStore.mockResolvedValue({ roomId: 12, type: 'STORE', storeId: 42, title: '숨긴 가게',
            viewerRole: 'MEMBER', canSend: true, messages: [] });
        renderMessenger();
        fireEvent.click(await screen.findByRole('button', { name: '숨긴 대화 보기' }));
        expect(await screen.findByRole('button', { name: '일반 대화 보기' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('heading', { name: '숨긴 대화' })).toBeInTheDocument();
        fireEvent.click(await screen.findByRole('button', { name: /숨긴 가게/ }));
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalledWith(0, true));
        fireEvent.click(await screen.findByRole('button', { name: '대화 관리' }));
        expect(await screen.findByText('대화 복원')).toBeInTheDocument();
        expect(await screen.findByText('대화 신고')).toBeInTheDocument();
    });

    it.each(['home', 'conversations', 'settings'])('keeps one X on the mobile %s page', async view => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        useMessengerStore.setState({ view, activeThread: false });
        const onClose = vi.fn();
        renderMessenger({ surface: 'page', onClose });
        const close = screen.getByRole('button', { name: '메시지 닫기' });
        expect(screen.getAllByRole('button', { name: '메시지 닫기' })).toHaveLength(1);
        fireEvent.click(close);
        expect(onClose).toHaveBeenCalledOnce();
        expect(useMessengerStore.getState().view).toBe(view);
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalled());
    });

    it('keeps thread back separate from closing the whole mobile messenger', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        useMessengerStore.getState().showHome();
        const onClose = vi.fn();
        const { container } = renderMessenger({ surface: 'page', onClose });
        fireEvent.click(screen.getByRole('button', { name: '고객지원에 문의' }));
        await screen.findByRole('button', { name: '대화 목록으로 돌아가기' });
        const thread = container.querySelector('.reserve-messenger-thread');
        fireEvent.animationEnd(thread);
        fireEvent.click(screen.getByRole('button', { name: '대화 목록으로 돌아가기' }));
        fireEvent.animationEnd(thread);
        expect(onClose).not.toHaveBeenCalled();
        expect(useMessengerStore.getState().view).toBe('conversations');
        fireEvent.click(screen.getByRole('button', { name: '메시지 닫기' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('opens a launcher home without creating, polling or reading a conversation', async () => {
        const user = userEvent.setup();
        useMessengerStore.getState().showHome();
        renderMessenger();
        expect(await screen.findByRole('heading', { name: '메시지' })).toHaveClass('reserve-messenger-sr-only');
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalled());
        expect(screen.getByText('안녕하세요. 궁금한 점을 남겨주세요.')).toBeInTheDocument();
        expect(screen.queryByText('최근 대화')).not.toBeInTheDocument();
        expect(chatService.getSupport).not.toHaveBeenCalled();
        expect(chatService.pollRoom).not.toHaveBeenCalled();
        expect(chatService.markRead).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '고객지원에 문의' }));
        await waitFor(() => expect(chatService.getSupport).toHaveBeenCalledTimes(1));
    });

    it('keeps the inquiry home usable and exposes list failures only in conversations', async () => {
        const user = userEvent.setup();
        useMessengerStore.getState().showHome();
        chatService.listConversations.mockRejectedValue(new Error('offline'));
        renderMessenger();
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: '고객지원에 문의' })).toBeEnabled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByText('아직 시작한 대화가 없습니다.')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '대화', exact: true }));
        expect(await screen.findByRole('alert')).toHaveTextContent('대화 목록을 불러오지 못했습니다.');
        expect(screen.queryByRole('button', { name: '고객지원에 문의' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('대화 선택 안내')).toBeInTheDocument();
        expect(chatService.getSupport).not.toHaveBeenCalled();
    });

    it('refreshes only the member list for a regular user without opening or reading a room', async () => {
        const user = userEvent.setup();
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });
        const refresh = await screen.findByRole('button', { name: '대화 목록 새로고침' });
        await waitFor(() => expect(refresh).not.toHaveAttribute('aria-busy', 'true'));
        expect(chatService.listStoreInbox).not.toHaveBeenCalled();
        await user.click(refresh);
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalledTimes(2));
        expect(chatService.listStoreInbox).not.toHaveBeenCalled();
        expect(chatService.getSupport).not.toHaveBeenCalled();
        expect(chatService.markRead).not.toHaveBeenCalled();
    });

    it('keeps the last successful conversation list visible when a refresh fails', async () => {
        const user = userEvent.setup();
        const row = {
            roomId: 42,
            storeId: 42,
            type: 'STORE',
            viewerRole: 'MEMBER',
            counterpartName: '새로고침 검증 가게',
            unread: 0,
        };
        const missingRoute = Object.assign(new Error('요청하신 경로를 찾을 수 없습니다.'), { status: 404 });
        chatService.listConversations.mockResolvedValueOnce(page([row])).mockRejectedValueOnce(missingRoute);
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });

        expect(await screen.findByRole('button', { name: /새로고침 검증 가게/ })).toBeVisible();
        await user.click(screen.getByRole('button', { name: '대화 목록 새로고침' }));

        expect(await screen.findByText('최신 대화를 확인하지 못해 이전 목록을 보여드리고 있습니다.'))
            .toBeVisible();
        expect(screen.getByRole('button', { name: /새로고침 검증 가게/ })).toBeVisible();
        expect(screen.getByRole('alert')).toHaveTextContent('최신 대화를 확인하지 못해 이전 목록을 보여드리고 있습니다.');
    });

    it.each(['BUSINESS', 'ADMIN'])('refreshes both available lists for %s without opening a room', async role => {
        const user = userEvent.setup();
        useAuthStore.setState({ user: { id: 7, role } });
        useMessengerStore.getState().syncIdentity(messengerIdentityOf(useAuthStore.getState()));
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });
        const refresh = await screen.findByRole('button', { name: '대화 목록 새로고침' });
        await waitFor(() => expect(refresh).not.toHaveAttribute('aria-busy', 'true'));
        await user.click(refresh);
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(chatService.listStoreInbox).toHaveBeenCalledTimes(2));
        if (role === 'ADMIN') {
            await waitFor(() => expect(chatService.listAdminSupportInbox).toHaveBeenCalledTimes(2));
        } else {
            expect(chatService.listAdminSupportInbox).not.toHaveBeenCalled();
        }
        expect(chatService.getSupport).not.toHaveBeenCalled();
        expect(chatService.markRead).not.toHaveBeenCalled();
    });

    it('moves the administrator support inbox into the shared messenger', async () => {
        const user = userEvent.setup();
        useAuthStore.setState({
            user: { id: 1, role: 'ADMIN', name: '관리자' },
            isLoggedIn: true,
        });
        useMessengerStore.getState().syncIdentity(messengerIdentityOf(useAuthStore.getState()));
        chatService.listAdminSupportInbox.mockResolvedValue(page([{
            id: 91,
            memberName: '고객 김',
            memberEmail: 'customer@example.com',
            adminUnread: 2,
            lastMessagePreview: '예약 변경 문의입니다',
            lastMessageAt: '2026-09-17T10:00:00',
        }]));
        chatService.getAdminSupportRoom.mockResolvedValue([{
            id: 11, senderRole: 'MEMBER', content: '예약 변경 문의입니다',
        }]);
        chatService.sendAdminSupportRoom.mockResolvedValue({
            id: 12, senderRole: 'ADMIN', content: '확인했습니다',
        });
        renderMessenger({ surface: 'panel' });

        await user.click(await screen.findByRole('button', { name: '고객 문의 확인' }));
        expect(await screen.findByText('고객지원 받은 문의')).toBeInTheDocument();
        const row = await screen.findByRole('button', { name: /고객 김/ });
        expect(row).toHaveTextContent('예약 변경 문의입니다');
        await user.click(row);
        await waitFor(() => expect(chatService.getAdminSupportRoom).toHaveBeenCalledWith(91));
        await user.type(screen.getByRole('textbox', { name: '메시지 입력' }), '확인했습니다');
        await user.click(screen.getByRole('button', { name: '보내기' }));
        await waitFor(() => expect(chatService.sendAdminSupportRoom).toHaveBeenCalledWith(
            91, '확인했습니다', expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }),
        ));
    });

    it('shows a support room once when an administrator also owns that member conversation', async () => {
        useAuthStore.setState({
            user: { id: 1, role: 'ADMIN', name: '관리자' },
            isLoggedIn: true,
        });
        useMessengerStore.getState().syncIdentity(messengerIdentityOf(useAuthStore.getState()));
        chatService.listAdminSupportInbox.mockResolvedValue(page([{
            id: 91,
            memberName: '한재은',
            memberEmail: 'han@example.com',
            adminUnread: 1,
            lastMessagePreview: '고객 문의입니다',
        }]));
        chatService.listConversations.mockResolvedValue(page([{
            roomId: 91,
            type: 'SUPPORT',
            viewerRole: 'MEMBER',
            counterpartName: 'RESERVE 고객지원',
            unread: 0,
            lastMessagePreview: '고객 문의입니다',
        }]));
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });

        const adminInbox = await screen.findByRole('region', { name: '고객지원 받은 문의' });
        const adminRow = await screen.findByRole('button', { name: /한재은/ });
        expect(within(adminInbox).getAllByRole('button')).toEqual([adminRow]);
        const myConversations = screen.getByRole('region', { name: '내 대화' });
        expect(within(myConversations).queryByRole('button', { name: /RESERVE 고객지원/ })).not.toBeInTheDocument();
    });

    it('keeps a real 404 failure visible and permits an explicit retry to recover', async () => {
        const user = userEvent.setup();
        const missingRoute = Object.assign(new Error('요청하신 경로를 찾을 수 없습니다.'), { status: 404 });
        chatService.listConversations.mockRejectedValueOnce(missingRoute).mockResolvedValue(page());
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });
        expect(await screen.findByRole('alert')).toHaveTextContent(
            '요청한 대화 목록을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
        );
        expect(chatService.listConversations).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
        await screen.findByText('아직 시작한 대화가 없습니다.');
        expect(chatService.listConversations).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(chatService.getSupport).not.toHaveBeenCalled();
    });

    it('combines a full messenger outage into one neutral retry action', async () => {
        const user = userEvent.setup();
        useAuthStore.setState({
            user: { id: 1, role: 'ADMIN', name: '관리자' },
            isLoggedIn: true,
        });
        useMessengerStore.getState().syncIdentity(messengerIdentityOf(useAuthStore.getState()));
        useMessengerStore.setState({ activeThread: false });
        useMessengerStore.getState().showConversations();
        const missingRoute = Object.assign(new Error('요청하신 경로를 찾을 수 없습니다.'), { status: 404 });
        chatService.listConversations.mockRejectedValue(missingRoute);
        chatService.listStoreInbox.mockRejectedValue(missingRoute);
        chatService.listAdminSupportInbox.mockRejectedValue(missingRoute);
        renderMessenger({ surface: 'panel' });

        expect(await screen.findByRole('alert')).toHaveTextContent('대화 목록');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.queryByRole('region', { name: '내 대화' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
        await waitFor(() => expect(chatService.listConversations).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(chatService.listStoreInbox).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(chatService.listAdminSupportInbox).toHaveBeenCalledTimes(2));
    });

    it('restores each conversation draft on switching without sending it', async () => {
        const user = userEvent.setup();
        chatService.listConversations.mockResolvedValue(page([42, 43].map(storeId => ({
            roomId: storeId, storeId, type: 'STORE', viewerRole: 'MEMBER', counterpartName: `가게${storeId}`, unread: 0,
        }))));
        chatService.getStore.mockImplementation(storeId => Promise.resolve({
            roomId: storeId, storeId, type: 'STORE', title: `가게${storeId}`, viewerRole: 'MEMBER', canSend: true, messages: [],
        }));
        renderMessenger();
        await user.click(await screen.findByRole('button', { name: /가게42/ }));
        await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
        await user.type(screen.getByRole('textbox'), '첫 가게 초안');
        await user.click(screen.getByRole('button', { name: /가게43/ }));
        await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
        expect(screen.getByRole('textbox')).toHaveValue('');
        await user.type(screen.getByRole('textbox'), '둘째 가게 초안');
        await user.click(screen.getByRole('button', { name: /가게42/ }));
        await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('첫 가게 초안'));
        expect(chatService.sendStore).not.toHaveBeenCalled();
    });

    it('keeps one footer in a compact panel and replaces the list with the selected thread', async () => {
        const user = userEvent.setup();
        chatService.listConversations.mockResolvedValue(page([{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', counterpartName: 'RESERVE 고객지원', unread: 0 }]));
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });
        expect(screen.getAllByRole('navigation', { name: '메신저 화면' })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: '고객지원에 문의' })).not.toBeInTheDocument();
        await user.click(await screen.findByRole('button', { name: /RESERVE 고객지원/ }));
        await waitFor(() => expect(chatService.getSupport).toHaveBeenCalledTimes(1));
        expect(screen.getAllByRole('navigation', { name: '메신저 화면' })).toHaveLength(1);
        expect(screen.getByRole('button', { name: '홈', exact: true })).toBeDisabled();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        fireEvent.animationEnd(screen.getByRole('button', { name: '대화 목록으로 돌아가기' }).closest('.reserve-messenger-thread'));
        await waitFor(() => expect(screen.queryByLabelText('대화 목록')).not.toBeInTheDocument());
        expect(screen.queryByRole('navigation', { name: '메신저 화면' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '대화 목록으로 돌아가기' }));
        const messenger = screen.getByRole('button', { name: '대화 목록으로 돌아가기' }).closest('.reserve-messenger');
        expect(messenger).toHaveClass('is-returning-to-list', 'has-thread');
        expect(screen.getAllByRole('navigation', { name: '메신저 화면' })).toHaveLength(1);
        fireEvent.animationEnd(messenger.querySelector('.reserve-messenger-thread'));
        await waitFor(() => expect(screen.getAllByRole('navigation', { name: '메신저 화면' })).toHaveLength(1));
        expect(chatService.getSupport).toHaveBeenCalledTimes(1);
    });

    it.each([390, 960])('keeps an empty conversation list free of duplicate inquiry actions at %ipx', async width => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        useMessengerStore.getState().showConversations();
        renderMessenger({ surface: 'panel' });
        await screen.findByText('아직 시작한 대화가 없습니다.');
        expect(screen.queryByRole('button', { name: '고객지원에 문의' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '홈', exact: true })).toBeEnabled();
        expect(chatService.getSupport).not.toHaveBeenCalled();
        expect(chatService.markRead).not.toHaveBeenCalled();
    });

    it('does not repeat draft and keyboard guidance below the compact input', async () => {
        const { container } = renderMessenger();
        await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
        expect(screen.getByPlaceholderText('메시지를 입력하세요')).toHaveAttribute('rows', '2');
        expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '2000');
        expect(container.querySelector('.reserve-messenger-composer-hint')).toBeNull();
        expect(screen.queryByText(/대화별 초안은 이번 세션/)).not.toBeInTheDocument();
    });

    it('does not replace newer typing when a send fails late', async () => {
        const user = userEvent.setup();
        let failSend;
        chatService.sendSupport.mockImplementationOnce(() => new Promise((_resolve, reject) => { failSend = reject; }));
        renderMessenger();
        await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
        await user.type(screen.getByRole('textbox'), '보내려던 메시지');
        await user.click(screen.getByRole('button', { name: '보내기' }));
        await user.type(screen.getByRole('textbox'), '새로 입력한 초안');
        failSend(new Error('offline'));
        await waitFor(() => expect(screen.queryByRole('button', { name: '보내는 중' })).not.toBeInTheDocument());
        expect(screen.getByRole('textbox')).toHaveValue('새로 입력한 초안');
    });

    it('offers manual reply insertion only for the owner, without automatically sending', async () => {
        const user = userEvent.setup();
        useAuthStore.setState({ user: { id: 8, role: 'BUSINESS' }, isLoggedIn: true });
        useMessengerStore.getState().openOwnerRoom(77);
        chatService.getStoreInboxRoom.mockResolvedValue({
            roomId: 77, type: 'STORE', storeId: 31, title: '회원7', viewerRole: 'OWNER', canSend: true, messages: [],
        });
        renderMessenger();
        await screen.findByText('답변 문구');
        await user.type(screen.getByRole('textbox'), '제가 쓴 문장');
        await user.click(screen.getByText('답변 문구'));
        await user.click(screen.getByRole('button', { name: '인사' }));
        expect(screen.getByRole('textbox')).toHaveValue('제가 쓴 문장\n안녕하세요. 문의주셔서 감사합니다. 확인 후 안내드리겠습니다.');
        expect(chatService.sendStoreInbox).not.toHaveBeenCalled();
    });

    it('requires explicit notification opt-in and uses new polling, not initial history', async () => {
        const user = userEvent.setup();
        const notifications = [];
        const NotificationApi = vi.fn(function () {
            this.close = vi.fn();
            notifications.push(this);
        });
        NotificationApi.permission = 'granted';
        NotificationApi.requestPermission = vi.fn();
        vi.stubGlobal('Notification', NotificationApi);
        vi.stubGlobal('isSecureContext', true);
        vi.spyOn(document, 'hasFocus').mockReturnValue(false);
        vi.spyOn(window, 'focus').mockImplementation(() => {});
        useMessengerStore.getState().showHome();
        chatService.getSupport.mockResolvedValue({
            roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
            messages: [{ id: 1, senderRole: 'ADMIN', content: '이전 비공개 메시지' }],
        });
        const view = renderMessenger();
        expect(NotificationApi).not.toHaveBeenCalled();
        expect(NotificationApi.requestPermission).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'PC 알림 켜기' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '설정' }));
        expect(chatService.getSupport).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'PC 알림 켜기' }));
        await user.click(screen.getByRole('button', { name: '홈' }));
        await user.click(screen.getByRole('button', { name: '고객지원에 문의' }));
        await screen.findByText('이전 비공개 메시지');
        await waitFor(() => expect(chatService.pollRoom).toHaveBeenCalled());
        expect(NotificationApi).not.toHaveBeenCalled();
        chatService.pollRoom.mockResolvedValueOnce([{ id: 2, senderRole: 'ADMIN', content: '새 비공개 메시지' }]);
        fireEvent.focus(window);
        await waitFor(() => expect(NotificationApi).toHaveBeenCalledTimes(1));
        expect(NotificationApi).toHaveBeenCalledWith('RESERVE 새 메시지', {
            body: '새 메시지가 도착했습니다. RESERVE에서 확인해주세요.', tag: 'reserve-chat',
        });
        view.unmount();
        expect(notifications[0].close).toHaveBeenCalled();
    });

    it('reads through the received cursor after focus returns and retries a failed acknowledgement', async () => {
        const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
        const batch = Array.from({ length: 50 }, (_, index) => ({
            id: index + 1, senderRole: 'ADMIN', content: `수신 ${index + 1}`, createdAt: '2026-09-12T22:00:00',
        }));
        chatService.pollRoom.mockResolvedValueOnce(batch).mockResolvedValue([]);
        chatService.markRead.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
        renderMessenger();
        await screen.findByText('수신 50');
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(1));
        expect(chatService.markRead).not.toHaveBeenCalled();

        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(2));
        expect(chatService.pollRoom).toHaveBeenLastCalledWith(1, 50);
        expect(chatService.markRead).not.toHaveBeenCalled();

        focused.mockReturnValue(true);
        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(3));
        expect(chatService.markRead).toHaveBeenCalledTimes(1);
        expect(chatService.markRead).toHaveBeenLastCalledWith(1, 'MEMBER', 50);

        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(4));
        expect(chatService.markRead).toHaveBeenCalledTimes(2);
        expect(chatService.markRead).toHaveBeenLastCalledWith(1, 'MEMBER', 50);
        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(5));
        expect(chatService.markRead).toHaveBeenCalledTimes(2);
    });

    it('opens a deep-linked store thread and sends with a client message id', async () => {
        const user = userEvent.setup();
        chatService.getStore.mockResolvedValue({
            roomId: 12,
            type: 'STORE',
            storeId: 42,
            title: '모던 필라테스',
            viewerRole: 'MEMBER',
            canSend: true,
            messages: [],
        });
        chatService.sendStore.mockResolvedValue({
            id: 91,
            senderRole: 'MEMBER',
            content: '예약 전에 문의드려요',
            createdAt: '2026-09-12T22:00:00',
        });
        renderMessenger({ initialStoreId: '42' });

        expect(await screen.findByText('모던 필라테스')).toBeInTheDocument();
        await user.type(screen.getByRole('textbox', { name: '메시지 입력' }), '예약 전에 문의드려요');
        await user.click(screen.getByRole('button', { name: '보내기' }));

        await waitFor(() => expect(chatService.sendStore).toHaveBeenCalledWith(
            42,
            '예약 전에 문의드려요',
            expect.any(String),
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        ));
    });

    it('keeps the mobile list first, then opens and closes a conversation', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        chatService.listConversations.mockResolvedValue(page([{
            roomId: 1, type: 'SUPPORT', counterpartName: 'RESERVE 고객지원', viewerRole: 'MEMBER', unread: 0,
        }]));
        const view = renderMessenger();

        expect(chatService.getSupport).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: /RESERVE 고객지원/ }));
        const messenger = view.container.querySelector('.reserve-messenger');
        expect(messenger).toHaveClass('has-mobile-thread');

        expect(messenger).toHaveClass('is-opening-thread');
        fireEvent.click(screen.getByRole('button', { name: '대화 목록으로 돌아가기' }));
        expect(messenger).not.toHaveClass('is-returning-to-list');
        fireEvent.animationEnd(messenger.querySelector('.reserve-messenger-thread'));
        await waitFor(() => expect(messenger).not.toHaveClass('is-opening-thread'));
        expect(chatService.getSupport).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: '대화 목록으로 돌아가기' }));
        expect(messenger).toHaveClass('is-returning-to-list', 'has-mobile-thread');
        expect(messenger.querySelector('.reserve-messenger-list')).toBeInTheDocument();
        fireEvent.animationEnd(messenger.querySelector('.reserve-messenger-thread'));
        await waitFor(() => expect(messenger).not.toHaveClass('has-mobile-thread'));
        expect(messenger).not.toHaveClass('is-returning-to-list');
    });

    it('refreshes the list preview from the latest server message after sending', async () => {
        const user = userEvent.setup();
        let latestPreview = '이전 대화';
        chatService.listConversations.mockImplementation(async () => page([{
            roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', counterpartName: '관리자 개인 이름',
            lastMessagePreview: latestPreview, unread: 0,
        }]));
        chatService.sendSupport.mockImplementation(async content => {
            latestPreview = content;
            return { id: 2, senderRole: 'MEMBER', content, createdAt: '2026-09-15T12:00:00' };
        });
        const { container } = renderMessenger();
        const row = await screen.findByRole('button', { name: /RESERVE 고객지원/ });
        expect(row.querySelector('.reserve-messenger-row-preview')).toHaveTextContent('이전 대화');
        expect(container.querySelector('.reserve-messenger-row-subtitle')).toBeNull();
        await user.type(screen.getByRole('textbox', { name: '메시지 입력' }), '새로 보낸 메시지');
        await user.click(screen.getByRole('button', { name: '보내기' }));
        await waitFor(() => expect(row.querySelector('.reserve-messenger-row-preview')).toHaveTextContent('새로 보낸 메시지'));
        expect(row).not.toHaveTextContent('관리자 개인 이름');
    });

    it('separates a business owner inbox from the member conversation list', async () => {
        const user = userEvent.setup();
        useAuthStore.setState({ user: { id: 8, role: 'BUSINESS', name: '사장님' }, isLoggedIn: true });
        useMessengerStore.getState().showConversations();
        chatService.listStoreInbox.mockResolvedValue(page([{
            roomId: 77,
            type: 'STORE',
            storeId: 31,
            storeName: '가게31',
            counterpartName: '회원7',
            viewerRole: 'OWNER',
            unread: 2,
            lastMessagePreview: '예약 가능한가요?',
        }]));
        chatService.getStoreInboxRoom.mockResolvedValue({
            roomId: 77,
            type: 'STORE',
            storeId: 31,
            title: '회원7',
            viewerRole: 'OWNER',
            canSend: true,
            messages: [],
        });
        renderMessenger();

        const row = await screen.findByRole('button', { name: /회원7/ });
        expect(screen.getByText('가게 받은 문의')).toBeInTheDocument();
        await user.click(row);
        await waitFor(() => expect(chatService.getStoreInboxRoom).toHaveBeenCalledWith(77));
    });

    it('loads older messages with a cursor without replacing the recent window', async () => {
        const user = userEvent.setup();
        chatService.getSupport.mockResolvedValue({
            roomId: 1,
            type: 'SUPPORT',
            title: 'RESERVE 고객지원',
            viewerRole: 'MEMBER',
            canSend: true,
            hasOlderMessages: true,
            nextBeforeId: 51,
            messages: [{
                id: 51,
                senderRole: 'MEMBER',
                content: '최근 메시지',
                createdAt: '2026-09-12T22:00:00',
            }],
        });
        chatService.getHistory.mockResolvedValue({
            hasMore: false,
            nextBeforeId: 1,
            messages: [{
                id: 1,
                senderRole: 'ADMIN',
                content: '이전 메시지',
                createdAt: '2026-09-01T09:00:00',
            }],
        });
        renderMessenger();

        await screen.findByText('최근 메시지');
        await user.click(screen.getByRole('button', { name: '이전 메시지 보기' }));

        await waitFor(() => expect(chatService.getHistory).toHaveBeenCalledWith(1, 51, 50));
        expect(screen.getByText('이전 메시지')).toBeInTheDocument();
        expect(screen.getByText('최근 메시지')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '이전 메시지 보기' })).not.toBeInTheDocument();
    });

    it('retries stale history once and keeps its cursor available after another retraction', async () => {
        const user = userEvent.setup();
        let resolveFirst;
        let resolveRetry;
        const firstRequest = new Promise(resolve => { resolveFirst = resolve; });
        const retryRequest = new Promise(resolve => { resolveRetry = resolve; });
        const cancelled = {
            id: 1, senderRole: 'ADMIN', content: '전송이 취소된 메시지입니다.',
            retracted: true, retractionRevision: 1, createdAt: '2026-09-01T09:00:00',
        };
        chatService.getSupport.mockResolvedValue({
            roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
            hasOlderMessages: true, nextBeforeId: 51,
            messages: [{ id: 51, senderRole: 'MEMBER', content: '최근 메시지', createdAt: '2026-09-12T22:00:00' }],
        });
        chatService.getHistory
            .mockReturnValueOnce(firstRequest)
            .mockReturnValueOnce(retryRequest)
            .mockResolvedValue({ hasMore: false, nextBeforeId: 1, messages: [cancelled] });
        renderMessenger();
        await screen.findByText('최근 메시지');
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(1));
        await user.click(screen.getByRole('button', { name: '이전 메시지 보기' }));

        chatService.pollRetractions.mockResolvedValue({ messages: [cancelled], nextRevision: 1 });
        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(2));
        await act(async () => resolveFirst({
            hasMore: false, nextBeforeId: 1,
            messages: [{ ...cancelled, content: '폐기할 과거 원문', retracted: false, retractionRevision: null }],
        }));
        expect(chatService.getHistory).toHaveBeenCalledTimes(2);
        expect(chatService.getHistory).toHaveBeenNthCalledWith(2, 1, 51, 50);
        expect(screen.queryByText('폐기할 과거 원문')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '이전 메시지 보기' })).toBeDisabled();

        chatService.pollRetractions.mockResolvedValue({
            messages: [{ ...cancelled, id: 2, retractionRevision: 2 }], nextRevision: 2,
        });
        await act(async () => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(chatService.pollRetractions).toHaveBeenCalledTimes(3));
        await act(async () => resolveRetry({ hasMore: false, nextBeforeId: 1, messages: [cancelled] }));
        expect(chatService.getHistory).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', { name: '이전 메시지 보기' })).toBeEnabled();
        expect(screen.queryByText('전송이 취소된 메시지입니다.')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '이전 메시지 보기' }));
        expect(chatService.getHistory).toHaveBeenNthCalledWith(3, 1, 51, 50);
        expect(await screen.findByText('전송이 취소된 메시지입니다.')).toBeInTheDocument();
        expect(screen.queryByText('폐기할 과거 원문')).not.toBeInTheDocument();
        expect(screen.getByText('최근 메시지')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '이전 메시지 보기' })).not.toBeInTheDocument();
    });

    it.each(['success', 'failure'])('ignores late history %s after switching rooms without ending the new room request', async (outcome) => {
        const user = userEvent.setup();
        let resolveOld;
        let rejectOld;
        let resolveCurrent;
        const oldRequest = new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
        const currentRequest = new Promise((resolve) => { resolveCurrent = resolve; });
        chatService.getSupport.mockResolvedValue({
            roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
            hasOlderMessages: true, nextBeforeId: 51,
            messages: [{ id: 51, senderRole: 'MEMBER', content: 'A 최근 메시지', createdAt: '2026-09-12T22:00:00' }],
        });
        chatService.listConversations.mockResolvedValue(page([
            { roomId: 42, storeId: 42, type: 'STORE', viewerRole: 'MEMBER', counterpartName: '가게42', unread: 0 },
        ]));
        chatService.getStore.mockResolvedValue({
            roomId: 42, storeId: 42, type: 'STORE', title: '가게42', viewerRole: 'MEMBER', canSend: true,
            hasOlderMessages: true, nextBeforeId: 151,
            messages: [{ id: 151, senderRole: 'MEMBER', content: 'B 최근 메시지', createdAt: '2026-09-12T23:00:00' }],
        });
        chatService.getHistory.mockReturnValueOnce(oldRequest).mockReturnValueOnce(currentRequest);
        renderMessenger();

        await screen.findByText('A 최근 메시지');
        await user.click(screen.getByRole('button', { name: '이전 메시지 보기' }));
        expect(chatService.getHistory).toHaveBeenNthCalledWith(1, 1, 51, 50);
        await user.click(await screen.findByRole('button', { name: /가게42/ }));
        await screen.findByText('B 최근 메시지');
        await user.click(screen.getByRole('button', { name: '이전 메시지 보기' }));
        expect(chatService.getHistory).toHaveBeenNthCalledWith(2, 42, 151, 50);

        await act(async () => {
            if (outcome === 'success') resolveOld({
                hasMore: false, nextBeforeId: 1,
                messages: [{ id: 1, senderRole: 'ADMIN', content: '무시할 A 과거 메시지', createdAt: '2026-09-01T09:00:00' }],
            });
            else rejectOld(new Error('late history failure'));
        });

        expect(screen.queryByText('무시할 A 과거 메시지')).not.toBeInTheDocument();
        expect(screen.queryByText('이전 메시지를 불러오지 못했습니다.')).not.toBeInTheDocument();
        expect(screen.getByText('B 최근 메시지')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '이전 메시지 보기' })).toBeDisabled();
        await act(async () => resolveCurrent({
            hasMore: false, nextBeforeId: 101,
            messages: [{ id: 101, senderRole: 'OWNER', content: 'B 과거 메시지', createdAt: '2026-09-02T09:00:00' }],
        }));
        expect(screen.getByText('B 과거 메시지')).toBeInTheDocument();
        expect(screen.getByText('B 최근 메시지')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '이전 메시지 보기' })).not.toBeInTheDocument();
    });

    it.each(['success', 'failure'])('ignores late history %s after settings and returning to the same room', async (outcome) => {
        const user = userEvent.setup();
        let resolveOld;
        let rejectOld;
        const oldRequest = new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
        chatService.getSupport.mockResolvedValue({
            roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
            hasOlderMessages: true, nextBeforeId: 51,
            messages: [{ id: 51, senderRole: 'MEMBER', content: 'A 최근 메시지', createdAt: '2026-09-12T22:00:00' }],
        });
        chatService.getHistory.mockReturnValueOnce(oldRequest);
        renderMessenger();

        await screen.findByText('A 최근 메시지');
        await user.click(screen.getByRole('button', { name: '이전 메시지 보기' }));
        expect(chatService.getHistory).toHaveBeenCalledWith(1, 51, 50);
        await user.click(screen.getByRole('button', { name: '설정', exact: true }));
        expect(await screen.findByRole('heading', { name: '설정', exact: true })).toBeInTheDocument();
        expect(screen.queryByText('A 최근 메시지')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '홈', exact: true }));
        await user.click(screen.getByRole('button', { name: /고객지원에 문의/ }));
        await screen.findByText('A 최근 메시지');
        expect(chatService.getSupport).toHaveBeenCalledTimes(2);

        await act(async () => {
            if (outcome === 'success') resolveOld({
                hasMore: false, nextBeforeId: 1,
                messages: [{ id: 1, senderRole: 'ADMIN', content: '무시할 A 과거 메시지', createdAt: '2026-09-01T09:00:00' }],
            });
            else rejectOld(new Error('late history failure'));
        });

        expect(screen.queryByText('무시할 A 과거 메시지')).not.toBeInTheDocument();
        expect(screen.queryByText('이전 메시지를 불러오지 못했습니다.')).not.toBeInTheDocument();
        expect(screen.getByText('A 최근 메시지')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '이전 메시지 보기' })).not.toBeDisabled();
    });

    it('shows a blocked store state and lets only the blocker request an unblock', async () => {
        const user = userEvent.setup();
        chatService.getStore.mockResolvedValue({
            roomId: 12,
            type: 'STORE',
            storeId: 42,
            title: '모던 필라테스',
            viewerRole: 'MEMBER',
            canSend: false,
            blocked: true,
            blockedByMe: true,
            sendDisabledReason: 'BLOCKED_BY_ME',
            messages: [],
        });
        renderMessenger({ initialStoreId: '42' });

        expect(await screen.findByText(/내가 차단한 대화/)).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: '메시지 입력' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '대화 관리' }));
        await user.click(await screen.findByText('내 차단 해제'));

        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: '차단 해제' }));
        await waitFor(() => expect(chatService.setBlocked).toHaveBeenCalledWith(12, 'MEMBER', false));
    });

    it('submits a store conversation report without exposing it as an automatic sanction', async () => {
        const user = userEvent.setup();
        chatService.getStore.mockResolvedValue({
            roomId: 12,
            type: 'STORE',
            storeId: 42,
            title: '모던 필라테스',
            viewerRole: 'MEMBER',
            canSend: true,
            messages: [],
        });
        renderMessenger({ initialStoreId: '42' });

        await screen.findByText('모던 필라테스');
        expect(screen.queryByText('답변 문구')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '가게 보기' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '대화 관리' }));
        await user.click(await screen.findByText('대화 신고'));
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('combobox'));
        await user.click(await screen.findByText('스팸·도배'));
        await user.type(within(dialog).getByPlaceholderText('관리자가 확인할 내용을 적어주세요'), '반복 광고 메시지');
        await user.click(within(dialog).getByRole('button', { name: '신고 접수' }));

        await waitFor(() => expect(chatService.reportConversation).toHaveBeenCalledWith(
            12,
            'MEMBER',
            { reason: 'SPAM', details: '반복 광고 메시지' },
        ));
        // jsdom does not emit AntD's CSS transition-end event, so the closing
        // dialog stays mounted with its leave class. Verify that closing began
        // and, more importantly, that a report never becomes an automatic block.
        await waitFor(() => expect(dialog.className).toContain('ant-zoom-leave'));
        expect(chatService.setBlocked).not.toHaveBeenCalled();
    });
});
