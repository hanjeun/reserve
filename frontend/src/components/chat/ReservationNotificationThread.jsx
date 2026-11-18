import { useEffect, useId, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftOutlined, BellOutlined } from '../common/icons';
import { Button, DataState } from '../common';
import TextLink from '../common/TextLink';
import MessengerThreadSkeleton from './MessengerThreadSkeleton';
import { chatListQueryPolicy } from './chatListQueryPolicy';
import { afterNotificationRead, chatUnreadCounts } from './chatUnread';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';
import { formatTime } from '../../utils/date';

const TITLE = 'RESERVE 알림';
const COPY = {
    APPROVED: '예약이 승인됐어요.',
    CHANGED: '예약이 변경됐어요.',
    CANCELLED: '예약이 취소됐어요.',
};
const EMPTY = [];
const sentAt = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });

export function ReservationNotificationEntry({ buttonRef, selected, onSelect, pollUnread }) {
    const { data } = useQuery({ queryKey: chatKeys.unread(), queryFn: chatService.getUnread,
        ...chatListQueryPolicy, enabled: pollUnread, staleTime: 30_000 });
    const { notifications: unread } = chatUnreadCounts(data);
    return <button type="button" ref={buttonRef} className={`reserve-messenger-row${selected ? ' is-selected' : ''}`}
        aria-current={selected ? 'true' : undefined} onClick={onSelect}>
        <span className="reserve-messenger-row-icon" aria-hidden="true"><BellOutlined /></span>
        <span className="reserve-messenger-row-copy">
            <span className="reserve-messenger-row-line"><strong>{TITLE}</strong></span>
            <span className="reserve-messenger-row-preview">예약 상태와 일정 안내</span>
        </span>
        {unread > 0 && <span className="reserve-messenger-unread" aria-label={`읽지 않은 알림 ${unread}개`}>{unread > 99 ? '99+' : unread}</span>}
    </button>;
}

ReservationNotificationEntry.propTypes = {
    buttonRef: PropTypes.object.isRequired,
    selected: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired,
    pollUnread: PropTypes.bool.isRequired,
};

function ReservationNotificationItem({ item, onOpenReservation }) {
    const reservationPath = item.ownerNotice ? `/business?tab=reservations&notification=${item.id}`
        : `/my-reservations?notification=${item.id}`;
    return <li className="reserve-messenger-notification-item">
        <div className="reserve-chat-message-bubble">
            <strong>{COPY[item.kind] ?? '예약 알림이 도착했어요.'}</strong>
            <span>{[item.storeName, item.reservationDate, formatTime(item.reservationTime)].filter(Boolean).join(' · ')}</span>
            <TextLink to={reservationPath} onClick={onOpenReservation}>예약 보기</TextLink>
        </div>
        <time className="reserve-chat-message-time" dateTime={item.createdAt}>{sentAt.format(new Date(item.createdAt))}</time>
    </li>;
}

ReservationNotificationItem.propTypes = {
    item: PropTypes.object.isRequired,
    onOpenReservation: PropTypes.func,
};

export default function ReservationNotificationThread({ onBack, onAnimationEnd, returningToList, onOpenReservation }) {
    const client = useQueryClient();
    const [before, setBefore] = useState(null);
    const attemptedRead = useRef(null);
    const heading = useRef(null);
    const scroll = useRef(null);
    const titleId = useId();
    const query = useQuery({
        queryKey: chatKeys.notifications(before),
        queryFn: ({ signal }) => chatService.getReservationNotifications(before, signal),
        staleTime: 15_000,
    });
    const items = query.data?.items ?? EMPTY;
    const unreadIds = useMemo(() => items.filter(item => !item.read).map(item => item.id), [items]);
    const { mutate, isPending: marking, isError: readFailed, variables } = useMutation({
        mutationFn: ({ ids }) => chatService.readReservationNotifications(ids),
        onSuccess: async (result, { cursor, ids }) => {
            client.setQueryData(chatKeys.notifications(cursor), page => page && ({
                ...page,
                items: page.items.map(item => ids.includes(item.id) ? { ...item, read: true } : item),
            }));
            await client.cancelQueries({ queryKey: chatKeys.unread(), exact: true });
            client.setQueryData(chatKeys.unread(), current => afterNotificationRead(current, result));
            void client.invalidateQueries({ queryKey: chatKeys.unread() }, { cancelRefetch: false });
        },
    });

    useEffect(() => { heading.current?.focus(); }, []);
    useEffect(() => {
        if (returningToList || !query.isSuccess || marking || !unreadIds.length) return undefined;
        const batch = unreadIds.join(',');
        const markVisiblePage = () => {
            if (document.hidden || attemptedRead.current === batch) return;
            attemptedRead.current = batch;
            mutate({ cursor: before, ids: unreadIds });
        };
        markVisiblePage();
        document.addEventListener('visibilitychange', markVisiblePage);
        return () => document.removeEventListener('visibilitychange', markVisiblePage);
    }, [before, marking, mutate, query.isSuccess, returningToList, unreadIds]);

    const showPage = cursor => {
        attemptedRead.current = null;
        setBefore(cursor);
        if (scroll.current) scroll.current.scrollTop = 0;
        heading.current?.focus();
    };
    const nextBefore = query.data?.nextBefore;
    const blockingError = isBlockingListReadError(query.error, items);

    return <section className="reserve-messenger-thread" aria-labelledby={titleId} onAnimationEnd={onAnimationEnd}>
        <header className="reserve-messenger-thread-heading">
            <button type="button" className="reserve-messenger-mobile-back" onClick={onBack} disabled={returningToList}
                aria-label="대화 목록으로 돌아가기"><ArrowLeftOutlined /></button>
            <span className="reserve-messenger-thread-avatar" aria-hidden="true"><BellOutlined /></span>
            <span className="reserve-messenger-thread-copy"><strong ref={heading} id={titleId} tabIndex={-1}>{TITLE}</strong></span>
        </header>
        <div className="reserve-messenger-thread-body" ref={scroll} aria-busy={query.isPending}>
            {query.isPending && <MessengerThreadSkeleton />}
            {query.isError && <DataState state="error" kind="notification" subject="알림" error={query.error}
                compact onRetry={query.refetch} retrying={query.isFetching} />}
            {before != null && <Button variant="ghost-sm" onClick={() => showPage(null)}>최신 알림</Button>}
            {query.isSuccess && !items.length && <DataState kind="notification" compact title="아직 받은 알림이 없어요." />}
            {readFailed && variables?.cursor === before && unreadIds.length > 0 && !blockingError && (
                <Button variant="ghost-sm" onClick={() => mutate({ cursor: before, ids: unreadIds })}>읽음 처리 다시 시도</Button>
            )}
            {!blockingError && items.length > 0 && <ul className="reserve-messenger-notification-list">
                {items.map(item => <ReservationNotificationItem key={item.id} item={item} onOpenReservation={onOpenReservation} />)}
            </ul>}
            {!blockingError && nextBefore != null && <Button variant="ghost-sm" onClick={() => showPage(nextBefore)}>이전 알림</Button>}
        </div>
    </section>;
}

ReservationNotificationThread.propTypes = {
    onBack: PropTypes.func.isRequired,
    onAnimationEnd: PropTypes.func.isRequired,
    returningToList: PropTypes.bool.isRequired,
    onOpenReservation: PropTypes.func,
};
