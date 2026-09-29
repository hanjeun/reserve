import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    ArrowLeftOutlined,
    CloseOutlined,
    MessageOutlined,
} from '@ant-design/icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bone, Button, DataState } from '../common';
import ConversationListSkeleton from './ConversationListSkeleton';
import MessengerListHeading from './MessengerListHeading';
import { chatListQueryPolicy } from './chatListQueryPolicy';
import { listRows } from '../../utils/listResponse';
import MessengerHome from './MessengerHome';
import MessengerFooter from './MessengerFooter';
import MessengerSettings from './MessengerSettings';
import ChatIntro from './ChatIntro';
import useChatIntro, { STORE_EMPTY_TEXT, chatIntroScope } from '../../hooks/useChatIntro';
import ConversationRow from './MessengerConversationRow';
import MessengerAvatar from './MessengerAvatar';
import { conversationTitle, SUPPORT_LABEL, SupportIdentityContext, useSupportIdentity } from './messengerIdentity';
import { SupportAvatar } from './SupportIdentity';
import ChatNotificationControl from './ChatNotificationControl';
import ChatBubbleList from './ChatBubbleList';
import ChatComposer from './ChatComposer';
import useChatImageDraft from '../../hooks/useChatImageDraft';
import ChatModerationMenu from './ChatModerationMenu';
import useChatThread from '../../hooks/useChatThread';
import useChatNotifications from '../../hooks/useChatNotifications';
import { useMessage, useWindowWidth } from '../../hooks';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';
import { breakpoints } from '../../styles/tokens';

const POLL_THREAD_MS = 4000;
const THREAD_BACK_FALLBACK_MS = 320;
const OWNER_REPLIES = [
    { label: '인사', text: '안녕하세요. 문의주셔서 감사합니다. 확인 후 안내드리겠습니다.' },
    { label: '방문 정보 확인', text: '원하시는 방문 날짜와 시간, 인원을 알려주시면 확인 후 안내드리겠습니다.' },
    { label: '확인 중', text: '문의하신 내용을 확인하고 있습니다. 확인이 끝나면 이 대화에서 안내드리겠습니다.' },
];

const contentOf = listRows;
const flattenPages = (data) => data?.pages?.flatMap(contentOf) ?? [];
const nextPage = (last, pages) => {
    const meta = last?.page;
    if (meta && meta.number + 1 < meta.totalPages) return meta.number + 1;
    if (last?.last === false) return pages.length;
    return undefined;
};

const selectionKeyOf = (selection) => {
    if (selection?.kind === 'admin') return `admin:${selection.roomId}`;
    if (selection?.kind === 'store') return `store:${selection.storeId}`;
    if (selection?.kind === 'owner') return `owner:${selection.roomId}`;
    return 'support';
};

const matchesSelection = (row, selection) => {
    if (selection?.kind === 'admin') {
        return (row.roomId ?? row.id) === selection.roomId
            && (row.viewerRole ?? 'ADMIN') === 'ADMIN';
    }
    if (selection?.kind === 'owner') return row.roomId === selection.roomId && row.viewerRole === 'OWNER';
    if (selection?.kind === 'store') return row.storeId === selection.storeId && row.viewerRole !== 'OWNER';
    return row.type === 'SUPPORT' && row.viewerRole === 'MEMBER';
};

const viewerRoleOf = (selection) => {
    if (selection?.kind === 'admin') return 'ADMIN';
    if (selection?.kind === 'owner') return 'OWNER';
    return 'MEMBER';
};

const adminConversationRow = (room) => ({
    roomId: room.id,
    type: 'SUPPORT',
    counterpartName: room.memberName || room.memberEmail || '회원',
    counterpartProfileImage: room.memberProfileImage,
    viewerRole: 'ADMIN',
    unread: room.adminUnread ?? 0,
    lastMessagePreview: room.lastMessagePreview,
    lastMessageAt: room.lastMessageAt,
});

const clearUnreadInInfiniteData = (data, selection) => {
    if (!data?.pages) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
        const content = contentOf(page).map((row) => {
            const unread = selection?.kind === 'admin' ? row.adminUnread : row.unread;
            if (!matchesSelection(row, selection) || unread === 0) return row;
            changed = true;
            return selection?.kind === 'admin'
                ? { ...row, adminUnread: 0 }
                : { ...row, unread: 0 };
        });
        return changed ? { ...page, content } : page;
    });
    return changed ? { ...data, pages } : data;
};

const supportFallback = {
    roomId: null,
    type: 'SUPPORT',
    storeId: null,
    counterpartName: SUPPORT_LABEL,
    viewerRole: 'MEMBER',
    unread: 0,
    lastMessagePreview: null,
    lastMessageAt: null,
};

