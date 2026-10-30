/*
 * 발신자·시간 간격별 묶음에서 마지막 시각만 표시하며 전송 대기는 시각과 구분한다.
 */
import React from 'react';
import { colors, fontSize, radius } from '../../styles/tokens';
import { SupportAvatar, SupportName } from './SupportIdentity';
import ChatImage from './ChatImage';
import useChatPreferences from '../../hooks/useChatPreferences';
import ChatMessageActions from './ChatMessageActions';

/** 이보다 더 벌어지면 같은 사람이 보냈어도 새 덩어리로 본다. */
const GROUP_GAP_MS = 5 * 60 * 1000;

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

/**
 * @param {Array}  messages 시간순 메시지
 * @param {string} mine     내 메시지로 볼 senderRole ('MEMBER' | 'ADMIN')
 */
const ChatBubbleList = ({ messages, mine, roomId, onRetracted, onHidden = onRetracted, reportRole, searchMessageId }) => {
    const { palette } = useChatPreferences();
    const visibleMessages = messages.filter(message => !message.hidden);
    return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibleMessages.map((m, i) => {
            const isMine = m.senderRole === mine;
            const first = !inSameGroup(visibleMessages[i - 1], m);
            const last = !inSameGroup(m, visibleMessages[i + 1]);
            const timestamp = last ? formatTime(m.createdAt) : '';
            const ownTimestamp = m.pending ? '보내는 중' : timestamp;

            // 덩어리 첫 말풍선만 내 쪽(오른쪽)/상대 쪽(왼쪽) 윗모서리를 깎는다.
            let corner = null;
            if (first) corner = isMine ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 };
            // 덩어리 사이만 벌린다. 첫 줄 위에는 여백을 주지 않는다.
            let marginTop = first ? 10 : 2;
            if (i === 0) marginTop = 0;

            return (
                <div key={m.id} className="reserve-chat-message-row" data-message-id={m.id}
                    style={{
                        display: 'flex',
                        justifyContent: isMine ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end',
                        gap: 6,
                        marginTop,
                    }}>
                    {!isMine && m.senderRole === 'ADMIN' && <span className="reserve-chat-sender-avatar-slot">
                        {first && <SupportAvatar />}
                    </span>}
                    {isMine && <ChatMessageActions message={m} roomId={roomId} onRetracted={onRetracted} onHidden={onHidden}
                        timestamp={ownTimestamp} />}
                    <div className="reserve-chat-bubble-group" style={{ maxWidth: m.senderRole === 'ADMIN' && !isMine ? '72%' : '78%' }}>
                        {!isMine && m.senderRole === 'ADMIN' && first && <span className="reserve-chat-sender-name"><SupportName /></span>}
                        {m.imageUrl && <div className="reserve-chat-image-message" style={m.pending ? styles.bubblePending : undefined}>
                            <ChatImage url={m.imageUrl} roomId={roomId} width={m.imageWidth} height={m.imageHeight} />
                        </div>}
                        {(!m.imageUrl || m.content) && <div className="reserve-chat-message-bubble" style={{
                            ...styles.bubble,
                            ...(isMine ? { background: palette.background, color: palette.foreground } : styles.bubbleTheirs),
                            ...corner,
                            // 아직 서버가 받았는지 모르는 상태. 자리는 잡되 "확정 아님"이 보여야 한다.
                            ...(m.pending ? styles.bubblePending : null),
                            ...(m.retracted || m.expired ? { background: colors.background.subtle, color: colors.text.secondary, border: `1px solid ${colors.border.default}` } : null),
                            ...(m.id === searchMessageId ? { outline: '2px solid ' + colors.primary.main, outlineOffset: 2 } : null),
                        }}>
                            <span>{m.content}</span>
                        </div>}
                    </div>
                    {!isMine && <ChatMessageActions message={m} roomId={roomId} reportRole={reportRole} onHidden={onHidden}
                        timestamp={timestamp} />}
                </div>
            );
        })}
    </div>
);
};

const styles = {
    bubble: {
        padding: '9px 13px', borderRadius: radius.lg,
        fontSize: fontSize.sm, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    },
    bubbleTheirs: {
        background: colors.background.paper, color: colors.text.primary,
        border: `1px solid ${colors.border.light}`,
    },
    // 미확정 메시지는 색상을 유지하고 투명도로 구분한다.

    bubblePending: { opacity: 0.55 },
};

export default ChatBubbleList;
