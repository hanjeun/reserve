import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { chatListQueryPolicy } from './chatListQueryPolicy';
import { listRows } from '../../utils/listResponse';
import { STORE_EMPTY_TEXT } from '../../hooks/useChatIntro';
import { conversationTitle, SUPPORT_LABEL } from './messengerIdentity';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';
import { messengerSelectionKey } from '../../utils/messengerSelection';

const contentOf = listRows;
const flattenPages = (data) => data?.pages?.flatMap(contentOf) ?? [];
const nextPage = (last, pages) => {
    const meta = last?.page;
    if (meta && meta.number + 1 < meta.totalPages) return meta.number + 1;
    if (last?.last === false) return pages.length;
    return undefined;
};

export const selectionKeyOf = (selection) => {
    return messengerSelectionKey(selection);
};

export const matchesSelection = (row, selection) => {
    if (selection?.kind === 'admin') {
        return (row.roomId ?? row.id) === selection.roomId
            && (row.viewerRole ?? 'ADMIN') === 'ADMIN';
    }
    if (selection?.kind === 'owner') return row.roomId === selection.roomId && row.viewerRole === 'OWNER';
    if (selection?.kind === 'store') return row.storeId === selection.storeId && row.viewerRole !== 'OWNER';
    return row.type === 'SUPPORT' && row.viewerRole === 'MEMBER';
};

