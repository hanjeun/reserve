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
 *
 * ── 2026-08-24 2차 수정 ────────────────────────────────────────────────────
 * ★ 여는/닫는 애니메이션. 1차 때 className 만 써놓고 index.css 에 대응 규칙을
 *   안 넣어서 창이 그냥 뿅 나타났다 사라졌다. 애니메이션은 CSS 가 그리고,
 *   여기서는 **DOM 에 언제까지 남길지**만 정한다(open / visible 두 상태).
 * ★ 모서리를 둥근 네모로 통일. 입력칸은 field 토큰(높이·radius 의 단일 출처)을 따르고,
 *   전송 버튼은 입력 껍데기 **안쪽**으로 넣었다 — 밖에 따로 떠 있으면
 *   "이 버튼이 이 입력칸의 것"이라는 게 안 읽힌다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageOutlined, CloseOutlined, SendOutlined, LoadingOutlined } from '@ant-design/icons';
import { Typography, Badge } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { chatKeys } from '../../hooks/queryKeys';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import useChatThread from '../../hooks/useChatThread';
import ChatBubbleList from './ChatBubbleList';
import { colors, fontSize, fontWeight, radius, field } from '../../styles/tokens';

const { Text } = Typography;

/** 패널이 열려 있을 때 새 메시지를 확인하는 주기. 사람이 답을 기다리는 체감 한계 근처다. */
const POLL_OPEN_MS = 4000;
/** 닫혀 있을 때 배지만 확인하는 주기. 여기를 짧게 잡으면 접속자 전원이 서버를 두드린다. */
const POLL_BADGE_MS = 60000;

