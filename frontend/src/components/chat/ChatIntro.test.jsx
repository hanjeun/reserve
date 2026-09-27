import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ChatIntro from './ChatIntro';
import MessengerContent from './MessengerContent';
import { chatService } from '../../services';
import { DEFAULT_SUPPORT_QUESTIONS } from '../../hooks/useChatIntro';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';

vi.mock('../../services', () => ({ chatService: {
    listConversations: vi.fn(), listStoreInbox: vi.fn(), getSupport: vi.fn(), sendSupport: vi.fn(),
    getStore: vi.fn(), sendStore: vi.fn(), getStoreInboxRoom: vi.fn(), sendStoreInbox: vi.fn(),
    pollRoom: vi.fn(), getHistory: vi.fn(), markRead: vi.fn(), setBlocked: vi.fn(), reportConversation: vi.fn(),
    getSupportIntro: vi.fn(), getStoreIntro: vi.fn(),
} }));

const DEFAULT_ITEMS = DEFAULT_SUPPORT_QUESTIONS.map(question => ({ question, answer: null }));
const emptyThread = { roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', canSend: true,
    counterpartName: '현재 담당자', counterpartProfileImage: '/icons/R_logo.png', messages: [] };
const emptyStoreThread = { roomId: 5, type: 'STORE', storeId: 31, viewerRole: 'MEMBER', canSend: true,
    title: '카페 리저브', messages: [] };
const mountContent = (client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) => render(
    <QueryClientProvider client={client}>
        <AntApp><MemoryRouter><MessengerContent surface="panel" /></MemoryRouter></AntApp>
    </QueryClientProvider>,
);

