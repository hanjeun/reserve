import React, { useId, useLayoutEffect, useState } from 'react';
import { ArrowLeftOutlined, CloseOutlined, DownOutlined, MessageOutlined } from '../common/icons';
import { Bone, Button, DataState, Tooltip } from '../common';
import ConversationListSkeleton from './ConversationListSkeleton';
import SegmentedControl from '../common/SegmentedControl';
import MessengerThreadSkeleton from './MessengerThreadSkeleton';
import MessengerListHeading from './MessengerListHeading';
import MessengerHome from './MessengerHome';
import MessengerSettings from './MessengerSettings';
import ChatIntro from './ChatIntro';
import ConversationRow from './MessengerConversationRow';
import MessengerAvatar from './MessengerAvatar';
import { SupportAvatar } from './SupportIdentity';
import ChatBubbleList from './ChatBubbleList';
import ChatComposer from './ChatComposer';
import useMessengerStore from '../../store/useMessengerStore';
import ChatModerationMenu from './ChatModerationMenu';
import ChatRetentionNotice from './ChatRetentionNotice';
import { matchesSelection, viewerRoleOf } from './messengerContentModel';
import { filesFromTransfer, hasFileTransfer } from '../../utils/chatAttachments';

const OWNER_REPLIES = [
    { label: '인사', text: '안녕하세요. 문의해주셔서 감사해요. 확인 후 안내해드릴게요.' },
    { label: '방문 정보 확인', text: '원하시는 방문 날짜와 시간, 인원을 알려주시면 확인 후 안내해드릴게요.' },
    { label: '확인 중', text: '문의하신 내용을 확인하고 있어요. 확인이 끝나면 이 대화에서 안내해드릴게요.' },
];

// PC 패널의 X는 Shell이 제공한다. 모바일 페이지는 내부 화면과 무관하게 같은 닫기 관문을 쓴다.
export function MessengerCloseButton({ surface, onClose }) {
    if (surface !== 'page' || !onClose) return null;
    return (
        <button type="button" className="reserve-chat-close reserve-messenger-shell-close"
            onClick={onClose} aria-label="메시지 닫기">
            <CloseOutlined />
        </button>
    );
}

export function MessengerHomeView({
    surface, isSettings, user, notificationControl, coverImageSrc, admin, onChoose, closeAction, navigation,
}) {
    const headingLevel = surface === 'page' ? 1 : 2;
    return (
        <div className={`reserve-messenger reserve-messenger--${surface} is-home`}>
            {closeAction}
            {isSettings ? <MessengerSettings user={user} notificationControl={notificationControl} headingLevel={headingLevel} /> : <MessengerHome
                headingLevel={headingLevel}
                coverImageSrc={coverImageSrc}
                admin={admin}
                onChoose={onChoose}
            />}
            {navigation}
        </div>
    );
}

// 기존 데이터가 있으면 갱신 오류를 목록 위에 작게 표시한다.
function StaleListError({ query, rows, title }) {
    if (!query.isError || rows.length === 0) return null;
    return (
        <DataState state="error" kind="message"
            title={title}
            error={query.error}
            onRetry={query.refetch} retrying={query.isFetching} compact />
    );
}

function MoreButton({ query, more, children }) {
    if (!more) return null;
    return (
        <Button
            variant="ghost-sm-primary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
            style={{ margin: '10px 18px' }}
        >
            {children}
        </Button>
    );
}

function ListRows({ query, coldError, rows, subject, emptyText, children }) {
    if (coldError) {
        return (
            <DataState state="error" kind="message" subject={subject} error={query.error}
                onRetry={query.refetch} retrying={query.isFetching} />
        );
    }
    if (query.isLoading) return <ConversationListSkeleton />;
    if (rows.length === 0) {
        return emptyText ? <DataState state="empty" kind="message" title={emptyText} /> : null;
    }
    return children;
}

function AdminInboxSection({ query, rows, more, showThread, selection, onChoose }) {
    return (
        <section className="reserve-messenger-support-section" aria-label="고객지원 문의">
            <StaleListError query={query} rows={rows}
                title="목록을 새로 불러오지 못했어요. 이전 내용을 보여드려요." />
            <ListRows query={query} coldError={query.isError && rows.length === 0} rows={rows} subject="고객 문의" emptyText="아직 고객 문의가 없어요.">
                {rows.map((row) => (
                    <ConversationRow
                        key={`admin-${row.roomId}`}
                        row={row}
                        selected={showThread && matchesSelection(row, selection)}
                        onSelect={() => onChoose({ kind: 'admin', roomId: row.roomId })}
                    />
                ))}
            </ListRows>
            <MoreButton query={query} more={more}>고객 문의 더 보기</MoreButton>
        </section>
    );
}