const MessengerContentBody = ({ surface = 'page', initialStoreId = null, coverImageSrc, onClose }) => {
    // 고객지원 표시 이름·사진(채팅 관리 설정) — 제목 계산보다 먼저 읽는다.
    const supportIdentity = useSupportIdentity();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = useMessage();
    const user = useAuthStore((state) => state.user);
    const sessionIdentity = useMessengerStore((state) => state.sessionIdentity);
    const storedSelection = useMessengerStore((state) => state.selection);
    const storedView = useMessengerStore((state) => state.view);
    const activeThread = useMessengerStore((state) => state.activeThread);
    const select = useMessengerStore((state) => state.select);
    const showHome = useMessengerStore((state) => state.showHome);
    const showConversations = useMessengerStore((state) => state.showConversations);
    const showSettings = useMessengerStore((state) => state.showSettings);
    const setDraft = useMessengerStore((state) => state.setDraft);
    const isWide = useWindowWidth() >= breakpoints.tablet;
    const canOwnStores = hasOwnerAccess(user?.role);
    const canAdminSupport = hasAdminAccess(user?.role);
    const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
    const [returningToList, setReturningToList] = useState(false);
    // 목록 → 대화 열기 애니메이션. 뒤로가기(대화가 오른쪽으로 빠짐)의 반대 방향이다.
    const [openingThread, setOpeningThread] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const routeStoreId = Number(initialStoreId);
    const routeSelection = useMemo(
        () => Number.isInteger(routeStoreId) && routeStoreId > 0
            ? { kind: 'store', storeId: routeStoreId }
            : null,
        [routeStoreId],
    );
    const selection = routeSelection ?? storedSelection;
    const isHome = storedView === 'home' && routeSelection === null;
    const isSettings = storedView === 'settings' && routeSelection === null;
    const isConversations = !isHome && !isSettings;

    const memberQuery = useInfiniteQuery({
        queryKey: showHidden ? [...chatKeys.conversations(), 'hidden'] : chatKeys.conversations(),
        queryFn: ({ pageParam }) => showHidden ? chatService.listConversations(pageParam, true) : chatService.listConversations(pageParam),
        initialPageParam: 0,
        getNextPageParam: nextPage,
        ...chatListQueryPolicy,
    });
    const ownerQuery = useInfiniteQuery({
        queryKey: showHidden ? [...chatKeys.inbox(), 'hidden'] : chatKeys.inbox(),
        queryFn: ({ pageParam }) => showHidden ? chatService.listStoreInbox(pageParam, true) : chatService.listStoreInbox(pageParam),
        initialPageParam: 0,
        getNextPageParam: nextPage,
        enabled: canOwnStores,
        ...chatListQueryPolicy,
    });
    const adminQuery = useInfiniteQuery({
        queryKey: chatKeys.adminInbox(),
        queryFn: ({ pageParam }) => chatService.listAdminSupportInbox(pageParam),
        initialPageParam: 0,
        getNextPageParam: nextPage,
        enabled: canAdminSupport && !showHidden,
        ...chatListQueryPolicy,
    });

    const memberRows = useMemo(() => flattenPages(memberQuery.data), [memberQuery.data]);
    const ownerRows = useMemo(() => flattenPages(ownerQuery.data), [ownerQuery.data]);
    const adminRows = useMemo(
        () => flattenPages(adminQuery.data).map(adminConversationRow),
        [adminQuery.data],
    );
    const memberColdError = memberQuery.isError && memberRows.length === 0;
    const ownerColdError = ownerQuery.isError && ownerRows.length === 0;
    const adminColdError = adminQuery.isError && adminRows.length === 0;
    // 한 계정이 회원·사업자·관리자 역할을 함께 가지면 세 목록을 동시에 읽는다.
    // 모두 실패한 경우에는 같은 연결 문제를 세 번 반복하지 않고, 한 번의 상태와 재시도로 묶는다.
    // 한 목록이라도 이전/현재 데이터를 갖고 있으면 아래 각 섹션의 compact 상태를 유지한다.
    const enabledConversationSources = [
        { enabled: true, query: memberQuery, rows: memberRows },
        { enabled: canOwnStores, query: ownerQuery, rows: ownerRows },
        { enabled: canAdminSupport && !showHidden, query: adminQuery, rows: adminRows },
    ].filter((source) => source.enabled);
    const allConversationListsFailed = enabledConversationSources.length > 0
        && enabledConversationSources.every(({ query, rows }) => query.isError && rows.length === 0);
    const allConversationListsError = enabledConversationSources
        .find(({ query }) => query.isError)?.query.error;
    const conversationListsFetching = enabledConversationSources.some(({ query }) => query.isFetching);
    const refreshConversationLists = useCallback(() => {
        const requests = [memberQuery.refetch()];
        if (canOwnStores) requests.push(ownerQuery.refetch());
        if (canAdminSupport && !showHidden) requests.push(adminQuery.refetch());
        return Promise.all(requests);
    }, [adminQuery, canAdminSupport, canOwnStores, memberQuery, ownerQuery, showHidden]);
    const supportRow = memberRows.find((row) => row.type === 'SUPPORT') ?? supportFallback;
    // 관리자 계정은 같은 지원방을 상담원 목록과 개인 회원 목록에서 모두 받을 수 있다.
    // 방 ID가 같으면 상담원 시점 한 줄만 남겨 이름·읽음 기준이 섞이지 않게 한다.
    const customerRows = useMemo(() => {
        if (showHidden || !canAdminSupport || adminRows.length === 0) return memberRows;
        const administeredRoomIds = new Set(adminRows.map((row) => String(row.roomId)));
        return memberRows.filter((row) => !administeredRoomIds.has(String(row.roomId)));
    }, [adminRows, canAdminSupport, memberRows, showHidden]);
    const selectedRow = [...adminRows, supportRow, ...customerRows, ...ownerRows]
        .find((row) => matchesSelection(row, selection));
    const selectedUnreadRef = useRef(0);
    useEffect(() => {
        selectedUnreadRef.current = selectedRow?.unread ?? 0;
    }, [selectedRow?.unread]);

    const selectionKey = selectionKeyOf(selection);
    const [history, setHistory] = useState({
        key: selectionKey, hasMore: false, nextBeforeId: null, loading: false,
    });
    const mobileThreadVisible = isConversations && (mobileThreadOpen || routeSelection !== null);
    const showThread = isConversations && ((isWide && activeThread) || mobileThreadVisible);
    const threadKey = showThread ? selectionKey : null;
    const imageDraft = useChatImageDraft(threadKey);
    const readScopeRef = useRef(null);
    const notificationTargetRef = useRef(null);
    const openNotifiedConversation = useCallback(roomId => {
        const target = notificationTargetRef.current;
        if (target?.roomId !== roomId
            || target.identity !== messengerIdentityOf(useAuthStore.getState())) return;
        if (routeSelection) navigate('/messages', { replace: true });
        select(target.selection);
        setMobileThreadOpen(true);
        window.focus();
    }, [navigate, routeSelection, select]);
    const notifications = useChatNotifications(openNotifiedConversation);
    const notify = notifications.notify;

    const load = useCallback(() => {
        if (selection.kind === 'admin') {
            return chatService.getAdminSupportRoom(selection.roomId).then(messages => ({
                roomId: selection.roomId,
                type: 'SUPPORT',
                title: selectedRow?.counterpartName || '회원 문의',
                counterpartName: selectedRow?.counterpartName || '회원',
                counterpartProfileImage: selectedRow?.counterpartProfileImage ?? null,
                viewerRole: 'ADMIN',
                canSend: true,
                hasOlderMessages: false,
                nextBeforeId: null,
                messages: messages ?? [],
            }));
        }
        if (selection.kind === 'store') return chatService.getStore(selection.storeId);
        if (selection.kind === 'owner') return chatService.getStoreInboxRoom(selection.roomId);
        return chatService.getSupport();
    }, [selectedRow?.counterpartName, selectedRow?.counterpartProfileImage, selection.kind, selection.roomId, selection.storeId]);
    const poll = useCallback(
        (roomId, afterId) => selection.kind === 'admin'
            ? chatService.pollAdminSupportRoom(roomId, afterId)
            : chatService.pollRoom(roomId, afterId),
        [selection.kind],
    );
    const sendFn = useCallback((_roomId, content, clientMessageId, file, config) => {
        if (file) return chatService.sendImage(_roomId, file, content, clientMessageId, config);
        if (selection.kind === 'admin') {
            return chatService.sendAdminSupportRoom(selection.roomId, content, clientMessageId, config);
        }
        if (selection.kind === 'store') {
            return chatService.sendStore(selection.storeId, content, clientMessageId, config);
        }
        if (selection.kind === 'owner') {
            return chatService.sendStoreInbox(selection.roomId, content, clientMessageId, config);
        }
        return chatService.sendSupport(content, clientMessageId, config);
    }, [selection.kind, selection.roomId, selection.storeId]);

    const clearUnreadCaches = useCallback((readCount = 0) => {
        queryClient.setQueryData(
            chatKeys.conversations(),
            (data) => clearUnreadInInfiniteData(data, selection),
        );
        queryClient.setQueryData(
            chatKeys.inbox(),
            (data) => clearUnreadInInfiniteData(data, selection),
        );
        queryClient.setQueryData(
            chatKeys.adminInbox(),
            (data) => clearUnreadInInfiniteData(data, selection),
        );
        if (readCount > 0) {
            queryClient.setQueryData(chatKeys.unread(), (count) => Math.max(0, Number(count ?? 0) - readCount));
        }
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        queryClient.invalidateQueries({ queryKey: chatKeys.adminInbox() });
        queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    }, [queryClient, selection]);
    const onLoaded = useCallback((loadedThread) => {
        const readCount = selectedUnreadRef.current;
        selectedUnreadRef.current = 0;
        setHistory({
            key: selectionKey,
            hasMore: Boolean(loadedThread?.hasOlderMessages),
            nextBeforeId: loadedThread?.nextBeforeId ?? null,
            loading: false,
        });
        clearUnreadCaches(readCount);
    }, [clearUnreadCaches, selectionKey]);
    const onSent = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        queryClient.invalidateQueries({ queryKey: chatKeys.adminInbox() });
        queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    }, [queryClient]);
    const onError = useCallback((text) => message.error(text), [message]);
    const onPolled = useCallback((roomId, fresh) => {
        const readScope = readScopeRef.current;
        if (readScope?.threadKey !== threadKey || readScope.loading || readScope.roomId !== roomId
            || readScope.identity !== messengerIdentityOf(useAuthStore.getState())) return;
        const viewerRole = viewerRoleOf(selection);
        if (isWide && notify({ roomId, messages: fresh, viewerRole })) {
            // OS에는 고정 익명 문구만 보내고, 클릭 대상은 현재 로그인 세션의 메모리에만 둔다.
            notificationTargetRef.current = {
                roomId, selection, identity: messengerIdentityOf(useAuthStore.getState()),
            };
        }
        if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
        const markRead = viewerRole === 'ADMIN'
            ? chatService.markAdminSupportRead(roomId)
            : chatService.markRead(roomId, viewerRole);
        markRead
            .then(() => {
                if (readScopeRef.current !== readScope || readScope.identity !== messengerIdentityOf(useAuthStore.getState())) return;
                clearUnreadCaches();
            })
            .catch(() => { /* 다음 방 열기에서 다시 읽음 처리한다. */ });
    }, [clearUnreadCaches, isWide, notify, selection, threadKey]);

    const {
        messages, thread, loading, loadError, sending, send, reload, prepend, cancelSend, updateMessage,
    } = useChatThread({
        threadKey,
        myRole: viewerRoleOf(selection),
        load,
        poll,
        pollChanges: chatService.pollRetractions,
        cancellable: true,
        send: sendFn,
        onLoaded,
        onSent,
        onChanged: onSent,
        onPolled,
        onError,
        pollMs: POLL_THREAD_MS,
    });
    useLayoutEffect(() => {
        const readScope = { threadKey, identity: sessionIdentity, loading, roomId: thread?.roomId ?? null };
        readScopeRef.current = readScope;
        return () => { if (readScopeRef.current === readScope) readScopeRef.current = null; };
    }, [threadKey, sessionIdentity, loading, thread?.roomId]);
    const handleModerationChanged = useCallback(() => {
        reload();
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
    }, [queryClient, reload]);

    const draft = useMessengerStore((state) => state.drafts[selectionKey] ?? '');
    const threadBodyRef = useRef(null);
    const historyScrollRef = useRef(null);
    const historyScopeRef = useRef(null);
    useLayoutEffect(() => {
        // 같은 방으로 돌아와도 전환 전 과거 조회와 스크롤 위치는 재사용하지 않는다.
        const scope = { threadKey, roomId: thread?.roomId ?? null };
        historyScopeRef.current = scope;
        historyScrollRef.current = null;
        return () => {
            if (historyScopeRef.current === scope) historyScopeRef.current = null;
        };
    }, [threadKey, thread?.roomId]);
    useLayoutEffect(() => {
        const preserved = historyScrollRef.current;
        const body = threadBodyRef.current;
        if (preserved && body) {
            body.scrollTop = preserved.top + (body.scrollHeight - preserved.height);
            historyScrollRef.current = null;
            return;
        }
        // scrollIntoView는 전환 중 바깥 페이지/패널까지 움직인다. 본문만 스크롤한다.
        if (showThread && body) body.scrollTop = body.scrollHeight;
    }, [messages, showThread]);

    const currentHistory = history.key === selectionKey
        ? history
        : { hasMore: false, nextBeforeId: null, loading: false };
    const loadOlderMessages = async () => {
        if (!thread?.roomId || !currentHistory.nextBeforeId || currentHistory.loading) return;
        const scope = historyScopeRef.current;
        if (scope?.threadKey !== threadKey || scope.roomId !== thread.roomId) return;
        const body = threadBodyRef.current;
        if (body) historyScrollRef.current = { height: body.scrollHeight, top: body.scrollTop };
        setHistory((state) => ({ ...state, loading: true }));
        try {
            const result = await chatService.getHistory(
                scope.roomId, currentHistory.nextBeforeId, 50);
            if (historyScopeRef.current !== scope) return;
            prepend(result?.messages ?? []);
            setHistory({
                key: selectionKey,
                hasMore: Boolean(result?.hasMore),
                nextBeforeId: result?.nextBeforeId ?? null,
                loading: false,
            });
        } catch {
            if (historyScopeRef.current !== scope) return;
            historyScrollRef.current = null;
            message.error('이전 메시지를 불러오지 못했습니다.');
        } finally {
            if (historyScopeRef.current === scope) {
                setHistory((state) => state.loading ? { ...state, loading: false } : state);
            }
        }
    };

    const choose = (next) => {
        if (returningToList || openingThread) return;
        if (routeSelection) navigate('/messages', { replace: true });
        select(next);
        setMobileThreadOpen(true);
        // 한 화면에 목록·대화가 같이 보이는 넓은 메시지 페이지는 자리만 바뀌므로 애니메이션이 없다.
        if (!(surface === 'page' && isWide)) setOpeningThread(true);
    };
    const finishConversationList = useCallback(() => {
        if (routeSelection) navigate('/messages', { replace: true });
        showConversations();
        setMobileThreadOpen(false);
        setReturningToList(false);
    }, [navigate, routeSelection, showConversations]);
    const handleVisibilityChanged = () => {
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
        finishConversationList();
    };
    const showConversationList = () => {
        if (returningToList || openingThread) return;
        setReturningToList(true);
    };
    useEffect(() => {
        if (!openingThread) return undefined;
        const timer = setTimeout(() => setOpeningThread(false), THREAD_BACK_FALLBACK_MS);
        return () => clearTimeout(timer);
    }, [openingThread]);
    // animationend가 생략되는 백그라운드 탭·스타일 재계산에서도 목록 전환을 끝낸다.
    useEffect(() => {
        if (!returningToList) return undefined;
        const timer = setTimeout(finishConversationList, THREAD_BACK_FALLBACK_MS);
        return () => clearTimeout(timer);
    }, [finishConversationList, returningToList]);
    const handleSend = async () => {
        const text = draft.trim();
        const file = imageDraft.file;
        if ((!text && !file) || sending || thread?.canSend === false) return;
        const identity = useMessengerStore.getState().sessionIdentity;
        setDraft(selectionKey, '', identity);
        imageDraft.clear();
        const ok = await send(text, file);
        if (ok === false && file) imageDraft.restore(file);
        // 전송 실패가 나중에 와도 새 입력이나 다른 세션의 초안을 덮지 않는다.
        if (ok === false && !useMessengerStore.getState().drafts[selectionKey]) {
            setDraft(selectionKey, text, identity);
        }
    };

    // 대화 종류(관리자 · 고객지원 · 사업자 · 가게 문의)별 제목/부제/빈 대화 문구.
    let title;
    let threadKind;
    let emptyText = STORE_EMPTY_TEXT;
    if (selection.kind === 'admin') {
        title = thread?.title || selectedRow?.counterpartName || '회원 문의';
        threadKind = 'RESERVE 고객지원 · 관리자';
        emptyText = '회원의 문의에 답변할 수 있습니다.';
    } else if (selection.kind === 'support') {
        title = supportIdentity.name;
        threadKind = 'RESERVE 고객지원';
        emptyText = '서비스 이용에 관해 궁금한 점을 남겨주세요.';
    } else if (selection.kind === 'owner') {
        title = thread?.title || conversationTitle(selectedRow);
        threadKind = `${selectedRow?.storeName || '가게'} · 받은 문의`;
    } else {
        title = selectedRow?.storeName || thread?.title || conversationTitle(selectedRow);
        threadKind = '가게 문의';
    }
    // 첫 안내(인사말 + 자동 문답) — 고객지원은 관리자가, 가게 문의는 사장님이 설정한다(2026-09-23).
    const introScope = chatIntroScope(selection);
    const { intro } = useChatIntro(introScope, { enabled: Boolean(introScope) });
    const canShowIntro = thread?.viewerRole === 'MEMBER' && thread?.canSend === true
        && messages.length === 0 && !currentHistory.hasMore;
    const showSupportIntro = selection.kind === 'support' && thread?.type === 'SUPPORT'
        && thread?.roomId > 0 && canShowIntro;
    // 가게 문의도 고객지원처럼 첫 대화에는 항상 안내를 보인다 — 설정이 없으면 기본 안내(2026-09-24 통일).
    const showStoreIntro = selection.kind === 'store' && canShowIntro;
    const showIntro = showSupportIntro || showStoreIntro;
    // 답변이 없는 질문(관리자가 설정하기 전 기본 질문)만 입력칸에 채운다. 답변이 있으면 ChatIntro 가 바로 보여준다.
    const chooseIntroQuestion = (question) => {
        const state = useMessengerStore.getState();
        const current = state.drafts[selectionKey] ?? '';
        const next = current ? `${current}\n${question}` : question;
        if (!showIntro || sending || next.length > 2000) return;
        setDraft(selectionKey, next, state.sessionIdentity);
    };
    let disabledMessage = '현재 운영 상태에서는 새 메시지를 보낼 수 없지만 이전 대화는 계속 볼 수 있습니다.';
    if (thread?.sendDisabledReason === 'BLOCKED_BY_ME') {
        disabledMessage = '내가 차단한 대화입니다. 대화 관리에서 차단을 해제할 수 있습니다.';
    } else if (thread?.sendDisabledReason === 'BLOCKED_BY_OTHER') {
        disabledMessage = '상대방이 차단해 새 메시지를 보낼 수 없습니다. 이전 대화는 계속 볼 수 있습니다.';
    }

    let footerView = 'conversations';
    if (isHome) footerView = 'home';
    else if (isSettings) footerView = 'settings';
    const navigation = (
        <MessengerFooter view={footerView} disabled={openingThread || returningToList}
            onChange={value => {
                if (routeSelection) navigate('/messages', { replace: true });
                setMobileThreadOpen(false);
                if (value === 'home') showHome();
                else if (value === 'settings') showSettings();
                else showConversations();
            }} />
    );
    const notificationControl = isWide ? (
        <ChatNotificationControl state={notifications.state} onEnable={notifications.enable} onDisable={notifications.disable} />
    ) : null;
    // PC 패널의 X는 Shell이 제공한다. 모바일 페이지는 내부 화면과 무관하게 같은 닫기 관문을 쓴다.
    const closeAction = surface === 'page' && onClose ? (
        <button type="button" className="reserve-chat-close reserve-messenger-shell-close"
            onClick={onClose} aria-label="메시지 닫기">
            <CloseOutlined />
        </button>
    ) : null;

    // 목록 섹션 본문: 실패 → 로딩 → 빈 목록 → 목록 순으로 판정한다.
    const renderAdminRows = () => {
        if (adminColdError) {
            return (
                <DataState state="error" kind="message" subject="고객 문의" error={adminQuery.error}
                    onRetry={adminQuery.refetch} retrying={adminQuery.isFetching} compact />
            );
        }
        if (adminQuery.isLoading) return <ConversationListSkeleton />;
        if (adminRows.length === 0) {
            return <div className="reserve-messenger-list-state">아직 접수된 고객 문의가 없습니다.</div>;
        }
        return adminRows.map((row) => (
            <ConversationRow
                key={`admin-${row.roomId}`}
                row={row}
                selected={showThread && matchesSelection(row, selection)}
                onSelect={() => choose({ kind: 'admin', roomId: row.roomId })}
            />
        ));
    };
    const renderCustomerRows = () => {
        if (memberColdError) {
            return (
                <DataState state="error" kind="message" subject="대화 목록" error={memberQuery.error}
                    onRetry={memberQuery.refetch} retrying={memberQuery.isFetching} compact />
            );
        }
        if (memberQuery.isLoading) return <ConversationListSkeleton />;
        if (customerRows.length === 0) {
            return <div className="reserve-messenger-list-state">{showHidden ? '숨긴 대화가 없습니다.' : '아직 시작한 대화가 없습니다.'}</div>;
        }
        return customerRows.map((row) => (
            <ConversationRow
                key={row.type === 'SUPPORT' ? 'support' : `store-${row.storeId}`}
                row={row}
                owner={false}
                selected={showThread && matchesSelection(row, selection)}
                onSelect={() => choose(row.type === 'SUPPORT'
                    ? { kind: 'support' }
                    : { kind: 'store', storeId: row.storeId })}
            />
        ));
    };
    const renderOwnerRows = () => {
        if (ownerColdError) {
            return (
                <DataState state="error" kind="message" subject="받은 문의" error={ownerQuery.error}
                    onRetry={ownerQuery.refetch} retrying={ownerQuery.isFetching} compact />
            );
        }
        if (ownerQuery.isLoading) return <ConversationListSkeleton />;
        if (ownerRows.length === 0) {
            return <div className="reserve-messenger-list-state">아직 받은 가게 문의가 없습니다.</div>;
        }
        return ownerRows.map((row) => (
            <ConversationRow
                key={`owner-${row.roomId}`}
                row={row}
                owner
                selected={showThread && matchesSelection(row, selection)}
                onSelect={() => choose({ kind: 'owner', roomId: row.roomId })}
            />
        ));
    };
    // 대화창 헤더 아바타: 고객지원 → 상대 사람(관리자·사업자 시점) → 가게 사진 → 기본 아이콘.
    const renderThreadAvatar = () => {
        if (selection.kind === 'support') return <SupportAvatar className="reserve-messenger-thread-avatar" />;
        if (selection.kind === 'admin' || selection.kind === 'owner') {
            return (
                <MessengerAvatar imageSrc={thread?.counterpartProfileImage ?? selectedRow?.counterpartProfileImage}
                    variant="person" className="reserve-messenger-thread-avatar" />
            );
        }
        if (selection.kind === 'store' && (thread?.storeImageUrl || selectedRow?.storeImageUrl)) {
            return <MessengerAvatar imageSrc={thread?.storeImageUrl || selectedRow?.storeImageUrl} variant="store" className="reserve-messenger-thread-avatar" />;
        }
        return <span className="reserve-messenger-thread-avatar" aria-hidden="true"><MessageOutlined /></span>;
    };
    // 대화 본문: 로딩 → 실패 → 첫 안내 → 빈 대화 → 메시지 순으로 판정한다.
    const renderThreadBody = () => {
        if (loading) {
            return (
                <div className="reserve-messenger-thread-skeleton" role="status" aria-label="대화를 불러오는 중" aria-busy="true">
                    <div aria-hidden="true"><Bone width="65%" height={44} borderRadius={14} /><Bone width="50%" height={44} borderRadius={14} style={{ marginLeft: 'auto' }} /><Bone width="75%" height={44} borderRadius={14} /></div>
                </div>
            );
        }
        if (loadError) {
            return (
                <DataState state="error" kind="message" title="대화를 불러오지 못했습니다."
                    onRetry={reload} compact />
            );
        }
        if (showIntro) {
            return (
                <ChatIntro variant={showStoreIntro ? 'store' : 'support'} userName={user?.name}
                    displayName={showStoreIntro ? title : supportIdentity.name}
                    notice={intro.notice ?? undefined} greeting={intro.greeting ?? undefined} items={intro.items}
                    onAsk={chooseIntroQuestion} disabled={sending} draftLength={draft.length} />
            );
        }
        if (messages.length === 0) {
            return (
                <div className="reserve-messenger-thread-state">
                    <MessageOutlined aria-hidden="true" />
                    <span>{emptyText}</span>
                </div>
            );
        }
        return (
            <div>
                {currentHistory.hasMore && (
                    <div className="reserve-messenger-history-action">
                        <Button
                            variant="ghost-sm-primary"
                            size="sm"
                            loading={currentHistory.loading}
                            onClick={loadOlderMessages}
                        >
                            이전 메시지 보기
                        </Button>
                    </div>
                )}
                <ChatBubbleList messages={messages} mine={thread?.viewerRole || viewerRoleOf(selection)}
                    roomId={thread?.roomId} onRetracted={updateMessage}
                    reportRole={thread?.type === 'STORE' ? thread.viewerRole : undefined} />
            </div>
        );
    };

    if (isHome || isSettings) {
        return (
            <div className={`reserve-messenger reserve-messenger--${surface} is-home`}>
                {closeAction}
                {isSettings ? <MessengerSettings user={user} notificationControl={notificationControl} headingLevel={surface === 'page' ? 1 : 2} /> : <MessengerHome
                    headingLevel={surface === 'page' ? 1 : 2}
                    coverImageSrc={coverImageSrc}
                    admin={canAdminSupport}
                    onChoose={(next) => {
                        if (next.kind === 'admin-inbox') {
                            showConversations();
                            setMobileThreadOpen(false);
                            return;
                        }
                        choose(next);
                    }}
                />}
                {navigation}
            </div>
        );
    }

    return (
        <div className={`reserve-messenger reserve-messenger--${surface}${showThread ? ' has-thread' : ''}${mobileThreadVisible ? ' has-mobile-thread' : ''}${returningToList ? ' is-returning-to-list' : ''}${openingThread && !returningToList ? ' is-opening-thread' : ''}`}>
            {closeAction}
            {(!showThread || (surface === 'page' && isWide) || returningToList || openingThread) && <aside className="reserve-messenger-list" aria-label="대화 목록"
                inert={openingThread || returningToList ? true : undefined}>
                <MessengerListHeading headingLevel={surface === 'page' ? 1 : 2}
                    refreshing={conversationListsFetching}
                    onRefresh={refreshConversationLists} />

                <div className="reserve-messenger-list-scroll" aria-busy={enabledConversationSources.some(({ query }) => query.isLoading)}>
                    <Button variant="ghost-sm" size="sm" aria-pressed={showHidden}
                        onClick={() => setShowHidden(value => !value)} style={{ margin: '8px 18px' }}>
                        {showHidden ? '일반 대화 보기' : '숨긴 대화 보기'}
                    </Button>
                    {allConversationListsFailed ? (
                        <DataState state="error" kind="message" subject="대화 목록" error={allConversationListsError}
                            onRetry={refreshConversationLists} retrying={conversationListsFetching} />
                    ) : (
                        <>
                    {canAdminSupport && !showHidden && (
                        <section aria-labelledby="reserve-admin-support-inbox">
                            <h2 id="reserve-admin-support-inbox" className="reserve-messenger-section-label">고객지원 받은 문의</h2>
                            {adminQuery.isError && adminRows.length > 0 && (
                                <DataState state="error" kind="message"
                                    title="최신 고객 문의를 확인하지 못해 이전 목록을 보여드리고 있습니다."
                                    onRetry={adminQuery.refetch} retrying={adminQuery.isFetching} compact />
                            )}
                            {renderAdminRows()}
                            {adminQuery.hasNextPage && (
                                <Button
                                    variant="ghost-sm-primary"
                                    size="sm"
                                    loading={adminQuery.isFetchingNextPage}
                                    onClick={() => adminQuery.fetchNextPage()}
                                    style={{ margin: '10px 18px' }}
                                >
                                    고객 문의 더 보기
                                </Button>
                            )}
                        </section>
                    )}

                    <section aria-labelledby="reserve-my-conversations">
                        <h2 id="reserve-my-conversations" className={`reserve-messenger-section-label${customerRows.length === 0 ? ' reserve-messenger-sr-only' : ''}`}>내 대화</h2>
                        {memberQuery.isError && memberRows.length > 0 && (
                            <DataState state="error" kind="message"
                                title="최신 대화를 확인하지 못해 이전 목록을 보여드리고 있습니다."
                                onRetry={memberQuery.refetch} retrying={memberQuery.isFetching} compact />
                        )}
                        {renderCustomerRows()}
                        {memberQuery.hasNextPage && (
                            <Button
                                variant="ghost-sm-primary"
                                size="sm"
                                loading={memberQuery.isFetchingNextPage}
                                onClick={() => memberQuery.fetchNextPage()}
                                style={{ margin: '10px 18px' }}
                            >
                                대화 더 보기
                            </Button>
                        )}
                    </section>

                    {canOwnStores && (ownerQuery.isLoading || ownerQuery.isError || ownerRows.length > 0) && (
                        <section aria-labelledby="reserve-store-inbox">
                            <h2 id="reserve-store-inbox" className="reserve-messenger-section-label">가게 받은 문의</h2>
                            {ownerQuery.isError && ownerRows.length > 0 && (
                                <DataState state="error" kind="message"
                                    title="최신 받은 문의를 확인하지 못해 이전 목록을 보여드리고 있습니다."
                                    onRetry={ownerQuery.refetch} retrying={ownerQuery.isFetching} compact />
                            )}
                            {renderOwnerRows()}
                            {ownerQuery.hasNextPage && (
                                <Button
                                    variant="ghost-sm-primary"
                                    size="sm"
                                    loading={ownerQuery.isFetchingNextPage}
                                    onClick={() => ownerQuery.fetchNextPage()}
                                    style={{ margin: '10px 18px' }}
                                >
                                    받은 문의 더 보기
                                </Button>
                            )}
                        </section>
                    )}
                        </>
                    )}
                </div>
                {surface === 'page' && isWide && showThread && navigation}
            </aside>}

            {showThread && <section className="reserve-messenger-thread" aria-labelledby="reserve-messenger-thread-title"
                onAnimationEnd={event => {
                    if (event.target !== event.currentTarget) return;
                    if (returningToList) finishConversationList();
                    else if (openingThread) setOpeningThread(false);
                }}>
                <header className="reserve-messenger-thread-heading">
                    <button
                        type="button"
                        className="reserve-messenger-mobile-back"
                        onClick={showConversationList}
                        disabled={returningToList}
                        aria-label="대화 목록으로 돌아가기"
                    >
                        <ArrowLeftOutlined />
                    </button>
                    {renderThreadAvatar()}
                    <span className="reserve-messenger-thread-copy">
                        <strong id="reserve-messenger-thread-title">{title}</strong>
                        {selection.kind !== 'support' && <span>{threadKind}</span>}
                    </span>
                    <span className="reserve-messenger-thread-actions">
                        <ChatModerationMenu thread={thread} onChanged={handleModerationChanged}
                            onHidden={handleVisibilityChanged} hidden={showHidden && Boolean(selectedRow?.roomId)}
                            pending={selection.kind !== 'admin' && (loading || !thread)}
                            disabled={returningToList || loading} />
                    </span>
                </header>

                <div ref={threadBodyRef} className={`reserve-messenger-thread-body${selection.kind === 'support' ? ' reserve-messenger-thread-body--support' : ''}`}>
                    {renderThreadBody()}
                </div>

                {!loading && !loadError && thread?.canSend === false ? (
                    <div className="reserve-messenger-closed" role="status">
                        {disabledMessage}
                    </div>
                ) : (
                    <div className="reserve-messenger-composer-wrap">
                        {selection.kind === 'owner' && thread?.viewerRole === 'OWNER' && (
                            <details className="reserve-messenger-replies">
                                <summary>답변 문구</summary>
                                <p>직접 만든 안내 문구입니다. 수정 후 보내기를 눌러주세요.</p>
                                <div>
                                    {OWNER_REPLIES.map(reply => (
                                        <Button
                                            key={reply.label}
                                            variant="ghost-sm"
                                            size="sm"
                                            disabled={sending || draft.length + reply.text.length + (draft ? 1 : 0) > 2000}
                                            onClick={() => setDraft(selectionKey, draft ? `${draft}\n${reply.text}` : reply.text)}
                                        >{reply.label}</Button>
                                    ))}
                                </div>
                            </details>
                        )}
                        <ChatComposer value={draft} onChange={value => setDraft(selectionKey, value)} onSend={handleSend}
                            file={imageDraft.file} onFileChange={imageDraft.choose} imageEnabled={imageDraft.enabled}
                            sending={sending} disabled={loading || loadError} onCancel={cancelSend} />
                    </div>
                )}
            </section>}
            {!showThread && surface === 'page' && isWide && (
                <section className="reserve-messenger-thread reserve-messenger-thread-state" aria-label="대화 선택 안내">
                    <MessageOutlined aria-hidden="true" />
                    <span>왼쪽에서 확인할 대화를 선택하세요.</span>
                </section>
            )}
            {(!showThread || openingThread || returningToList) && !(surface === 'page' && isWide && showThread) && navigation}
        </div>
    );
};

MessengerContentBody.propTypes = {
    surface: PropTypes.oneOf(['page', 'panel']),
    initialStoreId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    coverImageSrc: PropTypes.string,
    onClose: PropTypes.func,
};

/** 고객지원 표시 이름·사진(관리자 › 채팅 관리 설정)을 메신저 전체(헤더·목록·홈·답변 말풍선)에 한 번만 내려준다. */
export default function MessengerContent(props) {
    const { intro: supportIntro } = useChatIntro('support');
    const supportIdentity = useMemo(() => ({
        name: supportIntro.displayName || SUPPORT_LABEL,
        avatarUrl: supportIntro.avatarUrl || null,
    }), [supportIntro.displayName, supportIntro.avatarUrl]);
    return (
        <SupportIdentityContext.Provider value={supportIdentity}>
            <MessengerContentBody {...props} />
        </SupportIdentityContext.Provider>
    );
}
MessengerContent.propTypes = MessengerContentBody.propTypes;