beforeEach(() => {
    Object.values(chatService).forEach(mock => mock.mockReset());
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 960 });
    Element.prototype.scrollIntoView = vi.fn();
    useAuthStore.setState({ user: { id: 7, name: '이용자', role: 'USER' }, isLoggedIn: true });
    useMessengerStore.setState({ view: 'conversations', activeThread: true, selection: { kind: 'support' },
        drafts: {}, sessionIdentity: messengerIdentityOf(useAuthStore.getState()) });
    chatService.listConversations.mockResolvedValue({ content: [], page: { number: 0, totalPages: 1 } });
    chatService.listStoreInbox.mockResolvedValue({ content: [], page: { number: 0, totalPages: 1 } });
    chatService.getSupport.mockResolvedValue(emptyThread);
    chatService.pollRoom.mockResolvedValue([]);
    chatService.markRead.mockResolvedValue({});
    // 설정 조회가 아무것도 돌려주지 않으면 기본 안내(기존 질문 4개, 답변 없음)로 떨어진다.
    chatService.getSupportIntro.mockResolvedValue(undefined);
    chatService.getStoreIntro.mockResolvedValue({ configured: false, notice: null, items: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('chat intro component', () => {
    it('shows a greeting and four question buttons without a sender avatar, synthetic messages or time', () => {
        const { container } = render(<ChatIntro userName=" 이용자 " items={DEFAULT_ITEMS} onAsk={vi.fn()} />);
        expect(screen.getByText(/안녕하세요, 이용자님/)).toBeInTheDocument();
        expect(screen.getByText('안녕하세요. RESERVE입니다.')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: '자주 묻는 질문' }).querySelectorAll('button')).toHaveLength(4);
        // 보낸 사람 표시(아바타 + 이름)는 대화창 헤더와 겹쳐서 두지 않는다(2026-09-24).
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('time')).toBeNull();
        expect(container.querySelector('.reserve-chat-bubble-group')).toBeNull();
    });

    it('renders user names and configured text literally and keeps the anonymous greeting useful', () => {
        const view = render(<ChatIntro userName="<img src=x onerror=alert(1)>" items={DEFAULT_ITEMS} onAsk={vi.fn()} />);
        expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
        expect(view.container.querySelector('[onerror]')).toBeNull();
        view.rerender(<ChatIntro items={DEFAULT_ITEMS} onAsk={vi.fn()} />);
        expect(screen.getByText(/안녕하세요, 회원님 🙂/)).toBeInTheDocument();
        view.rerender(<ChatIntro notice={'<b>굵게</b> 공지'} items={[{ question: '<i>질문</i>', answer: '<script>x</script>' }]} />);
        expect(screen.getByText(/<b>굵게<\/b>/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '<i>질문</i>' }));
        expect(screen.getByText('<script>x</script>')).toBeInTheDocument();
        expect(view.container.querySelector('b, i, script')).toBeNull();
    });

    it('answers a question with a saved answer immediately, removes it from the buttons and never fills the input', () => {
        const onAsk = vi.fn();
        render(<ChatIntro items={[
            { question: '주차할 수 있나요?', answer: '건물 뒤편에 2대까지 가능해요.' },
            { question: '반려동물 동반', answer: '소형견만 가능해요.' },
        ]} onAsk={onAsk} />);
        fireEvent.click(screen.getByRole('button', { name: '주차할 수 있나요?' }));
        const exchange = screen.getByText('건물 뒤편에 2대까지 가능해요.').closest('.reserve-chat-intro-exchange');
        expect(within(exchange).getByText('주차할 수 있나요?')).toHaveClass('reserve-chat-intro-question');
        expect(within(exchange).getByText('자동 답변')).toBeInTheDocument();
        expect(screen.getByText('더 궁금한 점은 아래에 메시지로 남겨주세요.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '주차할 수 있나요?' })).toBeNull();
        expect(screen.getByRole('button', { name: '반려동물 동반' })).toBeEnabled();
        expect(onAsk).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '반려동물 동반' }));
        expect(screen.queryByRole('group', { name: '자주 묻는 질문' })).toBeNull();
        expect(screen.getAllByText('자동 답변')).toHaveLength(2);
    });

    it('keeps auto answers available while a message is sending but blocks input-filling questions', () => {
        render(<ChatIntro disabled items={[{ question: '주차', answer: '가능해요.' }, { question: '기타 문의', answer: null }]} onAsk={vi.fn()} />);
        expect(screen.getByRole('button', { name: '주차' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '기타 문의' })).toBeDisabled();
    });

    it('shows the notice in the megaphone line instead of the default hello', () => {
        const { container } = render(<ChatIntro variant="store" displayName="카페 리저브" notice="9월 30일은 임시 휴무예요" items={[]} />);
        const line = container.querySelector('.reserve-messenger-support-announcement');
        expect(line).toHaveTextContent('9월 30일은 임시 휴무예요');
        expect(line.querySelector('[aria-label="notification"], .anticon')).toBeTruthy();
        expect(screen.queryByText('안녕하세요. 카페 리저브입니다.')).toBeNull();
    });

    it('introduces a store with its own name and a default owner greeting', () => {
        render(<ChatIntro variant="store" displayName="카페 리저브" items={[{ question: '영업시간', answer: '10시~22시' }]} />);
        expect(screen.getByText('안녕하세요. 카페 리저브입니다.')).toBeInTheDocument();
        expect(screen.getByText(/사장님이 확인 후 답변드릴게요/)).toBeInTheDocument();
        expect(screen.queryByText(/관리자가 확인/)).toBeNull();
    });
});

