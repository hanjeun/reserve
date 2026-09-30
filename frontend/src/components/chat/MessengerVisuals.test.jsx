import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import postcss from 'postcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MessengerAvatar from './MessengerAvatar';
import MessengerBrandCover from './MessengerBrandCover';
import MessengerListHeading from './MessengerListHeading';
import MessengerHome from './MessengerHome';
import MessengerConversationRow from './MessengerConversationRow';
import MessengerContent from './MessengerContent';
import ChatBubbleList from './ChatBubbleList';
import { conversationTitle, SUPPORT_LABEL } from './messengerIdentity';
import { getMessengerImageUrl, MESSENGER_BRAND_AVATAR, MESSENGER_COVER_IMAGE } from './messengerImages';
import { getImageUrl } from '../../utils/image';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';

vi.mock('../../services', () => ({
    chatService: {
        listConversations: vi.fn(), listStoreInbox: vi.fn(),
        listAdminSupportInbox: vi.fn(), getAdminSupportRoom: vi.fn(),
        pollAdminSupportRoom: vi.fn(), markAdminSupportRead: vi.fn(), sendAdminSupportRoom: vi.fn(),
        getSupport: vi.fn(), sendSupport: vi.fn(), getStore: vi.fn(), sendStore: vi.fn(),
        getStoreInboxRoom: vi.fn(), sendStoreInbox: vi.fn(), pollRoom: vi.fn(),
        getHistory: vi.fn(), markRead: vi.fn(), setBlocked: vi.fn(), reportConversation: vi.fn(),
    },
}));

const clients = [];
const originalScrollIntoView = Element.prototype.scrollIntoView;
const page = content => ({ content, page: { number: 0, totalPages: 1, totalElements: content.length } });
const renderContent = props => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}><AntApp><MemoryRouter initialEntries={['/messages']}>
        <MessengerContent {...props} />
    </MemoryRouter></AntApp></QueryClientProvider>);
};
const adminMessage = (id, changes = {}) => ({
    id, senderRole: 'ADMIN', senderName: '상담원 민', senderProfileImage: 'https://images.example.invalid/min.png',
    content: `안내 ${id}`, createdAt: `2026-09-14T12:00:0${id}Z`, ...changes,
});