function CustomerSection({ query, rows, customerRows, more, showHidden, hasHiddenNotification, showThread, selection, onChoose, onVisibilityChange, onLeave }) {
    return (
        <section aria-labelledby="reserve-my-conversations">
            <h2 id="reserve-my-conversations" className={`reserve-messenger-section-label${customerRows.length === 0 ? ' reserve-messenger-sr-only' : ''}`}>내 문의</h2>
            <StaleListError query={query} rows={rows}
                title="목록을 새로 불러오지 못했어요. 이전 내용을 보여드려요." />
            <ListRows query={query} coldError={query.isError && rows.length === 0} rows={customerRows} subject="대화 목록"
                emptyText={showHidden ? hasHiddenNotification ? null : '숨긴 대화가 없어요.' : '아직 문의한 내역이 없어요.'}>
                {customerRows.map((row) => (
                    <ConversationRow
                        key={row.type === 'SUPPORT' ? 'support' : `store-${row.storeId}`}
                        row={row}
                        owner={false}
                        hidden={showHidden}
                        onVisibilityChange={onVisibilityChange}
                        onLeave={onLeave}
                        selected={showThread && matchesSelection(row, selection)}
                        onSelect={() => onChoose(row.type === 'SUPPORT'
                            ? { kind: 'support' }
                            : { kind: 'store', storeId: row.storeId })}
                    />
                ))}
            </ListRows>
            <MoreButton query={query} more={more}>대화 더 보기</MoreButton>
        </section>
    );
}

function OwnerInboxSection({ query, rows, more, showHidden, showThread, selection, onChoose, onVisibilityChange, onLeave }) {
    return (
        <section aria-labelledby="reserve-store-inbox">
            <h2 id="reserve-store-inbox" className="reserve-messenger-section-label">손님 문의</h2>
            <StaleListError query={query} rows={rows}
                title="목록을 새로 불러오지 못했어요. 이전 내용을 보여드려요." />
            <ListRows query={query} coldError={query.isError && rows.length === 0} rows={rows} subject="손님 문의" emptyText="아직 손님 문의가 없어요.">
                {rows.map((row) => (
                    <ConversationRow
                        key={`owner-${row.roomId}`}
                        row={row}
                        owner
                        hidden={showHidden}
                        onVisibilityChange={onVisibilityChange}
                        onLeave={onLeave}
                        selected={showThread && matchesSelection(row, selection)}
                        onSelect={() => onChoose({ kind: 'owner', roomId: row.roomId })}
                    />
                ))}
            </ListRows>
            <MoreButton query={query} more={more}>문의 더 보기</MoreButton>
        </section>
    );
}

function matchingConversations(query, rows, unreadOnly, allRows = rows) {
    const visibleRows = unreadOnly ? rows.filter(row => row.unread > 0) : rows;
    // 일반 목록은 안 읽은 방을 먼저 보내므로 마지막이 읽은 방이면 더 조회할 필요가 없다.
    const more = query.hasNextPage && (!unreadOnly || allRows.at(-1)?.unread > 0);
    return { rows: visibleRows, more, hasSection: query.isLoading || query.isError || visibleRows.length > 0 || more };
}

function ConversationSections({ lists, canAdminSupport, canOwnStores, showHidden, notificationVisible, filter, rowProps }) {
    const { memberQuery, ownerQuery, adminQuery, memberRows, ownerRows, adminRows, customerRows } = lists;
    const unreadOnly = filter === 'unread';
    const member = matchingConversations(memberQuery, customerRows, unreadOnly, memberRows);
    const owner = matchingConversations(ownerQuery, ownerRows, unreadOnly);
    const admin = matchingConversations(adminQuery, adminRows, unreadOnly);
    const showMember = filter !== 'received' && (!unreadOnly || member.hasSection);
    const showAdmin = canAdminSupport && !showHidden && filter !== 'my' && (!unreadOnly || admin.hasSection);
    const showOwnerInbox = canOwnStores && filter !== 'my' && (filter === 'received' || owner.hasSection);
    if (unreadOnly && !showMember && !showAdmin && !showOwnerInbox && !notificationVisible) {
        return <DataState state="empty" kind="message" title="안 읽은 대화가 없어요." />;
    }
    return (
        <>
            {showAdmin && (
                <AdminInboxSection query={adminQuery} rows={admin.rows} more={admin.more} {...rowProps} />
            )}

            {showMember && <CustomerSection query={memberQuery} rows={memberRows} customerRows={member.rows} more={member.more}
                showHidden={showHidden} hasHiddenNotification={showHidden && notificationVisible} {...rowProps} />}

            {showOwnerInbox && (
                <OwnerInboxSection query={ownerQuery} rows={owner.rows} more={owner.more} showHidden={showHidden} {...rowProps} />
            )}
        </>
    );
}