const ChatLauncher = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const isLoggedIn = useAuthStore((s) => !!s.user);

    /**
     * 상태가 둘인 이유 — `open` 은 "열려 있는가"(폴링·배지의 기준),
     * `visible` 은 "DOM 에 있는가"다.
     *
     * 하나로 합치면 닫는 순간 패널이 즉시 사라져서 **닫는 애니메이션을 보여줄 대상이 없다.**
     * 그래서 닫을 때는 open 만 먼저 내리고(= is-closing 클래스가 붙어 축소 애니메이션 시작),
     * 애니메이션이 끝났다는 신호(onAnimationEnd)를 받은 뒤에 visible 을 내린다.
     * setTimeout 으로 시간을 재지 않는 이유는 CSS 의 duration 을 JS 가 또 알고 있어야 하고
     * 둘이 어긋나면 잘리거나 남기 때문이다.
     */
    const [open, setOpen] = useState(false);
    const [visible, setVisible] = useState(false);

    const [draft, setDraft] = useState('');
    const bottomRef = useRef(null);

    const openPanel = () => { setVisible(true); setOpen(true); };
    const closePanel = () => setOpen(false);
    const togglePanel = () => (open ? closePanel() : openPanel());

    // 배지 — 닫혀 있어도 돌지만 주기가 길다.
    const { data: unread = 0 } = useQuery({
        queryKey: chatKeys.unread(),
        queryFn: () => api.get(API_ENDPOINTS.CHAT.MY_UNREAD),
        enabled: isLoggedIn,
        refetchInterval: open ? false : POLL_BADGE_MS,
    });

    /*
     * 대화의 불러오기·폴링·전송은 전부 useChatThread 가 맡는다.
     * 관리자 탭(ChatTab)과 **같은 훅**이다 — 예전엔 두 화면이 각자 짜서
     * 폴링 타이머 리셋과 중복 붙임 버그가 양쪽에 똑같이 들어 있었다.
     * 세 함수는 useCallback 으로 고정한다. 매 렌더 새 함수를 넘기면 훅 안의
     * 이펙트가 매번 다시 돌아 타이머가 또 리셋된다 — 고치려던 그 버그로 되돌아간다.
     */
    const load = useCallback(
        () => api.get(API_ENDPOINTS.CHAT.MY)
            .then((d) => ({ roomId: d?.roomId ?? null, messages: d?.messages ?? [] })),
        [],
    );
    const poll = useCallback(
        (rid, afterId) => api.get(API_ENDPOINTS.CHAT.MY_MESSAGES, { params: { roomId: rid, afterId } }),
        [],
    );
    const sendFn = useCallback(
        (_rid, content) => api.post(API_ENDPOINTS.CHAT.MY_SEND, { content }),
        [],
    );
    /**
     * 불러오기 = 읽음 처리다.
     *
     * ★ 2026-08-25 — 무효화만 하면 서버 왕복이 끝나야 배지가 사라져서 늦게 느껴진다.
     *   방금 읽었다는 걸 이미 아니까 **캐시를 먼저 0 으로** 두고, 무효화는 확인만 시킨다.
     *   손님은 방이 하나뿐이라 0 이 정확한 값이다(관리자 쪽은 방이 여럿이라 1만 깎는다).
     */
    const onLoaded = useCallback(() => {
        queryClient.setQueryData(chatKeys.unread(), 0);
        queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    }, [queryClient]);
    const onError = useCallback((msg) => message.error(msg), [message]);

    const { messages, sending, send } = useChatThread({
        // 패널이 닫히면 null → 폴링이 멈추고 목록도 비워진다.
        threadKey: open && isLoggedIn ? 'my' : null,
        myRole: 'MEMBER',
        load, poll, send: sendFn,
        onLoaded, onError,
        pollMs: POLL_OPEN_MS,
    });

    // 새 메시지가 오면 아래로. 채팅은 항상 끝을 보고 있어야 한다.
    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, open]);

    const handleSend = async () => {
        const text = draft.trim();
        if (!text || sending) return;
        // 낙관적으로 먼저 비운다 — 말풍선이 이미 떠 있는데 입력칸에도 같은 글이 남아 있으면
        // 두 번 보낸 것처럼 보인다. 실패하면 그대로 되돌린다.
        setDraft('');
        const ok = await send(text);
        if (!ok) setDraft(text);
    };

    /**
     * 닫는 애니메이션이 끝나면 DOM 에서 내린다.
     *
     * `e.target === e.currentTarget` 검사가 필요한 이유 — 패널 **안쪽** 요소의 애니메이션
     * (예: 스켈레톤 shimmer)도 여기까지 버블링된다. 그걸 걸러내지 않으면
     * 열려 있는 도중에 패널이 사라진다.
     */
    const handleAnimationEnd = (e) => {
        if (e.target === e.currentTarget && !open) setVisible(false);
    };

    if (!isLoggedIn) return null;

    return (
        <>
            {visible && (
                <div style={styles.panel}
                    className={`reserve-chat-panel${open ? '' : ' is-closing'}`}
                    onAnimationEnd={handleAnimationEnd}>
                    <div style={styles.header}>
                        <div>
                            <Text style={styles.headerTitle}>문의하기</Text>
                            <Text style={styles.headerSub}>보통 하루 안에 답변드려요</Text>
                        </div>
                        <button type="button" onClick={closePanel}
                            style={styles.iconBtn} className="reserve-chat-close" aria-label="닫기">
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
                            <ChatBubbleList messages={messages} mine="MEMBER" />
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div style={styles.composer}>
                        {/* 입력칸과 전송 버튼을 한 껍데기 안에 둔다 — 포커스 표시도 껍데기가 받는다. */}
                        <div style={styles.composerShell} className="reserve-chat-composer">
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
                                rows={1}
                                style={styles.textarea}
                            />
                            {/* 전송 중에는 아이콘이 스피너로 바뀌고 버튼이 잠긴다.
                                입력칸은 잠그지 않는다 — 보내는 동안 다음 문장을 이어 쓰는 게 자연스럽고,
                                실제로 막히는 건 전송뿐이다. */}
                            <button type="button" onClick={handleSend}
                                disabled={!draft.trim() || sending}
                                style={styles.sendBtn} className="reserve-chat-send"
                                aria-label={sending ? '보내는 중' : '보내기'} aria-busy={sending}>
                                {sending ? <LoadingOutlined /> : <SendOutlined />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Badge count={open ? 0 : unread} offset={[-8, 8]}>
                <button type="button" onClick={togglePanel}
                    style={styles.launcher}
                    className={`reserve-chat-launcher${open ? ' is-open' : ''}`}
                    aria-label={open ? '문의 닫기' : '문의하기'} aria-expanded={open}>
                    {open ? <CloseOutlined /> : <MessageOutlined />}
                </button>
            </Badge>
        </>
    );
};

const styles = {
    // 런처는 Badge 로 감싸므로 위치는 Badge 래퍼가 아니라 이 버튼이 갖는다.
    // 원형(50%)이 아니라 둥근 네모다 — 서비스의 다른 모든 면과 같은 모서리 언어를 쓴다.
    // ⚠️ background / boxShadow 가 여기 없는 건 실수가 아니다 — 둘 다 :hover 에서 바뀌므로
    //    index.css 의 .reserve-chat-launcher 가 갖는다. 인라인에 두면 인라인이 이겨서
    //    hover 가 죽는다(2026-08-24 브라우저 실측으로 확인).
    launcher: {
        position: 'fixed', right: 20, bottom: 20, zIndex: 1000,
        width: 56, height: 56, borderRadius: radius['2xl'], border: 'none', cursor: 'pointer',
        color: '#fff', fontSize: 21,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    panel: {
        position: 'fixed', right: 20, bottom: 88, zIndex: 1000,
        width: 348, maxWidth: 'calc(100vw - 40px)', height: 470, maxHeight: 'calc(100vh - 148px)',
        background: colors.background.paper, border: `1px solid ${colors.border.default}`,
        borderRadius: radius['2xl'], boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
    header: {
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '14px 14px 14px 18px', borderBottom: `1px solid ${colors.border.light}`,
    },
    headerTitle: { display: 'block', fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text.primary },
    headerSub: { display: 'block', fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2 },
    // 색·배경은 .reserve-chat-close 가 갖는다 — 모달 X 버튼과 같은 규칙(회색 hover, 파랑 없음).
    // hover 에서 바뀌는 값이라 인라인에 둘 수 없다.
    iconBtn: {
        border: 'none', cursor: 'pointer', padding: 0,
        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    body: { flex: 1, overflowY: 'auto', padding: '14px 16px', background: colors.background.subtle },
    empty: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    composer: { padding: 12, borderTop: `1px solid ${colors.border.light}`, background: colors.background.paper },
    // 껍데기가 곧 입력칸이다 — 테두리·모서리·포커스링을 여기가 갖고, 안의 textarea 는 투명하다.
    // radius 를 리터럴로 적지 않는 이유는 field 토큰 주석에 있다(값이 흩어지면 반드시 어긋난다).
    composerShell: {
        display: 'flex', alignItems: 'flex-end', gap: 6, padding: 6,
        borderRadius: field.radius,          // 상태와 무관 → 토큰에서 그대로
        background: colors.background.paper, // 상태와 무관
        // border 는 :focus-within 에서 색이 바뀌므로 .reserve-chat-composer 가 갖는다.
    },
    textarea: {
        flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
        padding: '7px 4px 7px 8px', margin: 0, maxHeight: 96, overflowY: 'auto',
        fontSize: fontSize.sm, lineHeight: 1.5, fontFamily: 'inherit', color: colors.text.primary,
    },
    // 전송 버튼도 둥근 네모. 껍데기 안쪽에 있어서 "이 입력칸의 버튼"으로 읽힌다.
    // background 는 .reserve-chat-send 가 갖는다 — hover/disabled 에서 바뀐다.
    sendBtn: {
        flexShrink: 0, width: 34, height: 34, borderRadius: radius.md, border: 'none', cursor: 'pointer',
        color: '#fff', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
};

export default ChatLauncher;