beforeEach(() => {
    Object.values(chatService).forEach(mock => mock.mockReset());
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Element.prototype.scrollIntoView = vi.fn();
    useAuthStore.setState({ user: { id: 71, role: 'USER', name: '테스트 회원' }, isLoggedIn: true });
    useMessengerStore.setState({
        open: false, view: 'home', activeThread: false, selection: { kind: 'support' }, drafts: {},
        sessionIdentity: messengerIdentityOf(useAuthStore.getState()),
    });
    chatService.listConversations.mockResolvedValue(page([]));
    chatService.listStoreInbox.mockResolvedValue(page([]));
    chatService.listAdminSupportInbox.mockResolvedValue(page([]));
    chatService.getAdminSupportRoom.mockResolvedValue([]);
    chatService.pollAdminSupportRoom.mockResolvedValue([]);
    chatService.markAdminSupportRead.mockResolvedValue({});
    chatService.pollRoom.mockResolvedValue([]);
    chatService.markRead.mockResolvedValue({});
    chatService.getSupport.mockResolvedValue({
        roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true, messages: [],
    });
});
afterEach(() => {
    clients.splice(0).forEach(client => client.clear());
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (originalScrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView;
    else delete Element.prototype.scrollIntoView;
});

describe('messenger image display boundary', () => {
    it.each([
        'javascript:alert(1)', 'data:image/svg+xml,<svg onload="alert(1)"/>',
        'blob:https://reserve.it.kr/avatar', 'file:///tmp/avatar.png', 'ftp://images.example.invalid/avatar.png',
        'https://member:password@images.example.invalid/avatar.png',
        'http://member:password@localhost/avatar.png', 'http://images.example.invalid/avatar.png',
    ])('rejects %s without using it as an image source', source => {
        expect(getMessengerImageUrl(source)).toBeNull();
        const { container } = render(<MessengerAvatar imageSrc={source} />);
        expect(container.querySelector('img')).toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(container.querySelector('.reserve-messenger-avatar')).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelector('a, button')).toBeNull();
    });

    it.each([null, undefined, '', '   ', 42, {}])('uses the explicit fallback for absent or non-string input %s', source => {
        expect(getMessengerImageUrl(source, MESSENGER_COVER_IMAGE)).toBe(MESSENGER_COVER_IMAGE);
    });

    it('keeps local brand assets, HTTPS profiles and same-origin development photos displayable', () => {
        for (const source of ['/icons/RESERVE_logo.png', '/images/operator.png', '/og-image.png']) {
            expect(getMessengerImageUrl(source)).toBe(source);
        }
        expect(getMessengerImageUrl(' https://images.example.invalid/operator.png '))
            .toBe('https://images.example.invalid/operator.png');
        const ownPhoto = `${window.location.origin}/profile-photo.png`;
        expect(getMessengerImageUrl(ownPhoto)).toBe(ownPhoto);
        vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080');
        expect(getMessengerImageUrl('http://localhost:8080/uploads/operator.png'))
            .toBe('http://localhost:8080/uploads/operator.png');
        const uploaded = getImageUrl('/uploads/operator.png');
        vi.stubEnv('VITE_API_BASE_URL', new URL(uploaded, window.location.origin).origin);
        expect(getMessengerImageUrl('/uploads/operator.png')).toBe(new URL(uploaded, window.location.origin).href);
    });

    it('falls back from a failed profile to the brand and then an icon, and retries a changed source', () => {
        const { container, rerender } = render(<MessengerAvatar imageSrc="https://images.example.invalid/first.png" />);
        let image = container.querySelector('img');
        expect(image).toHaveAttribute('alt', '');
        expect(image).toHaveAttribute('draggable', 'false');
        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
        fireEvent.error(image);
        image = container.querySelector('img');
        expect(image).toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        fireEvent.error(image);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.anticon-customer-service')).toBeInTheDocument();
        rerender(<MessengerAvatar imageSrc="https://images.example.invalid/second.png" />);
        expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.example.invalid/second.png');
        expect(container.querySelector('.anticon-customer-service')).toBeNull();
    });

    it('does not repeatedly request a failed default brand avatar', () => {
        const { container } = render(<MessengerAvatar />);
        fireEvent.error(container.querySelector('img'));
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.anticon-customer-service')).toBeInTheDocument();
    });

    it('uses a store icon rather than the support brand when a store photo is unsafe or fails', () => {
        const { container, rerender } = render(<MessengerAvatar variant="store" imageSrc="javascript:alert(1)" />);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.anticon-shop')).toBeInTheDocument();
        rerender(<MessengerAvatar variant="store" imageSrc="https://images.example.invalid/store.jpg" />);
        fireEvent.error(container.querySelector('img'));
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.anticon-shop')).toBeInTheDocument();
    });

    it('uses a member photo for a person avatar and falls back to the person icon', () => {
        const source = 'https://images.example.invalid/member.jpg';
        const { container } = render(<MessengerAvatar variant="person" imageSrc={source} />);
        expect(container.querySelector('img')).toHaveAttribute('src', source);
        fireEvent.error(container.querySelector('img'));
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.anticon-user')).toBeInTheDocument();
    });

    it('retains an accessible heading without a cover wordmark after failure and retries a new cover', () => {
        const { container, rerender } = render(<MessengerBrandCover headingLevel={1} />);
        expect(container.querySelector('img')).toHaveAttribute('src', MESSENGER_COVER_IMAGE);
        expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
        fireEvent.error(container.querySelector('img'));
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByRole('heading', { name: '메시지', level: 1 })).toHaveClass('reserve-messenger-sr-only');
        rerender(<MessengerBrandCover imageSrc="https://images.example.invalid/cover.png" headingLevel={2} />);
        expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.example.invalid/cover.png');
        expect(screen.getByRole('heading', { name: '메시지', level: 2 })).toHaveClass('reserve-messenger-sr-only');
    });

    it('uses the local cover for a rejected custom source rather than displaying unsafe content', () => {
        const { container } = render(<MessengerBrandCover imageSrc="data:image/svg+xml,<svg/>" />);
        expect(container.querySelector('img')).toHaveAttribute('src', MESSENGER_COVER_IMAGE);
        expect(container.querySelector('img')).toHaveAttribute('alt', '');
        expect(container.querySelector('a, button')).toBeNull();
    });
});

