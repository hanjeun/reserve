/*
 * 발신자·시간 간격별 묶음에서 마지막 시각만 표시하며 전송 대기는 시각과 구분한다.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { colors, fontSize, radius } from '../../styles/tokens';
import { SupportAvatar, SupportName } from './SupportIdentity';
import ChatImage from './ChatImage';
import useChatPreferences from '../../hooks/useChatPreferences';
import ChatMessageActions from './ChatMessageActions';
import useChatMessageHold from './useChatMessageHold';
import useReducedMotion from '../../hooks/useReducedMotion';
import DataState from '../common/DataState';

/** 이보다 더 벌어지면 같은 사람이 보냈어도 새 덩어리로 본다. */
const GROUP_GAP_MS = 5 * 60 * 1000;
const NO_ATTACHMENTS = [];

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 두 메시지가 한 덩어리인가 — 같은 사람이 짧은 간격으로 보냈는가. */
const inSameGroup = (a, b) => {
    if (!a || !b || a.senderRole !== b.senderRole) return false;
    const gap = Math.abs(new Date(b.createdAt) - new Date(a.createdAt));
    return Number.isFinite(gap) && gap < GROUP_GAP_MS;
};

const attachmentBatch = message => message?.imageUrl
    && /^photos_([a-f0-9-]{32,36})_[0-2]$/i.exec(message.clientMessageId)?.[1];

function packAttachments(messages) {
    const rows = [];
    let index = 0;
    for (const message of messages) {
        if (message.hidden) {
            rows.push({ message });
            continue;
        }
        const previous = rows.at(-1);
        const batch = attachmentBatch(message);
        if (batch && !message.content && previous?.batch === batch && previous.attachments.length < 2
                && inSameGroup(previous.message, message)) previous.attachments = [...previous.attachments, message];
        else rows.push({ message, batch, index, attachments: NO_ATTACHMENTS });
        index += 1;
    }
    return rows;
}

function PhotoSurface({ message, roomId }) {
    return <div className="reserve-chat-image-message" style={message.pending ? styles.bubblePending : undefined}>
        <ChatImage url={message.imageUrl} thumbnailUrl={message.imageThumbnailUrl} roomId={roomId}
            width={message.imageWidth} height={message.imageHeight} compact />
    </div>;
}

const MessageRow = memo(function MessageRow({
    message, attachments, isMine, first, last, atStart, searchMessageId, palette, roomId, reportRole, onRetracted, onHidden,
}) {
    const { id, senderRole, content, createdAt, localSendId, pending, imageUrl, retracted, expired } = message;
    const timestamp = last ? formatTime(attachments.at(-1)?.createdAt || createdAt) : '';
    const supportReply = senderRole === 'ADMIN' && !isMine;
    const corner = first && (isMine ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 });
    const marginTop = atStart ? 0 : first ? 10 : 2;
    return (
        <div className="reserve-chat-message-row" data-message-id={id}
            style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6, marginTop }}>
            {supportReply && <span className="reserve-chat-sender-avatar-slot">
                {first && <SupportAvatar />}
            </span>}
            {isMine && <ChatMessageActions message={message} roomId={roomId} onRetracted={onRetracted} onHidden={onHidden}
                timestamp={pending ? '보내는 중' : timestamp} />}
            <div className={'reserve-chat-bubble-group' + (isMine && localSendId ? ' reserve-chat-bubble-group--sent' : '')
                + (imageUrl ? ' has-photos' : '') + (isMine ? ' is-mine' : '')}
                style={{ maxWidth: supportReply ? '72%' : '78%' }}>
                {supportReply && first && <span className="reserve-chat-sender-name"><SupportName /></span>}
                {(!imageUrl || content) && <div className="reserve-chat-message-bubble" style={{
                    ...styles.bubble,
                    ...(isMine ? { background: palette.background, color: palette.foreground } : styles.bubbleTheirs),
                    ...corner,
                    ...(pending ? styles.bubblePending : null),
                    ...(retracted || expired ? styles.bubbleUnavailable : null),
                    ...(id === searchMessageId ? styles.bubbleHighlighted : null),
                }}><span>{content}</span></div>}
                {imageUrl && <div className="reserve-chat-photo-group" style={id === searchMessageId && !content ? styles.bubbleHighlighted : undefined}>
                    <PhotoSurface message={message} roomId={roomId} />
                    {attachments.map(photo => <div key={photo.id} data-message-id={photo.id}
                        className="reserve-chat-message-row reserve-chat-secondary-photo"
                        style={photo.id === searchMessageId ? styles.bubbleHighlighted : undefined}>
                        <PhotoSurface message={photo} roomId={roomId} />
                        <ChatMessageActions message={photo} roomId={roomId} onRetracted={isMine ? onRetracted : undefined}
                            onHidden={onHidden} reportRole={isMine ? undefined : reportRole} />
                    </div>)}
                </div>}
            </div>
            {!isMine && <ChatMessageActions message={message} roomId={roomId} reportRole={reportRole} onHidden={onHidden}
                timestamp={timestamp} />}
        </div>
    );
});