export function ConversationListPanel({
    headingLevel, inert, lists, showHidden, onToggleHidden, onFindStore, canAdminSupport, canOwnStores,
    rowProps, notificationEntry, notificationVisible, navigation, filter, onFilterChange,
}) {
    const options = [
        { value: 'all', label: '전체' },
        { value: 'my', label: '내 문의' },
        ...(canOwnStores || canAdminSupport ? [{ value: 'received', label: '받은 문의' }] : []),
        { value: 'unread', label: '안 읽음' },
    ];
    return (
        <aside className="reserve-messenger-list" aria-label="대화 목록"
            inert={inert ? true : undefined}>
            <MessengerListHeading headingLevel={headingLevel}
                refreshing={lists.conversationListsFetching}
                onRefresh={lists.refreshConversationLists}
                showHidden={showHidden} onToggleHidden={onToggleHidden} onFindStore={onFindStore} />
            {!showHidden && <div className="reserve-messenger-list-filters">
                <SegmentedControl options={options} value={filter} onChange={onFilterChange} block={false} aria-label="대화 목록 필터" />
            </div>}

            <div className="reserve-messenger-list-scroll" aria-busy={lists.conversationListsLoading}>
                {notificationEntry}
                {lists.allConversationListsFailed ? (
                    <DataState state="error" kind="message" subject="대화 목록" error={lists.allConversationListsError}
                        onRetry={lists.refreshConversationLists} retrying={lists.conversationListsFetching} />
                ) : (
                    <ConversationSections lists={lists} canAdminSupport={canAdminSupport}
                        canOwnStores={canOwnStores} showHidden={showHidden} filter={filter}
                        notificationVisible={notificationVisible} rowProps={rowProps} />
                )}
            </div>
            {navigation}
        </aside>
    );
}

// 대화창 헤더 아바타: 고객지원 → 상대 사람(관리자·사업자 시점) → 가게 사진 → 기본 아이콘.
function ThreadAvatar({ selection, thread, selectedRow }) {
    if (selection.kind === 'support') return <SupportAvatar className="reserve-messenger-thread-avatar" />;
    if (selection.kind === 'admin' || selection.kind === 'owner') {
        return (
            <MessengerAvatar imageSrc={thread?.counterpartProfileImage ?? selectedRow?.counterpartProfileImage}
                variant="person" className="reserve-messenger-thread-avatar" />
        );
    }
    return <MessengerAvatar imageSrc={thread?.storeImageUrl || selectedRow?.storeImageUrl} variant="store" className="reserve-messenger-thread-avatar" />;
}

function ThreadMessages({ messages, thread, selection, history, onLoadOlder, onRetracted, emptyText, searchMessageId }) {
    return (
        <div>
            {history.hasMore && (
                <div className="reserve-messenger-history-action">
                    <Button
                        variant="ghost-sm-primary"
                        size="sm"
                        loading={history.loading}
                        onClick={onLoadOlder}
                    >
                        이전 메시지 보기
                    </Button>
                </div>
            )}
            <ChatBubbleList messages={messages} mine={thread?.viewerRole || viewerRoleOf(selection)}
                searchMessageId={searchMessageId}
                roomId={thread?.roomId} onRetracted={onRetracted} emptyText={emptyText}
                reportRole={thread?.type === 'STORE' ? thread.viewerRole : undefined} />
        </div>
    );
}

function ThreadIntro({ store, userName, title, supportName, content, onAsk, disabled, draftKey }) {
    const draftLength = useMessengerStore(state => state.drafts[draftKey]?.length ?? 0);
    return <ChatIntro variant={store ? 'store' : 'support'} userName={userName} displayName={store ? title : supportName}
        notice={content.notice ?? undefined} greeting={content.greeting ?? undefined} items={content.items}
        onAsk={onAsk} disabled={disabled} draftLength={draftLength} />;
}

function ThreadBody({ loading, loadError, openError, onReload, intro, emptyText, messageProps }) {
    if (loading) {
        return <MessengerThreadSkeleton />;
    }
    if (loadError) {
        return (
            <DataState state="error" kind="message" error={openError?.error} title={openError?.title || '대화를 불러오지 못했어요.'}
                onRetry={onReload} />
        );
    }
    if (intro.show) {
        return <ThreadIntro {...intro} />;
    }
    return <ThreadMessages {...messageProps} emptyText={emptyText} />;
}