describe('messenger home and stable support identity wiring', () => {
    it('derives titles from the verified room role and store snapshot', () => {
        expect(conversationTitle({ type: 'SUPPORT', counterpartName: '관리자 개인 이름' })).toBe(SUPPORT_LABEL);
        expect(conversationTitle({ type: 'STORE_CHAT', viewerRole: 'MEMBER', storeName: '한식당', counterpartName: '사장님 개인 이름' })).toBe('한식당');
        expect(conversationTitle({ type: 'STORE_CHAT', viewerRole: 'OWNER', storeName: '한식당', counterpartName: '김고객' })).toBe('김고객');
    });

    it('shows one inquiry action and the brand identity without recent conversations or automatic selection', async () => {
        const onChoose = vi.fn();
        const { container } = render(<MessengerHome onChoose={onChoose} />);
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.getByText('RESERVE 고객지원')).toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger-welcome-sender img'))
            .toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(screen.queryByText(/최근 대화|최근 내 대화|전체 보기|가게 받은 문의|PC 알림/)).not.toBeInTheDocument();
        expect(onChoose).not.toHaveBeenCalled();
        await userEvent.setup().click(screen.getByRole('button', { name: '고객지원에 문의' }));
        expect(onChoose.mock.calls).toEqual([[{ kind: 'support' }]]);
    });

    it('uses the same support name and avatar when no conversation is loaded', () => {
        const { container } = render(<MessengerHome onChoose={vi.fn()} />);
        expect(screen.getByText('RESERVE 고객지원')).toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger-welcome-sender img'))
            .toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
    });

    it('keeps support identity institutional and the conversation row noninteractive until selected', async () => {
        const onSelect = vi.fn();
        const { container } = render(<MessengerConversationRow row={{
            type: 'SUPPORT', counterpartName: '담당자 하늘', counterpartProfileImage: 'https://images.example.invalid/sky.png',
            lastMessagePreview: '확인 후 안내드립니다.', unread: 0,
        }} onSelect={onSelect} />);
        const row = screen.getByRole('button', { name: /RESERVE 고객지원/ });
        expect(container.querySelector('.reserve-messenger-row-icon img'))
            .toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(screen.queryByText('담당자 하늘')).not.toBeInTheDocument();
        expect(within(row).queryByRole('img')).not.toBeInTheDocument();
        expect(onSelect).not.toHaveBeenCalled();
        await userEvent.setup().click(row);
        expect(onSelect).toHaveBeenCalledOnce();
    });

    it('guides an unsent support conversation without inventing a message', () => {
        const { container } = render(<MessengerConversationRow row={{
            type: 'SUPPORT', counterpartName: '담당자 하늘', lastMessagePreview: null, unread: 0,
        }} onSelect={vi.fn()} />);
        expect(container.querySelector('.reserve-messenger-row-subtitle')).toBeNull();
        expect(container.querySelector('.reserve-messenger-row-preview')).toHaveTextContent('아직 메시지가 없습니다.');
        expect(container.querySelector('.reserve-messenger-row-preview')).not.toHaveTextContent('궁금한 점을 남겨주세요.');
    });

    it('does not change the support name or photo when list and thread carry different personal identities', async () => {
        const user = userEvent.setup();
        chatService.listConversations.mockResolvedValue(page([{
            roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', counterpartName: '목록 담당자',
            counterpartProfileImage: 'https://images.example.invalid/list.png', unread: 0,
            lastMessagePreview: '목록 메시지',
        }]));
        chatService.getSupport.mockResolvedValue({
            roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
            counterpartName: '현재 담당자', counterpartProfileImage: 'https://images.example.invalid/thread.png',
            messages: [adminMessage(1, { content: '실제 대화 응답' })],
        });
        const { container } = renderContent();
        await screen.findByText('RESERVE 고객지원');
        expect(container.querySelector('.reserve-messenger-welcome-sender img'))
            .toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(screen.getAllByRole('button', { name: '고객지원에 문의' })).toHaveLength(1);
        expect(screen.queryByText('목록 메시지')).not.toBeInTheDocument();
        expect(chatService.getSupport).not.toHaveBeenCalled();
        expect(chatService.pollRoom).not.toHaveBeenCalled();
        expect(chatService.markRead).not.toHaveBeenCalled();
        expect(chatService.sendSupport).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '대화', exact: true }));
        const row = await screen.findByRole('button', { name: /RESERVE 고객지원/ });
        expect(row.querySelector('img')).toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(row.querySelector('.reserve-messenger-row-preview')).toHaveTextContent('목록 메시지');
        expect(chatService.getSupport).not.toHaveBeenCalled();
        await user.click(row);
        await screen.findByText('실제 대화 응답');
        await waitFor(() => expect(chatService.getSupport).toHaveBeenCalledTimes(1));
        expect(container.querySelector('.reserve-messenger-thread-heading strong')).toHaveTextContent('RESERVE 고객지원');
        expect(container.querySelector('.reserve-messenger-thread-avatar img'))
            .toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(screen.queryByText(/목록 담당자|현재 담당자/)).not.toBeInTheDocument();
        expect(chatService.sendSupport).not.toHaveBeenCalled();
        expect(chatService.getStore).not.toHaveBeenCalled();
    });

    it('honors a loaded null support profile instead of restoring an outdated list photo', async () => {
        const user = userEvent.setup();
        const outdatedPhoto = 'https://images.example.invalid/outdated-operator.png';
        chatService.listConversations.mockResolvedValue(page([{
            roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', counterpartName: '이전 담당자',
            counterpartProfileImage: outdatedPhoto, unread: 0, lastMessagePreview: '이전 안내',
        }]));
        chatService.getSupport.mockResolvedValue({
            roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
            counterpartName: 'RESERVE 고객지원', counterpartProfileImage: null, messages: [],
        });
        useMessengerStore.getState().showConversations();
        const { container } = renderContent();
        const row = await screen.findByRole('button', { name: /RESERVE 고객지원/ });
        expect(row.querySelector('img')).toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(chatService.getSupport).not.toHaveBeenCalled();
        await user.click(row);
        await screen.findByLabelText('문의 시작 안내');
        expect(chatService.getSupport).toHaveBeenCalledTimes(1);
        const heading = container.querySelector('.reserve-messenger-thread-heading');
        expect(heading.querySelector('strong')).toHaveTextContent('RESERVE 고객지원');
        expect(heading.querySelector('.reserve-messenger-thread-avatar img'))
            .toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect([...heading.querySelectorAll('img')].some(image => image.getAttribute('src') === outdatedPhoto)).toBe(false);
        expect(chatService.sendSupport).not.toHaveBeenCalled();
    });
    it('shows the store representative image in the customer row and current image in its thread', async () => {
        const listImage = 'https://images.example.invalid/store-list.jpg';
        const currentImage = 'https://images.example.invalid/store-current.jpg';
        chatService.listConversations.mockResolvedValue(page([{
            roomId: 42, type: 'STORE', storeId: 42, storeName: '한식당', viewerRole: 'MEMBER',
            storeImageUrl: listImage, unread: 0, lastMessagePreview: '예약 문의',
        }]));
        chatService.getStore.mockResolvedValue({
            roomId: 42, type: 'STORE', storeId: 42, title: '한식당', viewerRole: 'MEMBER',
            storeImageUrl: currentImage, canSend: true, messages: [],
        });
        useMessengerStore.getState().showConversations();
        const { container } = renderContent();
        const row = await screen.findByRole('button', { name: /한식당/ });
        expect(row.querySelector('.reserve-messenger-row-icon img')).toHaveAttribute('src', listImage);
        await userEvent.setup().click(row);
        await waitFor(() => expect(chatService.getStore).toHaveBeenCalledWith(42));
        await waitFor(() => expect(container.querySelector('.reserve-messenger-thread-avatar img'))
            .toHaveAttribute('src', currentImage));
    });

    it('shows an administrators customer room once and uses the customer profile in the row and thread', async () => {
        const user = userEvent.setup();
        const customerPhoto = 'https://images.example.invalid/han.jpg';
        useAuthStore.setState({ user: { id: 1, role: 'ADMIN', name: 'RESERVE 고객지원' }, isLoggedIn: true });
        useMessengerStore.setState({
            open: false, view: 'conversations', activeThread: false, selection: { kind: 'support' }, drafts: {},
            sessionIdentity: messengerIdentityOf(useAuthStore.getState()),
        });
        chatService.listAdminSupportInbox.mockResolvedValue(page([{
            id: 21, memberName: '한재은', memberProfileImage: customerPhoto,
            adminUnread: 0, lastMessagePreview: '감사합니다',
        }]));
        chatService.listConversations.mockResolvedValue(page([{
            roomId: 21, type: 'SUPPORT', viewerRole: 'MEMBER', counterpartName: SUPPORT_LABEL,
            unread: 0, lastMessagePreview: '감사합니다',
        }]));

        const { container } = renderContent();
        const customerRows = await screen.findAllByRole('button', { name: /한재은/ });
        expect(customerRows).toHaveLength(1);
        expect(customerRows[0].querySelector('img')).toHaveAttribute('src', customerPhoto);
        expect(screen.queryByRole('button', { name: /RESERVE 고객지원.*감사합니다/ })).not.toBeInTheDocument();

        await user.click(customerRows[0]);
        await waitFor(() => expect(chatService.getAdminSupportRoom).toHaveBeenCalledWith(21));
        expect(container.querySelector('.reserve-messenger-thread-heading strong')).toHaveTextContent('한재은');
        expect(container.querySelector('.reserve-messenger-thread-avatar img')).toHaveAttribute('src', customerPhoto);
    });
});