/**
 * @param {Array}  messages 시간순 메시지
 * @param {string} mine     내 메시지로 볼 senderRole ('MEMBER' | 'ADMIN')
 */
const ChatBubbleList = ({ messages, mine, roomId, onRetracted, onHidden = onRetracted, reportRole, searchMessageId, emptyText }) => {
    const { palette } = useChatPreferences();
    const holdHandlers = useChatMessageHold(roomId);
    const reducedMotion = useReducedMotion();
    const list = useRef(null);
    const timers = useRef(new Map());
    const [exits, setExits] = useState(new Map());
    const [exitRoom, setExitRoom] = useState(roomId);
    if (exitRoom !== roomId) {
        setExitRoom(roomId);
        setExits(new Map());
    }
    useEffect(() => {
        const active = timers.current;
        return () => {
            for (const timer of active.values()) clearTimeout(timer);
            active.clear();
        };
    }, [roomId]);
    const endExit = useCallback(id => {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        setExits(previous => {
            if (!previous.has(id)) return previous;
            const next = new Map(previous);
            next.delete(id);
            return next;
        });
    }, []);
    const hideMessage = useCallback(message => {
        if (!reducedMotion && message.hidden && Number.isSafeInteger(message.id)) {
            const row = list.current?.querySelector(`[data-message-id="${message.id}"]`);
            const height = row?.getBoundingClientRect().height;
            if (height > 0) {
                // 삭제한 본문 대신 이전 행의 공간만 접어요.
                const size = { roomId, height, marginTop: row.style.marginTop };
                setExits(previous => new Map(previous).set(message.id, size));
                clearTimeout(timers.current.get(message.id));
                timers.current.set(message.id, setTimeout(() => endExit(message.id), 240));
            }
        }
        onHidden(message);
    }, [endExit, onHidden, reducedMotion, roomId]);
    const visibleMessages = messages.filter(message => !message.hidden);
    const exitSize = message => {
        const size = exits.get(message.id);
        return !reducedMotion && size?.roomId === roomId ? size : null;
    };
    if (emptyText !== undefined && !visibleMessages.length && !messages.some(exitSize)) return <DataState state="empty" kind="message" title={emptyText} />;
    return (
    <div ref={list} {...holdHandlers} style={{ display: 'flex', flexDirection: 'column' }}>
        {packAttachments(messages).map(({ message: m, attachments, index }) => {
            if (m.hidden) {
                const size = exitSize(m);
                return size ? <div key={m.localSendId ? `send:${m.localSendId}` : m.id}
                    className="reserve-chat-message-exit" aria-hidden="true"
                    style={{ height: size.height, marginTop: size.marginTop }} onAnimationEnd={() => endExit(m.id)} /> : null;
            }
            const next = index + attachments.length + 1;
            const isMine = m.senderRole === mine;
            const key = isMine && m.localSendId ? `send:${m.localSendId}` : m.id;
            return <MessageRow key={key} message={m} attachments={attachments} isMine={isMine} atStart={index === 0}
                first={!inSameGroup(visibleMessages[index - 1], m)} last={!inSameGroup(visibleMessages[next - 1], visibleMessages[next])}
                searchMessageId={searchMessageId} palette={palette} roomId={roomId} reportRole={reportRole}
                onRetracted={onRetracted} onHidden={onHidden && hideMessage} />;
        })}
    </div>
);
};

const styles = {
    bubble: {
        padding: '9px 13px',
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        borderBottomLeftRadius: radius.lg,
        borderBottomRightRadius: radius.lg,
        fontSize: fontSize.sm, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    },
    bubbleTheirs: {
        background: colors.background.paper, color: colors.text.primary,
        border: `1px solid ${colors.border.light}`,
    },
    // 미확정 메시지는 색상을 유지하고 투명도로 구분한다.

    bubblePending: { opacity: 0.55 },
    bubbleUnavailable: { background: colors.background.subtle, color: colors.text.secondary, border: `1px solid ${colors.border.default}` },
    bubbleHighlighted: { outline: '2px solid ' + colors.primary.main, outlineOffset: 2 },
};

export default memo(ChatBubbleList);
