import React from 'react';
import { ArrowLeftOutlined, CloseOutlined, DownOutlined, MessageOutlined } from '@ant-design/icons';
import { Bone, Button, DataState } from '../common';
import ConversationListSkeleton from './ConversationListSkeleton';
import MessengerListHeading from './MessengerListHeading';
import MessengerHome from './MessengerHome';
import MessengerSettings from './MessengerSettings';
import ChatIntro from './ChatIntro';
import ConversationRow from './MessengerConversationRow';
import MessengerAvatar from './MessengerAvatar';
import { SupportAvatar } from './SupportIdentity';
import ChatBubbleList from './ChatBubbleList';
import ChatComposer from './ChatComposer';
import ChatModerationMenu from './ChatModerationMenu';
import { matchesSelection, viewerRoleOf } from './messengerContentModel';

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

// 이전 데이터가 있는데 최신 조회만 실패하면 목록 위에 compact 상태를 보인다.
function StaleListError({ query, rows, title }) {
    if (!query.isError || rows.length === 0) return null;
    return (
        <DataState state="error" kind="message"
            title={title}
            onRetry={query.refetch} retrying={query.isFetching} compact />
    );
}

function MoreButton({ query, children }) {
    if (!query.hasNextPage) return null;
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

// 목록 섹션 본문: 실패 → 로딩 → 빈 목록 → 목록 순으로 판정한다.
function ListRows({ query, coldError, rows, subject, emptyText, children }) {
    if (coldError) {
        return (
            <DataState state="error" kind="message" subject={subject} error={query.error}
                onRetry={query.refetch} retrying={query.isFetching} />
        );
    }
    if (query.isLoading) return <ConversationListSkeleton />;
    if (rows.length === 0) {
        return <DataState state="empty" kind="message" title={emptyText} />;
    }
    return children;
}

function AdminInboxSection({ query, rows, showThread, selection, onChoose }) {
    return (
        <section className="reserve-messenger-support-section" aria-label="고객지원 문의">
            <StaleListError query={query} rows={rows}
                title="최신 고객 문의를 확인하지 못해 이전 목록을 보여드리고 있어요." />
            <ListRows query={query} coldError={query.isError && rows.length === 0} rows={rows} subject="고객 문의" emptyText="아직 접수된 고객 문의가 없어요.">
                {rows.map((row) => (
                    <ConversationRow
                        key={`admin-${row.roomId}`}
                        row={row}
                        selected={showThread && matchesSelection(row, selection)}
                        onSelect={() => onChoose({ kind: 'admin', roomId: row.roomId })}
                    />
                ))}
            </ListRows>
            <MoreButton query={query}>고객 문의 더 보기</MoreButton>
        </section>
    );
}

function CustomerSection({ query, rows, customerRows, showHidden, showThread, selection, onChoose }) {
    return (
        <section aria-labelledby="reserve-my-conversations">
            <h2 id="reserve-my-conversations" className={`reserve-messenger-section-label${customerRows.length === 0 ? ' reserve-messenger-sr-only' : ''}`}>내 대화</h2>
            <StaleListError query={query} rows={rows}
                title="최신 대화를 확인하지 못해 이전 목록을 보여드리고 있어요." />
            <ListRows query={query} coldError={query.isError && rows.length === 0} rows={customerRows} subject="대화 목록"
                emptyText={showHidden ? '숨긴 대화가 없어요.' : '아직 시작한 대화가 없어요.'}>
                {customerRows.map((row) => (
                    <ConversationRow
                        key={row.type === 'SUPPORT' ? 'support' : `store-${row.storeId}`}
                        row={row}
                        owner={false}
                        selected={showThread && matchesSelection(row, selection)}
                        onSelect={() => onChoose(row.type === 'SUPPORT'
                            ? { kind: 'support' }
                            : { kind: 'store', storeId: row.storeId })}
                    />
                ))}
            </ListRows>
            <MoreButton query={query}>대화 더 보기</MoreButton>
        </section>
    );
}

function OwnerInboxSection({ query, rows, showThread, selection, onChoose }) {
    return (
        <section aria-labelledby="reserve-store-inbox">
            <h2 id="reserve-store-inbox" className="reserve-messenger-section-label">가게 받은 문의</h2>
            <StaleListError query={query} rows={rows}
                title="최신 받은 문의를 확인하지 못해 이전 목록을 보여드리고 있어요." />
            <ListRows query={query} coldError={query.isError && rows.length === 0} rows={rows} subject="받은 문의" emptyText="아직 받은 가게 문의가 없어요.">
                {rows.map((row) => (
                    <ConversationRow
                        key={`owner-${row.roomId}`}
                        row={row}
                        owner
                        selected={showThread && matchesSelection(row, selection)}
                        onSelect={() => onChoose({ kind: 'owner', roomId: row.roomId })}
                    />
                ))}
            </ListRows>
            <MoreButton query={query}>받은 문의 더 보기</MoreButton>
        </section>
    );
}

function ConversationSections({ lists, canAdminSupport, canOwnStores, showHidden, rowProps }) {
    const { memberQuery, ownerQuery, adminQuery, memberRows, ownerRows, adminRows, customerRows } = lists;
    const showOwnerInbox = canOwnStores && (ownerQuery.isLoading || ownerQuery.isError || ownerRows.length > 0);
    return (
        <>
            {canAdminSupport && !showHidden && (
                <AdminInboxSection query={adminQuery} rows={adminRows} {...rowProps} />
            )}

            <CustomerSection query={memberQuery} rows={memberRows} customerRows={customerRows}
                showHidden={showHidden} {...rowProps} />

            {showOwnerInbox && (
                <OwnerInboxSection query={ownerQuery} rows={ownerRows} {...rowProps} />
            )}
        </>
    );
}

export function ConversationListPanel({
    headingLevel, inert, lists, showHidden, onToggleHidden, canAdminSupport, canOwnStores, rowProps, navigation,
}) {
    return (
        <aside className="reserve-messenger-list" aria-label="대화 목록"
            inert={inert ? true : undefined}>
            <MessengerListHeading headingLevel={headingLevel}
                refreshing={lists.conversationListsFetching}
                onRefresh={lists.refreshConversationLists}
                showHidden={showHidden} onToggleHidden={onToggleHidden} />

            <div className="reserve-messenger-list-scroll" aria-busy={lists.conversationListsLoading}>
                {lists.allConversationListsFailed ? (
                    <DataState state="error" kind="message" subject="대화 목록" error={lists.allConversationListsError}
                        onRetry={lists.refreshConversationLists} retrying={lists.conversationListsFetching} />
                ) : (
                    <ConversationSections lists={lists} canAdminSupport={canAdminSupport}
                        canOwnStores={canOwnStores} showHidden={showHidden} rowProps={rowProps} />
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
    if (selection.kind === 'store' && (thread?.storeImageUrl || selectedRow?.storeImageUrl)) {
        return <MessengerAvatar imageSrc={thread?.storeImageUrl || selectedRow?.storeImageUrl} variant="store" className="reserve-messenger-thread-avatar" />;
    }
    return <span className="reserve-messenger-thread-avatar" aria-hidden="true"><MessageOutlined /></span>;
}

function ThreadMessages({ messages, thread, selection, history, onLoadOlder, onRetracted }) {
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
                roomId={thread?.roomId} onRetracted={onRetracted}
                reportRole={thread?.type === 'STORE' ? thread.viewerRole : undefined} />
        </div>
    );
}

// 대화 본문: 로딩 → 실패 → 첫 안내 → 빈 대화 → 메시지 순으로 판정한다.
function ThreadBody({ loading, loadError, onReload, intro, emptyText, messageProps }) {
    if (loading) {
        return (
            <output className="reserve-messenger-thread-skeleton" aria-label="대화를 불러오는 중" aria-busy="true">
                <div aria-hidden="true"><Bone width="65%" height={44} borderRadius={14} /><Bone width="50%" height={44} borderRadius={14} style={{ marginLeft: 'auto' }} /><Bone width="75%" height={44} borderRadius={14} /></div>
            </output>
        );
    }
    if (loadError) {
        return (
            <DataState state="error" kind="message" title="대화를 불러오지 못했어요."
                onRetry={onReload} />
        );
    }
    if (intro.show) {
        return (
            <ChatIntro variant={intro.store ? 'store' : 'support'} userName={intro.userName}
                displayName={intro.store ? intro.title : intro.supportName}
                notice={intro.content.notice ?? undefined} greeting={intro.content.greeting ?? undefined} items={intro.content.items}
                onAsk={intro.onAsk} disabled={intro.disabled} draftLength={intro.draftLength} />
        );
    }
    if (messageProps.messages.length === 0) {
        return (
            <DataState state="empty" kind="message" title={emptyText} />
        );
    }
    return <ThreadMessages {...messageProps} />;
}

function OwnerReplies({ draft, sending, onInsert }) {
    return (
        <details className="reserve-messenger-replies">
            <summary>
                <span>답변 문구</span>
                <DownOutlined className="reserve-messenger-replies-chevron" aria-hidden="true" />
            </summary>
            <div className="reserve-messenger-replies-content">
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
        </details>
    );
}

function ThreadComposerArea({ closed, disabledMessage, showOwnerReplies, draft, sending, onDraftChange, composerProps }) {
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
    threadBodyRef, isSupport, bodyProps, composerAreaProps,
}) {
    return (
        <section className="reserve-messenger-thread" aria-labelledby="reserve-messenger-thread-title"
            onAnimationEnd={onAnimationEnd}>
            <header className="reserve-messenger-thread-heading">
                <button
                    type="button"
                    className="reserve-messenger-mobile-back"
                    onClick={onBack}
                    disabled={returningToList}
                    aria-label="대화 목록으로 돌아가기"
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

            <div ref={threadBodyRef} className={`reserve-messenger-thread-body${isSupport ? ' reserve-messenger-thread-body--support' : ''}`}>
                <p className="reserve-chat-retention-notice">
                    일반 글·사진은 90일 보관해요. 신고·분쟁 자료는 별도 보관하며,
                    정책 고지 후 30일 유예를 거쳐 적용해요. <a href="/privacy" target="_blank" rel="noopener noreferrer">보관 정책 보기</a>
                </p>
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