describe('institutional admin sender groups and literal message text', () => {
    it('shows the brand name and avatar only once per consecutive support group', () => {
        const { container } = render(<ChatBubbleList mine="MEMBER" messages={[adminMessage(1), adminMessage(2)]} />);
        expect(container.querySelectorAll('.reserve-chat-sender-name')).toHaveLength(1);
        expect(container.querySelectorAll('.reserve-chat-sender-avatar-slot img')).toHaveLength(1);
        expect(container.querySelectorAll('.reserve-chat-sender-avatar-slot')).toHaveLength(2);
        expect(screen.getByText('안내 2').closest('.reserve-chat-bubble-group').parentElement).toHaveStyle({ marginTop: '2px' });
    });

    it.each([
        { senderName: '상담원 솔' },
        { senderProfileImage: 'https://images.example.invalid/changed.png' },
        { senderName: '상담원 솔', senderProfileImage: 'https://images.example.invalid/sol.png' },
    ])('does not reveal an administrator when the hidden personal identity changes: %j', changes => {
        const { container } = render(<ChatBubbleList mine="MEMBER" messages={[adminMessage(1), adminMessage(2, changes)]} />);
        const names = container.querySelectorAll('.reserve-chat-sender-name');
        expect([...names].map(name => name.textContent)).toEqual(['RESERVE 고객지원']);
        const images = container.querySelectorAll('.reserve-chat-sender-avatar-slot img');
        expect(images).toHaveLength(1);
        expect(images[0]).toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
        expect(screen.getByText('안내 2').closest('.reserve-chat-bubble-group').parentElement).toHaveStyle({ marginTop: '2px' });
    });

    it('starts a new group after a long gap without inventing a missing admin identity', () => {
        const { container } = render(<ChatBubbleList mine="MEMBER" messages={[
            adminMessage(1, { senderName: null, senderProfileImage: null }),
            adminMessage(2, { senderName: null, senderProfileImage: null, createdAt: '2026-09-14T12:06:00Z' }),
        ]} />);
        expect(screen.getAllByText('RESERVE 고객지원')).toHaveLength(2);
        expect([...container.querySelectorAll('.reserve-chat-sender-avatar-slot img')].map(image => image.getAttribute('src')))
            .toEqual([MESSENGER_BRAND_AVATAR, MESSENGER_BRAND_AVATAR]);
    });

    it('does not display incoming admin identity beside the administrators own bubbles', () => {
        const { container } = render(<ChatBubbleList mine="ADMIN" messages={[adminMessage(1)]} />);
        expect(screen.getByText('안내 1')).toBeInTheDocument();
        expect(container.querySelector('.reserve-chat-sender-name, .reserve-chat-sender-avatar-slot')).toBeNull();
    });

    it('renders message HTML literally and does not expose sender names or inject markup', () => {
        const content = '<img src=x onerror="alert(1)"><script>alert(2)</script>\n문의 원문';
        const senderName = '<b>관리자</b>';
        const { container } = render(<ChatBubbleList mine="MEMBER" messages={[adminMessage(1, { content, senderName, senderProfileImage: null })]} />);
        expect(screen.getByText(content, { exact: true, normalizer: value => value })).toBeInTheDocument();
        expect(screen.queryByText(senderName, { exact: true })).not.toBeInTheDocument();
        expect(screen.getByText('RESERVE 고객지원')).toBeInTheDocument();
        expect(container.querySelector('script, img[src="x"], .reserve-chat-sender-name b')).toBeNull();
        expect(container.querySelectorAll('img')).toHaveLength(1);
        expect(container.querySelector('img')).toHaveAttribute('src', MESSENGER_BRAND_AVATAR);
    });
});