export const viewerRoleOf = (selection) => {
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

export const clearUnreadInInfiniteData = (data, selection) => {
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

export const supportFallback = {
    roomId: null,
    type: 'SUPPORT',
    storeId: null,
    counterpartName: SUPPORT_LABEL,
    viewerRole: 'MEMBER',
    unread: 0,
    lastMessagePreview: null,
    lastMessageAt: null,
};

// 숨긴 대화 보기는 같은 목록 API에 hidden 플래그를 붙이고 캐시 키를 분리한다.
const listQueryKey = (baseKey, showHidden) => (showHidden ? [...baseKey, 'hidden'] : baseKey);
const listQueryFn = (method, showHidden) => ({ pageParam }) => (
    showHidden ? chatService[method](pageParam, true) : chatService[method](pageParam)
);

/**
 * 회원 대화 · 사업자 받은 문의 · 관리자 고객지원 목록 세 개를 함께 읽는다.
 * 한 계정이 회원·사업자·관리자 역할을 함께 가지면 세 목록을 동시에 읽는다.
 */
export function useConversationLists({ showHidden, canOwnStores, canAdminSupport }) {
    const adminEnabled = canAdminSupport && !showHidden;
    const memberQuery = useInfiniteQuery({
        queryKey: listQueryKey(chatKeys.conversations(), showHidden),
        queryFn: listQueryFn('listConversations', showHidden),
        initialPageParam: 0,
        getNextPageParam: nextPage,
        ...chatListQueryPolicy,
    });
    const ownerQuery = useInfiniteQuery({
        queryKey: listQueryKey(chatKeys.inbox(), showHidden),
        queryFn: listQueryFn('listStoreInbox', showHidden),
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
        enabled: adminEnabled,
        ...chatListQueryPolicy,
    });

    const memberRows = useMemo(() => flattenPages(memberQuery.data), [memberQuery.data]);
    const ownerRows = useMemo(() => flattenPages(ownerQuery.data), [ownerQuery.data]);
    const adminRows = useMemo(
        () => flattenPages(adminQuery.data).map(adminConversationRow),
        [adminQuery.data],
    );
    // 모든 목록의 연결 오류는 한 번의 안내·재시도로 묶는다.
    // 데이터가 있는 목록은 유지하고 각 섹션의 오류만 좁게 표시한다.
    const enabledConversationSources = [
        { enabled: true, query: memberQuery, rows: memberRows },
        { enabled: canOwnStores, query: ownerQuery, rows: ownerRows },
        { enabled: adminEnabled, query: adminQuery, rows: adminRows },
    ].filter((source) => source.enabled);
    const allConversationListsFailed = enabledConversationSources.length > 0
        && enabledConversationSources.every(({ query, rows }) => query.isError && rows.length === 0);
    const allConversationListsError = enabledConversationSources
        .find(({ query }) => query.isError)?.query.error;
    const conversationListsFetching = enabledConversationSources.some(({ query }) => query.isFetching);
    const conversationListsLoading = enabledConversationSources.some(({ query }) => query.isLoading);
    const refreshConversationLists = useCallback(() => {
        const requests = [memberQuery.refetch()];
        if (canOwnStores) requests.push(ownerQuery.refetch());
        if (canAdminSupport && !showHidden) requests.push(adminQuery.refetch());
        return Promise.all(requests);
    }, [adminQuery, canAdminSupport, canOwnStores, memberQuery, ownerQuery, showHidden]);
    // 관리자 계정은 같은 지원방을 상담원 목록과 개인 회원 목록에서 모두 받을 수 있다.
    // 방 ID가 같으면 상담원 시점 한 줄만 남겨 이름·읽음 기준이 섞이지 않게 한다.
    const customerRows = useMemo(() => {
        if (showHidden || !canAdminSupport || adminRows.length === 0) return memberRows;
        const administeredRoomIds = new Set(adminRows.map((row) => String(row.roomId)));
        return memberRows.filter((row) => !administeredRoomIds.has(String(row.roomId)));
    }, [adminRows, canAdminSupport, memberRows, showHidden]);

    return {
        memberQuery, ownerQuery, adminQuery,
        memberRows, ownerRows, adminRows, customerRows,
        allConversationListsFailed, allConversationListsError,
        conversationListsFetching, conversationListsLoading, refreshConversationLists,
    };
}

// 대화 종류(관리자 · 고객지원 · 사업자 · 가게 문의)별 제목/부제/빈 대화 문구.
export const threadCopyOf = ({ selection, thread, selectedRow, supportName }) => {
    if (selection.kind === 'admin') {
        return {
            title: thread?.title || selectedRow?.counterpartName || '고객 문의',
            threadKind: '고객 문의',
            emptyText: '회원의 문의에 답변할 수 있어요.',
        };
    }
    if (selection.kind === 'support') {
        return {
            title: supportName,
            threadKind: 'RESERVE 고객지원',
            emptyText: '서비스 이용에 관해 궁금한 점을 남겨주세요.',
        };
    }
    if (selection.kind === 'owner') {
        return {
            title: thread?.title || conversationTitle(selectedRow),
            threadKind: `${selectedRow?.storeName || '가게'} · 손님 문의`,
            emptyText: '아직 메시지가 없어요.',
        };
    }
    return {
        title: selectedRow?.storeName || thread?.title || conversationTitle(selectedRow),
        threadKind: '가게에 문의',
        emptyText: STORE_EMPTY_TEXT,
    };
};

// 첫 안내는 고객지원·가게의 관리 설정을 사용한다.
export const introVisibilityOf = ({ selection, thread, messageCount, hasMoreHistory }) => {
    const canShowIntro = thread?.viewerRole === 'MEMBER' && thread?.canSend === true
        && messageCount === 0 && !hasMoreHistory;
    const showSupportIntro = selection.kind === 'support' && thread?.type === 'SUPPORT'
        && thread?.roomId > 0 && canShowIntro;
    // 첫 대화에는 설정된 안내나 공통 기본값을 표시한다.
    const showStoreIntro = selection.kind === 'store' && canShowIntro;
    return { showIntro: showSupportIntro || showStoreIntro, showStoreIntro };
};

export const disabledMessageOf = (reason) => {
    if (reason === 'BLOCKED_BY_ME') return '내가 차단한 대화예요. 대화 관리에서 차단을 해제할 수 있어요.';
    if (reason === 'BLOCKED_BY_OTHER') return '상대방이 차단해 새 메시지를 보낼 수 없어요. 이전 대화는 계속 볼 수 있어요.';
    return '현재 운영 상태에서는 새 메시지를 보낼 수 없지만 이전 대화는 계속 볼 수 있어요.';
};

export const footerViewOf = (isHome, isSettings) => {
    if (isHome) return 'home';
    if (isSettings) return 'settings';
    return 'conversations';
};

/**
 * 목록 · 대화 · 하단 탭의 노출과 루트 className.
 * 한 화면에 목록·대화가 같이 보이는 넓은 메시지 페이지(splitPage)는 목록이 계속 보인다.
 */
export const messengerLayoutOf = ({ surface, isWide, showThread, mobileThreadVisible, returningToList, openingThread }) => {
    const splitPage = surface === 'page' && isWide;
    const transitioning = returningToList || openingThread;
    const className = `reserve-messenger reserve-messenger--${surface}${showThread ? ' has-thread' : ''}${mobileThreadVisible ? ' has-mobile-thread' : ''}${returningToList ? ' is-returning-to-list' : ''}${openingThread && !returningToList ? ' is-opening-thread' : ''}`;
    return {
        className,
        showList: !showThread || splitPage || transitioning,
        showListNavigation: splitPage && showThread,
        showPlaceholder: !showThread && splitPage,
        showBottomNavigation: (!showThread || transitioning) && !(splitPage && showThread),
    };
};