describe('first support inquiry', () => {
    it('adds a default question to the input, preserves existing draft and only sends on explicit submit', async () => {
        const user = userEvent.setup();
        useMessengerStore.getState().setDraft('support', '제가 쓴 내용');
        chatService.sendSupport.mockResolvedValue({ id: 1, senderRole: 'MEMBER', content: '제가 쓴 내용\n예약을 확인하고 싶어요' });
        mountContent();
        await user.click(await screen.findByRole('button', { name: '예약을 확인하고 싶어요' }));
        expect(screen.getByRole('textbox')).toHaveValue('제가 쓴 내용\n예약을 확인하고 싶어요');
        expect(chatService.sendSupport).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '보내기', exact: true }));
        await waitFor(() => expect(chatService.sendSupport).toHaveBeenCalledTimes(1));
        expect(chatService.sendSupport).toHaveBeenCalledWith('제가 쓴 내용\n예약을 확인하고 싶어요', expect.any(String));
        expect(screen.queryByLabelText('문의 시작 안내')).not.toBeInTheDocument();
    });

    it('uses the admin-configured support name and photo in the thread header', async () => {
        chatService.getSupportIntro.mockResolvedValue({ configured: true, displayName: '리저브 도우미', avatarUrl: 'https://cdn.example/support/chat/a.png', items: [] });
        const { container } = mountContent();
        expect(await screen.findByText('리저브 도우미')).toBeInTheDocument();
        await waitFor(() => expect(container.querySelector('.reserve-messenger-thread-avatar img')).toHaveAttribute('src', expect.stringContaining('support/chat/a.png')));
    });

    it('shows the admin-configured notice and auto answers without sending anything', async () => {
        const user = userEvent.setup();
        chatService.getSupportIntro.mockResolvedValue({ configured: true, notice: '운영시간은 평일 10시~18시예요.',
            items: [{ question: '환불은 언제 되나요?', answer: '취소 후 3~5영업일 안에 결제 수단으로 돌아가요.' }] });
        mountContent();
        expect(await screen.findByText('운영시간은 평일 10시~18시예요.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '환불은 언제 되나요?' }));
        expect(screen.getByText('취소 후 3~5영업일 안에 결제 수단으로 돌아가요.')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveValue('');
        expect(chatService.sendSupport).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '예약을 확인하고 싶어요' })).toBeNull();
    });

    it('does not discard a full draft through question selection', async () => {
        useMessengerStore.getState().setDraft('support', '가'.repeat(2000));
        mountContent();
        const question = await screen.findByRole('button', { name: '기타 문의' });
        expect(question).toBeDisabled();
        fireEvent.click(question);
        expect(screen.getByRole('textbox')).toHaveValue('가'.repeat(2000));
        expect(chatService.sendSupport).not.toHaveBeenCalled();
    });

    it('shows loading and errors honestly, then shows the greeting only after retry succeeds', async () => {
        let reject;
        chatService.getSupport.mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise; }));
        mountContent();
        expect(screen.getByRole('status', { name: '대화를 불러오는 중' })).toBeInTheDocument();
        expect(screen.queryByLabelText('문의 시작 안내')).not.toBeInTheDocument();
        await act(async () => reject(new Error('offline')));
        expect(screen.getByRole('alert')).toHaveTextContent('대화를 불러오지 못했습니다.');
        expect(screen.getByRole('textbox')).toBeDisabled();
        expect(screen.queryByLabelText('문의 시작 안내')).not.toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(await screen.findByLabelText('문의 시작 안내')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toBeEnabled();
    });

    it('keeps the default questions when the intro settings cannot be loaded', async () => {
        chatService.getSupportIntro.mockRejectedValue(new Error('offline'));
        mountContent();
        expect(await screen.findByRole('button', { name: '기타 문의' })).toBeInTheDocument();
    });

    it.each([
        { canSend: false, sendDisabledReason: 'BLOCKED_BY_ME' },
        { type: 'STORE' },
        { viewerRole: 'OWNER' },
        { roomId: null },
        { hasOlderMessages: true, nextBeforeId: 51 },
        { messages: [{ id: 1, senderRole: 'ADMIN', content: '실제 과거 답변' }] },
    ])('does not invent a first inquiry for an existing, blocked or invalid thread: %j', async changes => {
        chatService.getSupport.mockResolvedValue({ ...emptyThread, ...changes });
        mountContent();
        await waitFor(() => expect(screen.queryByRole('status', { name: '대화를 불러오는 중' })).not.toBeInTheDocument());
        expect(screen.queryByLabelText('문의 시작 안내')).not.toBeInTheDocument();
        expect(chatService.sendSupport).not.toHaveBeenCalled();
    });

    it.each(['switch', 'settings', 'session'])('ignores a late read acknowledgement after %s', async transition => {
        vi.spyOn(document, 'hasFocus').mockReturnValue(true);
        let acknowledge;
        chatService.markRead.mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve; }));
        chatService.pollRoom.mockResolvedValueOnce([{ id: 101, senderRole: 'ADMIN', content: '새 답변' }]);
        chatService.getStore.mockResolvedValue({ roomId: 42, type: 'STORE', storeId: 42, viewerRole: 'MEMBER', canSend: true, messages: [] });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        mountContent(client);
        await screen.findByText('새 답변');
        await waitFor(() => expect(chatService.markRead).toHaveBeenCalledTimes(1));
        await act(async () => {
            if (transition === 'switch') useMessengerStore.getState().select({ kind: 'store', storeId: 42 });
            else if (transition === 'settings') useMessengerStore.getState().showSettings();
            else useAuthStore.setState({ user: { id: 8, name: '새 계정', role: 'USER' }, isLoggedIn: true });
        });
        if (transition === 'switch') await waitFor(() => expect(chatService.getStore).toHaveBeenCalled());
        const before = invalidate.mock.calls.length;
        await act(async () => acknowledge({}));
        expect(invalidate).toHaveBeenCalledTimes(before);
    });
});