describe('messenger footer hover source contract', () => {
    it('keeps navigation hover neutral while reserving primary for the active tab', () => {
        // CSS contract only: jsdom is not a browser hover or pixel measurement.
        const css = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/global/feature-surfaces.css'), 'utf8'));
        const declarations = selector => {
            const result = {};
            css.walkRules(rule => {
                if (!rule.selectors.includes(selector)) return;
                rule.walkDecls(declaration => { result[declaration.prop] = declaration.value; });
            });
            return result;
        };
        expect(declarations('.reserve-messenger-footer-tab:hover').background).toBe('transparent');
        expect(declarations('.reserve-messenger-footer-tab:hover:not(.is-active) .reserve-messenger-footer-icon').color)
            .toBe('var(--c-text-secondary, #4e5968)');
        expect(declarations('.reserve-messenger-footer-tab.is-active').color).toBe('var(--c-primary, #3182f6)');
    });
});

describe('messenger list heading', () => {
    it('uses an explicit native refresh action and prevents duplicate clicks while refreshing', async () => {
        const onRefresh = vi.fn();
        const { rerender } = render(<MessengerListHeading headingLevel={1} onRefresh={onRefresh} />);
        expect(screen.getByRole('heading', { name: '대화', level: 1 })).toBeInTheDocument();
        const refresh = screen.getByRole('button', { name: '대화 목록 새로고침' });
        expect(refresh).toHaveAttribute('type', 'button');
        const arrow = refresh.querySelector('.anticon-sync');
        expect(arrow).toBeInTheDocument();
        expect(onRefresh).not.toHaveBeenCalled();
        await userEvent.setup().click(refresh);
        expect(onRefresh).toHaveBeenCalledTimes(1);
        rerender(<MessengerListHeading headingLevel={1} onRefresh={onRefresh} refreshing />);
        expect(refresh).toHaveClass('is-refreshing');
        expect(refresh.querySelector('.anticon-sync')).toBe(arrow);
        expect(refresh.querySelector('.anticon-loading')).not.toBeInTheDocument();
        expect(refresh).toHaveAttribute('aria-disabled', 'true');
        expect(refresh).not.toBeDisabled();
        expect(refresh).toHaveFocus();
        expect(refresh).toHaveAttribute('aria-busy', 'true');
        await userEvent.setup().click(refresh);
        await userEvent.setup().keyboard('{Enter}');
        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveFocus();
    });

    it('shares a centered 72px header and 44px action geometry with the shell close button', () => {
        const css = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/global/feature-surfaces.css'), 'utf8'));
        const rulesFor = selector => {
            const result = {};
            css.walkRules(rule => {
                if (rule.parent.type === 'atrule' || !rule.selectors.includes(selector)) return;
                rule.walkDecls(decl => { result[decl.prop] = decl.value; });
            });
            return result;
        };
        expect(rulesFor('.reserve-messenger-list-heading')).toMatchObject({
            height: 'var(--reserve-messenger-heading-height, 72px)', 'align-items': 'center', 'flex-shrink': '0',
            padding: '12px 16px 12px 20px', 'border-bottom': '1px solid var(--c-border-light, #f2f4f6)',
        });
        expect(rulesFor('.reserve-messenger-settings-heading')).toMatchObject({
            height: 'var(--reserve-messenger-heading-height, 72px)', 'align-items': 'center', 'flex-shrink': '0',
            padding: '12px 16px 12px 20px', 'border-bottom': '1px solid var(--c-border-light, #f2f4f6)',
        });
        expect(rulesFor('.reserve-messenger-list-scroll').padding).toBe('0 0 16px');
        expect(rulesFor('.reserve-messenger-list-refresh')).toMatchObject({ width: '44px', height: '44px', padding: '0' });
        expect(rulesFor(".reserve-messenger-list-refresh:hover:not([aria-disabled='true'])")).toMatchObject({
            color: 'var(--c-text-primary, #191f28)', background: 'var(--c-gray-50, #f9fafb)',
        });
        expect(rulesFor('.reserve-messenger-shell-close')).toMatchObject({
            top: 'calc((var(--reserve-messenger-heading-height, 72px) - 44px) / 2)', width: '44px', height: '44px',
            'font-size': '18px',
        });
        expect(rulesFor('.reserve-messenger-brand-cover h1')).toEqual({});
        expect(rulesFor('.reserve-messenger-brand-cover h2')).toEqual({});
    });
});

describe('shared composer source contract', () => {
    it('places tools below the input with a fixed touch target and a mobile-safe font', () => {
        const css = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/global/feature-surfaces.css'), 'utf8'));
        const declarations = (selector, mobile = false) => {
            const result = {};
            css.walkRules(rule => {
                const isMobile = rule.parent.type === 'atrule' && rule.parent.params === '(max-width: 767.98px)';
                if (!rule.selectors.includes(selector) || isMobile !== mobile) return;
                rule.walkDecls(decl => { result[decl.prop] = decl.value; });
            });
            return result;
        };
        expect(declarations('.reserve-messenger-composer')).toMatchObject({ 'min-height': '104px', padding: '8px', 'flex-direction': 'column', 'align-items': 'stretch' });
        expect(declarations('.reserve-messenger-composer textarea')).toMatchObject({ height: '56px', padding: '8px 10px', 'line-height': '24px' });
        expect(declarations('.reserve-chat-send')).toMatchObject({ width: '44px', height: '44px', 'border-radius': '10px' });
        expect(declarations('.reserve-messenger-send')).toMatchObject({ flex: '0 0 40px', width: '40px', height: '40px' });
        expect(declarations('.reserve-messenger-composer textarea', true)['font-size']).toBe('16px');
    });
});
