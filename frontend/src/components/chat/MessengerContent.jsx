import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import MessengerFooter from './MessengerFooter';
import useChatIntro, { chatIntroScope } from '../../hooks/useChatIntro';
import { SUPPORT_LABEL, SupportIdentityContext, useSupportIdentity } from './messengerIdentity';
import ChatNotificationControl from './ChatNotificationControl';
import useChatImageDraft from '../../hooks/useChatImageDraft';
import useChatThread from '../../hooks/useChatThread';
import useChatNotifications from '../../hooks/useChatNotifications';
import { useMessage, useWindowWidth } from '../../hooks';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';
import { breakpoints } from '../../styles/tokens';
import {
    clearUnreadInInfiniteData,
    disabledMessageOf,
    footerViewOf,
    introVisibilityOf,
    matchesSelection,
    messengerLayoutOf,
    selectionKeyOf,
    supportFallback,
    threadCopyOf,
    useConversationLists,
    viewerRoleOf,
} from './messengerContentModel';
import {
    ConversationListPanel,
    MessengerCloseButton,
    MessengerHomeView,
    ThreadPanel,
    ThreadPlaceholder,
} from './MessengerContent.parts';

const POLL_THREAD_MS = 4000;
const THREAD_BACK_FALLBACK_MS = 320;
const EMPTY_HISTORY = { hasMore: false, nextBeforeId: null, loading: false };

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
    const inRoute = routeSelection !== null;
    const isHome = storedView === 'home' && !inRoute;
    const isSettings = storedView === 'settings' && !inRoute;
    const isConversations = !isHome && !isSettings;

    const lists = useConversationLists({ showHidden, canOwnStores, canAdminSupport });
    const { memberRows, ownerRows, adminRows, customerRows } = lists;
    const supportRow = memberRows.find((row) => row.type === 'SUPPORT') ?? supportFallback;
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
    const mobileThreadVisible = isConversations && (mobileThreadOpen || inRoute);
    const showThread = isConversations && ((isWide && activeThread) || mobileThreadVisible);
    const threadKey = showThread ? selectionKey : null;
    const imageDraft = useChatImageDraft(threadKey);
    const readScopeRef = useRef(null);
    const notificationTargetRef = useRef(null);
    const openNotifiedConversation = useCallback(roomId => {
        const target = notificationTargetRef.current;
        if (target?.roomId !== roomId
            || target.identity !== messengerIdentityOf(useAuthStore.getState())) return;
        if (routeSelection) void navigate('/messages', { replace: true });
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
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.adminInbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
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
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.adminInbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
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
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
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

    const currentHistory = history.key === selectionKey ? history : EMPTY_HISTORY;
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
        if (routeSelection) void navigate('/messages', { replace: true });
        select(next);
        setMobileThreadOpen(true);
        // 한 화면에 목록·대화가 같이 보이는 넓은 메시지 페이지는 자리만 바뀌므로 애니메이션이 없다.
        if (!(surface === 'page' && isWide)) setOpeningThread(true);
    };
    const finishConversationList = useCallback(() => {
        if (routeSelection) void navigate('/messages', { replace: true });
        showConversations();
        setMobileThreadOpen(false);
        setReturningToList(false);
    }, [navigate, routeSelection, showConversations]);
    const handleVisibilityChanged = () => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
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

    const { title, threadKind, emptyText } = threadCopyOf({
        selection, thread, selectedRow, supportName: supportIdentity.name,
    });
    // 첫 안내(인사말 + 자동 문답) — 고객지원은 관리자가, 가게 문의는 사장님이 설정한다(2026-09-23).
    const introScope = chatIntroScope(selection);
    const { intro } = useChatIntro(introScope, { enabled: Boolean(introScope) });
    const { showIntro, showStoreIntro } = introVisibilityOf({
        selection, thread, messageCount: messages.length, hasMoreHistory: currentHistory.hasMore,
    });
    // 답변이 없는 질문(관리자가 설정하기 전 기본 질문)만 입력칸에 채운다. 답변이 있으면 ChatIntro 가 바로 보여준다.
    const chooseIntroQuestion = (question) => {
        const state = useMessengerStore.getState();
        const current = state.drafts[selectionKey] ?? '';
        const next = current ? `${current}\n${question}` : question;
        if (!showIntro || sending || next.length > 2000) return;
        setDraft(selectionKey, next, state.sessionIdentity);
    };
    const changeDraft = value => setDraft(selectionKey, value);

    const handleFooterChange = value => {
        if (routeSelection) void navigate('/messages', { replace: true });
        setMobileThreadOpen(false);
        if (value === 'home') showHome();
        else if (value === 'settings') showSettings();
        else showConversations();
    };
    const navigation = (
        <MessengerFooter view={footerViewOf(isHome, isSettings)} disabled={openingThread || returningToList}
            onChange={handleFooterChange} />
    );
    const closeAction = <MessengerCloseButton surface={surface} onClose={onClose} />;
    const headingLevel = surface === 'page' ? 1 : 2;

    if (isHome || isSettings) {
        const notificationControl = isWide ? (
            <ChatNotificationControl state={notifications.state} onEnable={notifications.enable} onDisable={notifications.disable} />
        ) : null;
        const chooseFromHome = (next) => {
            if (next.kind === 'admin-inbox') {
                showConversations();
                setMobileThreadOpen(false);
                return;
            }
            choose(next);
        };
        return (
            <MessengerHomeView surface={surface} isSettings={isSettings} user={user}
                notificationControl={notificationControl} coverImageSrc={coverImageSrc}
                admin={canAdminSupport} onChoose={chooseFromHome}
                closeAction={closeAction} navigation={navigation} />
        );
    }

    const layout = messengerLayoutOf({
        surface, isWide, showThread, mobileThreadVisible, returningToList, openingThread,
    });
    const handleThreadAnimationEnd = event => {
        if (event.target !== event.currentTarget) return;
        if (returningToList) finishConversationList();
        else if (openingThread) setOpeningThread(false);
    };

    return (
        <div className={layout.className}>
            {closeAction}
            {layout.showList && (
                <ConversationListPanel headingLevel={headingLevel}
                    inert={openingThread || returningToList}
                    lists={lists} showHidden={showHidden}
                    onToggleHidden={() => setShowHidden(value => !value)}
                    canAdminSupport={canAdminSupport} canOwnStores={canOwnStores}
                    rowProps={{ showThread, selection, onChoose: choose }}
                    navigation={layout.showListNavigation && navigation} />
            )}

            {showThread && (
                <ThreadPanel
                    onAnimationEnd={handleThreadAnimationEnd}
                    onBack={showConversationList}
                    returningToList={returningToList}
                    avatarProps={{ selection, thread, selectedRow }}
                    title={title}
                    threadKind={threadKind}
                    moderationProps={{
                        thread,
                        onChanged: handleModerationChanged,
                        onHidden: handleVisibilityChanged,
                        hidden: showHidden && Boolean(selectedRow?.roomId),
                        pending: selection.kind !== 'admin' && (loading || !thread),
                        disabled: returningToList || loading,
                    }}
                    threadBodyRef={threadBodyRef}
                    isSupport={selection.kind === 'support'}
                    bodyProps={{
                        loading,
                        loadError,
                        onReload: reload,
                        emptyText,
                        intro: {
                            show: showIntro,
                            store: showStoreIntro,
                            userName: user?.name,
                            title,
                            supportName: supportIdentity.name,
                            content: intro,
                            onAsk: chooseIntroQuestion,
                            disabled: sending,
                            draftLength: draft.length,
                        },
                        messageProps: {
                            messages,
                            thread,
                            selection,
                            history: currentHistory,
                            onLoadOlder: loadOlderMessages,
                            onRetracted: updateMessage,
                        },
                    }}
                    composerAreaProps={{
                        closed: !loading && !loadError && thread?.canSend === false,
                        disabledMessage: disabledMessageOf(thread?.sendDisabledReason),
                        showOwnerReplies: selection.kind === 'owner' && thread?.viewerRole === 'OWNER',
                        draft,
                        sending,
                        onDraftChange: changeDraft,
                        composerProps: {
                            onSend: handleSend,
                            file: imageDraft.file,
                            onFileChange: imageDraft.choose,
                            imageEnabled: imageDraft.enabled,
                            imageLoading: imageDraft.loading,
                            disabled: loading || loadError,
                            onCancel: cancelSend,
                        },
                    }}
                />
            )}
            {layout.showPlaceholder && <ThreadPlaceholder />}
            {layout.showBottomNavigation && navigation}
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