describe('first store inquiry', () => {
    beforeEach(() => {
        useMessengerStore.setState({ selection: { kind: 'store', storeId: 31 } });
        chatService.getStore.mockResolvedValue(emptyStoreThread);
    });

    it('shows the owner-configured notice and answers questions without messaging the owner', async () => {
        const user = userEvent.setup();
        chatService.getStoreIntro.mockResolvedValue({ configured: true, notice: '반가워요! 편하게 물어보세요.',
            items: [{ question: '주차할 수 있나요?', answer: '건물 뒤편에 2대까지 가능해요.' }] });
        mountContent();
        expect(await screen.findByText('반가워요! 편하게 물어보세요.')).toBeInTheDocument();
        expect(screen.getByText(/사장님이 확인 후 답변드릴게요/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '주차할 수 있나요?' }));
        expect(screen.getByText('건물 뒤편에 2대까지 가능해요.')).toBeInTheDocument();
        expect(chatService.getStoreIntro).toHaveBeenCalledWith('31');
        expect(chatService.sendStore).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox')).toHaveValue('');
    });

    it('shows the default store intro even before the owner sets anything up', async () => {
        mountContent();
        expect(await screen.findByLabelText('문의 시작 안내')).toBeInTheDocument();
        expect(screen.getByText('안녕하세요. 카페 리저브입니다.')).toBeInTheDocument();
        expect(screen.getByText(/사장님이 확인 후 답변드릴게요/)).toBeInTheDocument();
    });

    it('uses the saved greeting with the customer name', async () => {
        chatService.getStoreIntro.mockResolvedValue({ configured: true, notice: null, greeting: '{이름}님 어서 오세요!\n\n편하게 물어보세요.', items: [] });
        mountContent();
        expect(await screen.findByText('이용자님 어서 오세요!')).toBeInTheDocument();
        expect(screen.getByText('편하게 물어보세요.')).toBeInTheDocument();
    });

    it('does not show the intro once the conversation has messages', async () => {
        chatService.getStoreIntro.mockResolvedValue({ configured: true, notice: '반가워요!', items: [] });
        chatService.getStore.mockResolvedValue({ ...emptyStoreThread, messages: [{ id: 3, senderRole: 'OWNER', content: '안녕하세요' }] });
        mountContent();
        expect(await screen.findByText('안녕하세요')).toBeInTheDocument();
        expect(screen.queryByLabelText('문의 시작 안내')).not.toBeInTheDocument();
    });
});
