import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import MessengerFooter from './MessengerFooter';
import MessengerStoreSearch from './MessengerStoreSearch';
import useChatIntro, { chatIntroScope } from '../../hooks/useChatIntro';
import { SUPPORT_LABEL, SupportIdentityContext, useSupportIdentity } from './messengerIdentity';
import ChatNotificationControl from './ChatNotificationControl';
import useChatImageDraft from '../../hooks/useChatImageDraft';
import useChatThread from '../../hooks/useChatThread';
import useChatNotifications from '../../hooks/useChatNotifications';
import useChatRetentionNotice from '../../hooks/useChatRetentionNotice';
import { useMessage, useWindowWidth } from '../../hooks';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';
import { breakpoints } from '../../styles/tokens';
import { httpStatusOf } from '../../utils/listErrorMessage';
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
const STORE_OPEN_FAILURE_TITLES = {
    400: '이 가게에는 문의를 시작할 수 없어요.',
    401: '로그인 상태를 확인한 뒤 다시 문의해주세요.',
    403: '가게 문의를 시작할 권한이 없어요.',
    404: '가게를 찾을 수 없어요.',
    409: '현재 문의를 받을 수 없는 가게예요.',
    410: '현재 문의를 받을 수 없는 가게예요.',
};

const MessengerContentBody = ({ surface = 'page', initialStoreId = null, initialSelection = null, coverImageSrc, onClose }) => {
    // 고객지원 표시 이름·사진(채팅 관리 설정) — 제목 계산보다 먼저 읽는다.
    const supportIdentity = useSupportIdentity();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = useMessage();
    const user = useAuthStore((state) => state.user);
    const sessionIdentity = useMessengerStore((state) => state.sessionIdentity);
    const { visible: retentionNoticeVisible, dismiss: dismissRetentionNotice } = useChatRetentionNotice(user?.id, sessionIdentity);
    const storedSelection = useMessengerStore((state) => state.selection);
    const storedView = useMessengerStore((state) => state.view);
    const activeThread = useMessengerStore((state) => state.activeThread);
    const storeSearch = useMessengerStore((state) => state.storeSearch);
    const openStoreSearch = useMessengerStore((state) => state.openStoreSearch);
    const closeStoreSearch = useMessengerStore((state) => state.closeStoreSearch);
    const returnToStoreSearch = useMessengerStore((state) => state.returnToStoreSearch);
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
    const [storeOpenFailure, setStoreOpenFailure] = useState(null);
    const storeLoadRef = useRef(null);
    const searchFocusFrame = useRef(null);
    useEffect(() => () => cancelAnimationFrame(searchFocusFrame.current), []);
    const routeStoreId = Number(initialStoreId);
    const routeKind = initialSelection?.kind;
    const routeRoomId = initialSelection?.roomId;
    const selectedStoreId = initialSelection?.storeId;
    const routeSelection = useMemo(() => {
        if (routeKind === 'support') return { kind: 'support' };
        if (routeKind === 'owner' && canOwnStores && Number.isSafeInteger(routeRoomId) && routeRoomId > 0) return { kind: 'owner', roomId: routeRoomId };
        if (routeKind === 'store' && Number.isSafeInteger(selectedStoreId) && selectedStoreId > 0) return { kind: 'store', storeId: selectedStoreId };
        return Number.isSafeInteger(routeStoreId) && routeStoreId > 0 ? { kind: 'store', storeId: routeStoreId } : null;
    }, [routeKind, routeRoomId, selectedStoreId, canOwnStores, routeStoreId]);
    const selection = routeSelection ?? storedSelection;
    const inRoute = routeSelection !== null;
    const isHome = storedView === 'home' && !inRoute;
    const isSettings = storedView === 'settings' && !inRoute;
    const isStoreSearch = Boolean(storeSearch?.visible) && !inRoute;
    const isConversations = !isHome && !isSettings && !isStoreSearch;
    const searchBackAvailable = !inRoute && storeSearch && !storeSearch.visible && (storeSearch.selectedThreadKey
        ? storeSearch.selectedThreadKey === selectionKeyOf(selection) : selection.kind === 'store' && storeSearch.selectedStoreId === selection.storeId);

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
    const focusedMessageId = Number.isSafeInteger(selection.messageId) && selection.messageId > 0 ? selection.messageId : null;
    const threadKey = showThread ? selectionKey + (focusedMessageId ? ':message:' + focusedMessageId : '') : null;
    const imageDraft = useChatImageDraft(threadKey);
    const batchRef = useRef(null);
    const [batchScope, setBatchScope] = useState(null);
    const sendScope = `${sessionIdentity}:${threadKey}`;
    useLayoutEffect(() => () => { storeLoadRef.current = null; }, [sessionIdentity, threadKey]);
    useEffect(() => () => { batchRef.current = null; }, []);
    const readScopeRef = useRef(/** @type {{threadKey: string | null, identity: string, loading: boolean, roomId: number | null} | null} */ (null));
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
        if (focusedMessageId && Number.isSafeInteger(selection.roomId) && selection.roomId > 0)
            return chatService.getSearchContext(selection.roomId, focusedMessageId);
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
        if (selection.kind === 'store') {
            const request = { identity: sessionIdentity, key: `store:${selection.storeId}` };
            storeLoadRef.current = request;
            return chatService.getStore(selection.storeId).catch(error => {
                if (storeLoadRef.current === request && useMessengerStore.getState().sessionIdentity === request.identity) {
                    setStoreOpenFailure({ scope: `${request.identity}:${request.key}`, error,
                        title: STORE_OPEN_FAILURE_TITLES[httpStatusOf(error)] });
                }
                throw error;
            });
        }
        if (selection.kind === 'owner') return chatService.getStoreInboxRoom(selection.roomId);
        return chatService.getSupport();
    }, [selectedRow?.counterpartName, selectedRow?.counterpartProfileImage, selection.kind, selection.roomId, selection.storeId, sessionIdentity, focusedMessageId]);
    const poll = useCallback(
        (roomId, afterId) => focusedMessageId ? Promise.resolve([]) : selection.kind === 'admin'
            ? chatService.pollAdminSupportRoom(roomId, afterId)
            : chatService.pollRoom(roomId, afterId),
        [selection.kind, focusedMessageId],
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
        setHistory({
            key: selectionKey,
            hasMore: Boolean(loadedThread?.hasOlderMessages),
            nextBeforeId: loadedThread?.nextBeforeId ?? null,
            loading: false,
        });
        if (focusedMessageId) return;
        const readCount = selectedUnreadRef.current;
        selectedUnreadRef.current = 0;
        clearUnreadCaches(readCount);
    }, [clearUnreadCaches, selectionKey, focusedMessageId]);
    const onSent = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.inbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.adminInbox() });
        void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    }, [queryClient]);
    const onMessageSent = useCallback(() => {
        dismissRetentionNotice();
        onSent();
    }, [dismissRetentionNotice, onSent]);
    const onError = useCallback((text) => message.error(text), [message]);
    const onPolled = useCallback((roomId, fresh, { caughtUp = true, readThroughId } = {}) => {
        if (focusedMessageId) return false;
        const readScope = readScopeRef.current;
        if (!readScope || readScope.threadKey !== threadKey || readScope.loading || readScope.roomId !== roomId
            || readScope.identity !== messengerIdentityOf(useAuthStore.getState())) return;
        const viewerRole = viewerRoleOf(selection);
        if (isWide && notify({ roomId, messages: fresh, viewerRole })) {
            // OS에는 고정 익명 문구만 보내고, 클릭 대상은 현재 로그인 세션의 메모리에만 둔다.
            notificationTargetRef.current = {
                roomId, selection, identity: messengerIdentityOf(useAuthStore.getState()),
            };
        }
        if (!caughtUp || document.visibilityState !== 'visible' || !document.hasFocus()) return false;
        const markRead = viewerRole === 'ADMIN'
            ? chatService.markAdminSupportRead(roomId, readThroughId)
            : chatService.markRead(roomId, viewerRole, readThroughId);
        return markRead
            .then(() => {
                if (readScopeRef.current !== readScope || readScope.identity !== messengerIdentityOf(useAuthStore.getState())) return true;
                // 수신 커서 뒤에 도착한 메시지가 남을 수 있어 서버의 배지를 다시 조회한다.
                onSent();
                return true;
            })
            .catch(() => false); // 현재 수신 커서를 보관해 다음 성공 조회에서 다시 읽음 처리한다.
    }, [isWide, notify, onSent, selection, threadKey, focusedMessageId]);

    const {
        messages, thread, loading, loadError, sending: messageSending, send, reload, captureHistory, prepend, cancelSend, updateMessage,
    } = useChatThread({
        threadKey,
        myRole: viewerRoleOf(selection),
        load,
        poll,
        pollChanges: chatService.pollRetractions,
        cancellable: true,
        send: sendFn,
        onLoaded,
        onSent: onMessageSent,
        onChanged: onSent,
        onPolled,
        onError,
        pollMs: POLL_THREAD_MS,
    });
    const sending = messageSending || batchScope === sendScope;
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
    const focusedScrollRef = useRef(null);
    const historyScopeRef = useRef(/** @type {{threadKey: string | null, roomId: number | null} | null} */ (null));
    useLayoutEffect(() => {
        // 같은 방으로 돌아와도 이전 과거 조회·스크롤 상태는 재사용하지 않는다.
        const scope = { threadKey, roomId: thread?.roomId ?? null };
        historyScopeRef.current = scope;
        historyScrollRef.current = null;
        focusedScrollRef.current = null;
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
        if (focusedMessageId) {
            const target = body?.querySelector('[data-message-id="' + focusedMessageId + '"]');
            if (showThread && target && focusedScrollRef.current !== threadKey) {
                body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 2 + target.clientHeight / 2;
                focusedScrollRef.current = threadKey;
            }
            return;
        }
        if (showThread && body) body.scrollTop = body.scrollHeight;
    }, [messages, showThread, focusedMessageId, threadKey]);

    const currentHistory = history.key === selectionKey ? history : EMPTY_HISTORY;
    const loadOlderMessages = async () => {
        if (!thread?.roomId || !currentHistory.nextBeforeId || currentHistory.loading) return;
        const scope = historyScopeRef.current;
        if (!scope || scope.threadKey !== threadKey || scope.roomId !== thread.roomId) return;
        setHistory((state) => ({ ...state, loading: true }));
        try {
            // 조회 중 취소가 도착한 원문은 버리고 같은 페이지를 한 번만 다시 받는다.
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const snapshot = captureHistory();
                if (!snapshot) return;
                const result = await chatService.getHistory(
                    scope.roomId, currentHistory.nextBeforeId, 50);
                if (historyScopeRef.current !== scope) return;
                const body = threadBodyRef.current;
                const position = body ? { height: body.scrollHeight, top: body.scrollTop } : null;
                if (!prepend(result?.messages ?? [], snapshot)) continue;
                historyScrollRef.current = result?.messages?.length ? position : null;
                setHistory({
                    key: selectionKey,
                    hasMore: Boolean(result?.hasMore),
                    nextBeforeId: result?.nextBeforeId ?? null,
                    loading: false,
                });
                return;
            }
        } catch {
            if (historyScopeRef.current !== scope) return;
            historyScrollRef.current = null;
            message.error('이전 메시지를 불러오지 못했어요.');
        } finally {
            if (historyScopeRef.current === scope) {
                setHistory((state) => state.loading ? { ...state, loading: false } : state);
            }
        }
    };

    const choose = (next, { fromStoreSearch = false } = {}) => {
        if (returningToList || openingThread) return;
        if (routeSelection) navigate('/messages', { replace: true });
        select(next, { fromStoreSearch });
        setMobileThreadOpen(true);
        // 한 화면에 목록·대화가 같이 보이는 넓은 메시지 페이지는 자리만 바뀌므로 애니메이션이 없다.
        if (!(surface === 'page' && isWide)) setOpeningThread(true);
    };
    const leaveMessageContext = () => {
        const next = { ...selection };
        delete next.messageId;
        select(next, { fromStoreSearch: Boolean(searchBackAvailable) });
    };
    const finishConversationList = useCallback(() => {
        if (routeSelection) navigate('/messages', { replace: true });
        if (searchBackAvailable) returnToStoreSearch();
        else showConversations();
        setMobileThreadOpen(false);
        setReturningToList(false);
    }, [navigate, routeSelection, showConversations, searchBackAvailable, returnToStoreSearch]);
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
        const files = imageDraft.files;
        if ((!text && !files.length) || sending || batchRef.current?.scope === sendScope || thread?.canSend === false) return;
        const identity = useMessengerStore.getState().sessionIdentity;
        const batch = { scope: sendScope, cancelled: false };
        batchRef.current = batch;
        setBatchScope(sendScope);
        setDraft(selectionKey, '', identity);
        imageDraft.clear();
        try {
            // 사진별 멱등 키와 취소 경계를 유지한다.
            // 첫 사진에만 설명을 싣고 일부 실패 시 미전송 사진부터 복원한다.
            const queue = files.length ? files : [null];
            for (let index = 0; index < queue.length; index++) {
                if (batchRef.current !== batch || batch.cancelled || useMessengerStore.getState().sessionIdentity !== identity) return;
                const ok = await send(index === 0 ? text : '', queue[index]);
                if (ok !== true) {
                    if (ok === false) {
                        if (files.length) imageDraft.restore(files.slice(index));
                        // 늦은 실패로 새 초안이나 다른 계정의 입력을 덮지 않는다.
                        if (index === 0 && !useMessengerStore.getState().drafts[selectionKey]) setDraft(selectionKey, text, identity);
                    }
                    return;
                }
            }
        } finally {
            if (batchRef.current === batch) { batchRef.current = null; setBatchScope(null); }
        }
    };
    const handleCancelSend = () => {
        if (batchRef.current) batchRef.current.cancelled = true;
        cancelSend();
    };

    const { title, threadKind, emptyText } = threadCopyOf({
        selection, thread, selectedRow, supportName: supportIdentity.name,
    });
    // 고객지원·가게 문의의 첫 안내는 해당 관리 설정을 사용한다.
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

    const findStore = () => {
        if (openingThread || returningToList) return;
        if (routeSelection) navigate('/messages', { replace: true });
        setMobileThreadOpen(false);
        openStoreSearch();
    };
    const closeSearch = () => {
        const origin = storeSearch?.origin;
        closeStoreSearch();
        cancelAnimationFrame(searchFocusFrame.current);
        searchFocusFrame.current = requestAnimationFrame(() => {
            if (useMessengerStore.getState().sessionIdentity !== sessionIdentity) return;
            const selector = origin === 'home' ? '.reserve-messenger-footer [aria-label="홈"]' : '.reserve-messenger-list-actions [aria-label="채팅 검색"]';
            document.querySelector(selector)?.focus();
        });
    };

    const handleFooterChange = value => {
        if (routeSelection) navigate('/messages', { replace: true });
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

    const searchPanel = (inert = false, searchNavigation) => <MessengerStoreSearch search={storeSearch} memberId={user?.id}
        headingLevel={headingLevel} inert={inert} navigation={searchNavigation} onBack={closeSearch}
        onChoose={next => choose(next, { fromStoreSearch: true })} />;

    if (isStoreSearch) {
        return <div className={`reserve-messenger reserve-messenger--${surface} is-store-search`}>
            {closeAction}{searchPanel()}{navigation}
        </div>;
    }

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
                searchBackAvailable ? searchPanel(openingThread || returningToList, layout.showListNavigation && navigation)
                    : <ConversationListPanel headingLevel={headingLevel}
                    inert={openingThread || returningToList}
                    lists={lists} showHidden={showHidden}
                    onToggleHidden={() => setShowHidden(value => !value)}
                    onFindStore={findStore}
                    canAdminSupport={canAdminSupport} canOwnStores={canOwnStores}
                    rowProps={{ showThread, selection, onChoose: choose }}
                    navigation={layout.showListNavigation && navigation} />
            )}

            {showThread && (
                <ThreadPanel
                    onAnimationEnd={handleThreadAnimationEnd}
                    onBack={showConversationList}
                    backLabel={searchBackAvailable ? '검색 결과로 돌아가기' : undefined}
                    searchContext={focusedMessageId ? { onLatest: leaveMessageContext } : null}
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
                    retentionNoticeVisible={retentionNoticeVisible}
                    isSupport={selection.kind === 'support'}
                    bodyProps={{
                        loading,
                        loadError,
                        openError: storeOpenFailure?.scope === sendScope ? storeOpenFailure : null,
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
                            searchMessageId: focusedMessageId,
                            history: currentHistory,
                            onLoadOlder: loadOlderMessages,
                            onRetracted: updateMessage,
                        },
                    }}
                    composerAreaProps={{
                        closed: Boolean(focusedMessageId) || !loading && !loadError && thread?.canSend === false,
                        disabledMessage: focusedMessageId ? '최신 대화로 이동하면 답장할 수 있어요.' : disabledMessageOf(thread?.sendDisabledReason),
                        showOwnerReplies: selection.kind === 'owner' && thread?.viewerRole === 'OWNER',
                        draft,
                        sending,
                        onDraftChange: changeDraft,
                        composerProps: {
                            onSend: handleSend,
                            files: imageDraft.files,
                            onFilesChange: imageDraft.choose,
                            onRemoveFile: imageDraft.remove,
                            imageEnabled: imageDraft.enabled,
                            imageLoading: imageDraft.loading,
                            disabled: loading || loadError,
                            onCancel: handleCancelSend,
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
    initialSelection: PropTypes.shape({ kind: PropTypes.oneOf(['store', 'owner', 'support']).isRequired, storeId: PropTypes.number, roomId: PropTypes.number }),
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