function OwnerReplies({ draft, sending, onInsert }) {
    const [open, setOpen] = useState(false);
    const contentId = useId();
    return (
        <div className={`reserve-messenger-replies${open ? ' is-open' : ''}`}>
            <button type="button" className="reserve-messenger-replies-toggle"
                aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>
                <span>답변 문구</span>
                <DownOutlined className="reserve-messenger-replies-chevron" aria-hidden="true" />
            </button>
            <div id={contentId} className="reserve-messenger-replies-content"
                aria-hidden={!open} inert={!open ? true : undefined}>
                <div className="reserve-messenger-replies-inner">
                    <p>직접 만든 안내 문구예요. 수정 후 보내기를 눌러주세요.</p>
                    <div className="reserve-messenger-replies-options">
                        {OWNER_REPLIES.map(reply => (
                            <Button
                                key={reply.label}
                                variant="ghost-sm"
                                size="sm"
                                disabled={sending || draft.length + reply.text.length + (draft ? 1 : 0) > 2000}
                                onClick={() => onInsert(draft ? `${draft}\n${reply.text}` : reply.text)}
                            >{reply.label}</Button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ThreadComposerArea({ closed, disabledMessage, showOwnerReplies, draftKey, sending, onDraftChange, composerProps }) {
    const draft = useMessengerStore(state => closed ? '' : state.drafts[draftKey] ?? '');
    if (closed) {
        return (
            <output className="reserve-messenger-closed">
                {disabledMessage}
            </output>
        );
    }
    return (
        <div className="reserve-messenger-composer-wrap">
            {showOwnerReplies && (
                <OwnerReplies draft={draft} sending={sending} onInsert={onDraftChange} />
            )}
            <ChatComposer value={draft} onChange={onDraftChange} sending={sending} {...composerProps} />
        </div>
    );
}

export function ThreadPanel({
    onAnimationEnd, onBack, returningToList, avatarProps, title, threadKind, moderationProps,
    threadBodyRef, isSupport, bodyProps, composerAreaProps, retentionNoticeVisible = true, backLabel = '대화 목록으로 돌아가기', searchContext,
}) {
    const [fileOver, setFileOver] = useState(false);
    const { composerProps, closed, sending } = composerAreaProps;
    const canAttach = !closed && !sending && !composerProps.disabled && composerProps.imageEnabled
        && !composerProps.imageError && Boolean(composerProps.onStageFiles);
    const searchResult = Boolean(searchContext);
    useLayoutEffect(() => {
        const body = threadBodyRef.current;
        if (!body || searchResult || typeof ResizeObserver !== 'function') return undefined;
        let previousHeight = body.clientHeight;
        const observer = new ResizeObserver(() => {
            const height = body.clientHeight;
            if (height < previousHeight && body.scrollHeight - body.scrollTop <= previousHeight + 2) {
                body.scrollTop = body.scrollHeight;
            }
            previousHeight = height;
        });
        observer.observe(body);
        return () => observer.disconnect();
    }, [threadBodyRef, searchResult]);
    const dragOver = event => {
        if (!hasFileTransfer(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = canAttach ? 'copy' : 'none';
        setFileOver(canAttach);
    };
    const dragLeave = event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFileOver(false);
    };
    const drop = event => {
        const selected = filesFromTransfer(event.dataTransfer);
        if (!selected.length && !hasFileTransfer(event.dataTransfer)) return;
        event.preventDefault();
        setFileOver(false);
        if (canAttach && selected.length) composerProps.onStageFiles(selected);
    };
    return (
        <section className="reserve-messenger-thread" aria-labelledby="reserve-messenger-thread-title"
            onAnimationEnd={onAnimationEnd} data-file-over={fileOver && canAttach || undefined}
            onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
            <header className="reserve-messenger-thread-heading">
                <button
                    type="button"
                    className="reserve-messenger-mobile-back"
                    onClick={onBack}
                    disabled={returningToList}
                    aria-label={backLabel}
                >
                    <ArrowLeftOutlined />
                </button>
                <ThreadAvatar {...avatarProps} />
                <span className="reserve-messenger-thread-copy">
                    <strong id="reserve-messenger-thread-title">{title}</strong>
                    {!isSupport && <span>{threadKind}</span>}
                </span>
                <span className="reserve-messenger-thread-actions">
                    <ChatModerationMenu {...moderationProps} />
                </span>
            </header>

            {searchContext && <div className="reserve-messenger-search-context"><span>검색한 메시지</span>
                <Button variant="ghost-sm-primary" onClick={searchContext.onLatest}>최신 대화로 이동</Button></div>}
            <div ref={threadBodyRef} className={`reserve-messenger-thread-body${isSupport ? ' reserve-messenger-thread-body--support' : ''}`}>
                <ChatRetentionNotice visible={retentionNoticeVisible} />
                <ThreadBody {...bodyProps} />
            </div>

            <ThreadComposerArea {...composerAreaProps} />
        </section>
    );
}

export function ThreadPlaceholder() {
    return (
        <section className="reserve-messenger-thread reserve-messenger-thread-state" aria-label="대화 선택 안내">
            <MessageOutlined aria-hidden="true" />
            <span>왼쪽에서 확인할 대화를 선택하세요.</span>
        </section>
    );
}
