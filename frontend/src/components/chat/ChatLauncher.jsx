/**
 * 인앱 채팅 런처 (2026-08-24 신설) — 우하단 플로팅 버튼 + 패널.
 *
 * ★ 폴링이지 WebSocket 이 아니다. 이유는 백엔드 ChatService 주석에 있다 —
 *   요약하면 블루/그린 배포마다 연결이 끊기고, 서버 메모리 여유가 600MB뿐이며,
 *   예약 플랫폼 문의는 실시간성이 낮다.
 *
 * ★ **패널이 닫혀 있을 때는 메시지 폴링을 하지 않는다.** 배지용 안 읽음 개수만
 *   훨씬 긴 주기로 확인한다. 닫힌 상태로도 5초마다 때리면 모든 접속자가 그렇게 한다.
 *
 * ★ 로그인한 사람에게만 보인다. 비로그인 문의는 기존 Inquiry(문의하기)가 담당한다 —
 *   대화는 "누구와의 대화인지"가 있어야 이어지는데, 비로그인은 그 축이 없다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { MessageOutlined, CloseOutlined, SendOutlined } from '@ant-design/icons';
import { Typography, Badge } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { chatKeys } from '../../hooks/queryKeys';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text } = Typography;

/** 패널이 열려 있을 때 새 메시지를 확인하는 주기. 사람이 답을 기다리는 체감 한계 근처다. */
const POLL_OPEN_MS = 4000;
/** 닫혀 있을 때 배지만 확인하는 주기. 여기를 짧게 잡으면 접속자 전원이 서버를 두드린다. */
const POLL_BADGE_MS = 60000;

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const Bubble = ({ msg }) => {
    const mine = msg.senderRole === 'MEMBER';
    return (
        <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'flex-end' }}>
            {mine && <Text style={styles.stamp}>{formatTime(msg.createdAt)}</Text>}
            <div style={{ ...styles.bubble, ...(mine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                {msg.content}
            </div>
            {!mine && <Text style={styles.stamp}>{formatTime(msg.createdAt)}</Text>}
        </div>
    );
};

const ChatLauncher = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const isLoggedIn = useAuthStore((s) => !!s.user);

    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [messages, setMessages] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const bottomRef = useRef(null);

    // 배지 — 닫혀 있어도 돌지만 주기가 길다.
    const { data: unread = 0 } = useQuery({
        queryKey: chatKeys.unread(),
        queryFn: () => api.get(API_ENDPOINTS.CHAT.MY_UNREAD),
        enabled: isLoggedIn,
        refetchInterval: open ? false : POLL_BADGE_MS,
    });

    // 패널을 열 때 방을 열고(없으면 생성) 최근 메시지를 받는다.
    // 이 호출이 곧 "읽음 처리"다 — 별도 API 를 두면 화면이 그걸 부르는 걸 잊는 순간
    // 배지가 영영 안 사라진다.
    useEffect(() => {
        if (!open || !isLoggedIn) return;
        let cancelled = false;
        api.get(API_ENDPOINTS.CHAT.MY)
            .then((data) => {
                if (cancelled) return;
                setRoomId(data?.roomId ?? null);
                setMessages(data?.messages ?? []);
                queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
            })
            .catch(() => { if (!cancelled) message.error('대화를 불러오지 못했습니다.'); });
        return () => { cancelled = true; };
    }, [open, isLoggedIn, queryClient, message]);

    // 증분 폴링 — 마지막으로 받은 id 뒤에 온 것만. 대화가 길어져도 폴링 비용이 늘지 않는다.
    useEffect(() => {
        if (!open || !roomId) return;
        const tick = () => {
            const afterId = messages.length ? messages[messages.length - 1].id : 0;
            api.get(API_ENDPOINTS.CHAT.MY_MESSAGES, { params: { roomId, afterId } })
                .then((fresh) => {
                    if (!fresh?.length) return;
                    setMessages((prev) => [...prev, ...fresh]);
                })
                .catch(() => { /* 폴링 실패는 조용히 넘긴다 — 다음 주기에 다시 시도한다 */ });
        };
        const timer = setInterval(tick, POLL_OPEN_MS);
        return () => clearInterval(timer);
    }, [open, roomId, messages]);

    // 새 메시지가 오면 아래로. 채팅은 항상 끝을 보고 있어야 한다.
    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, open]);

    const sendMutation = useMutation({
        mutationFn: (content) => api.post(API_ENDPOINTS.CHAT.MY_SEND, { content }),
        onSuccess: (sent) => {
            // 서버가 돌려준 것을 그대로 붙인다 — 낙관적 추가를 하면 id·시각이 임시값이라
            // 바로 뒤에 도는 증분 폴링이 같은 메시지를 한 번 더 붙인다.
            setMessages((prev) => [...prev, sent]);
            setDraft('');
        },
        onError: () => message.error('전송하지 못했습니다.'),
    });

    const handleSend = () => {
        const text = draft.trim();
        if (!text || sendMutation.isPending) return;
        sendMutation.mutate(text);
    };

    if (!isLoggedIn) return null;

    return (
        <>
            {open && (
                <div style={styles.panel} className="reserve-chat-panel">
                    <div style={styles.header}>
                        <div>
                            <Text style={styles.headerTitle}>문의하기</Text>
                            <Text style={styles.headerSub}>보통 하루 안에 답변드려요</Text>
                        </div>
                        <button type="button" onClick={() => setOpen(false)}
                            style={styles.iconBtn} aria-label="닫기">
                            <CloseOutlined />
                        </button>
                    </div>

                    <div style={styles.body}>
                        {messages.length === 0 ? (
                            <div style={styles.empty}>
                                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>
                                    궁금한 점을 남겨주세요.
                                </Text>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {messages.map((m) => <Bubble key={m.id} msg={m} />)}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div style={styles.composer}>
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                // Enter 전송 / Shift+Enter 줄바꿈 — 채팅의 관습이다.
                                // IME 조합 중(한글)에는 Enter 가 확정이므로 무시해야 한다.
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="메시지를 입력하세요"
                            maxLength={2000}
                            rows={2}
                            style={styles.textarea}
                        />
                        <button type="button" onClick={handleSend}
                            disabled={!draft.trim() || sendMutation.isPending}
                            style={styles.sendBtn} aria-label="보내기">
                            <SendOutlined />
                        </button>
                    </div>
                </div>
            )}

            <Badge count={open ? 0 : unread} offset={[-6, 6]}>
                <button type="button" onClick={() => setOpen((v) => !v)}
                    style={styles.launcher} className="reserve-chat-launcher"
                    aria-label={open ? '문의 닫기' : '문의하기'}>
                    {open ? <CloseOutlined /> : <MessageOutlined />}
                </button>
            </Badge>
        </>
    );
};

const styles = {
    // 런처는 Badge 로 감싸므로 위치는 Badge 래퍼가 아니라 이 버튼이 갖는다.
    launcher: {
        position: 'fixed', right: 20, bottom: 20, zIndex: 1000,
        width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: colors.primary.main, color: '#fff', fontSize: 20,
        boxShadow: '0 6px 20px rgba(49,130,246,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    panel: {
        position: 'fixed', right: 20, bottom: 84, zIndex: 1000,
        width: 340, maxWidth: 'calc(100vw - 40px)', height: 460, maxHeight: 'calc(100vh - 140px)',
        background: colors.background.paper, border: `1px solid ${colors.border.default}`,
        borderRadius: radius.lg, boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
    header: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${colors.border.light}`,
    },
    headerTitle: { display: 'block', fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text.primary },
    headerSub: { display: 'block', fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2 },
    iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: colors.text.tertiary, padding: 4 },
    body: { flex: 1, overflowY: 'auto', padding: '14px 16px', background: colors.background.subtle },
    empty: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    bubble: {
        maxWidth: '78%', padding: '8px 12px', borderRadius: radius.md,
        fontSize: fontSize.sm, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    },
    bubbleMine: { background: colors.primary.main, color: '#fff', borderBottomRightRadius: 4 },
    bubbleTheirs: { background: colors.background.paper, color: colors.text.primary, borderBottomLeftRadius: 4, border: `1px solid ${colors.border.light}` },
    stamp: { fontSize: 10, color: colors.text.tertiary, flexShrink: 0 },
    composer: { display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${colors.border.light}`, alignItems: 'flex-end' },
    textarea: {
        flex: 1, resize: 'none', border: `1px solid ${colors.border.default}`, borderRadius: radius.md,
        padding: '8px 10px', fontSize: fontSize.sm, fontFamily: 'inherit', outline: 'none',
        background: colors.background.paper, color: colors.text.primary,
    },
    sendBtn: {
        flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: colors.primary.main, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
};

export default ChatLauncher;
