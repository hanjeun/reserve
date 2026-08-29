/**
 * 관리자 채팅 탭 (2026-08-24 신설) — 왼쪽 방 목록 / 오른쪽 대화.
 *
 * 목록 정렬은 서버가 정한다 — **안 읽은 방이 먼저, 그다음 최근 순.**
 * 단순히 최근 순이면 답을 기다리는 방이 활발한 방에 밀려 아래로 내려간다.
 *
 * 폴링은 **방을 열어둔 동안에만** 돈다. 목록은 사용자가 새로고침하거나 답장한 뒤에만 갱신한다 —
 * 목록까지 4초마다 돌리면 관리자 한 명이 서버를 계속 두드리게 된다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Typography, Pagination } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SendOutlined, MessageOutlined, LoadingOutlined } from '@ant-design/icons';
import { Button, UnreadPill, RefreshButton } from '../common';
import { Bone } from '../common/Skeletons';
import ChatBubbleList from '../chat/ChatBubbleList';
import useChatThread from '../../hooks/useChatThread';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { adminKeys } from '../../hooks/queryKeys';
import { useMessage, useWindowWidth } from '../../hooks';
import { colors, fontSize, fontWeight, radius, field } from '../../styles/tokens';

const { Text } = Typography;

const PAGE_SIZE = 20;
const POLL_MS = 4000;

const formatWhen = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d) / 60000);
    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`;
    return `${d.getMonth() + 1}. ${d.getDate()}`;
};

const RoomRow = ({ room, selected, onClick }) => (
    <button type="button" onClick={() => onClick(room)}
        className={`reserve-maillist-item${selected ? ' is-selected' : ''}`}
        style={styles.roomRow}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
            <Text style={styles.roomName}>{room.memberName || room.memberEmail}</Text>
            <Text style={styles.roomWhen}>{formatWhen(room.lastMessageAt)}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', marginTop: 2 }}>
            <Text style={styles.roomEmail}>{room.memberEmail}</Text>
            {/* 안 읽은 개수는 정렬 기준이기도 하다 — 숫자를 보여주면 왜 위에 있는지가 설명된다.
                탭 라벨의 배지와 **같은 컴포넌트**다(모양이 갈리면 같은 뜻인 줄 모른다). */}
            <UnreadPill count={room.adminUnread} />
        </div>
    </button>
);

const ChatTab = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const isMobile = useWindowWidth() < 768;

    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [draft, setDraft] = useState('');
    const bottomRef = useRef(null);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: [...adminKeys.chatRooms(), page],
        queryFn: () => api.get(API_ENDPOINTS.CHAT.ADMIN_ROOMS, { params: { page: page - 1 } }),
    });

    const rooms = data?.content ?? [];
    // Spring Boot 3.5 부터 페이지 메타가 page 하위로 내려갔다 — 신버전 우선, 구버전 폴백.
    const total = data?.page?.totalElements ?? data?.totalElements ?? 0;

    /*
     * 대화의 불러오기·폴링·전송은 useChatThread 가 맡는다 — 손님 패널(ChatLauncher)과 **같은 훅**이다.
     * 예전엔 두 화면이 각자 짜서 폴링 타이머 리셋·중복 붙임 버그가 양쪽에 똑같이 들어 있었다.
     *
     * 방을 바꿀 때 목록을 비우는 것도 훅이 한다(threadKey 가 바뀌면 렌더 도중 초기화) —
     * 이펙트에서 비우면 한 프레임 동안 **이전 방 내용이 새 방에 비친다.**
     */
    const roomIdSel = selected?.id ?? null;

    const load = useCallback(
        () => api.get(API_ENDPOINTS.CHAT.ADMIN_ROOM(roomIdSel))
            .then((list) => ({ roomId: roomIdSel, messages: list ?? [] })),
        [roomIdSel],
    );
    const poll = useCallback(
        (rid, afterId) => api.get(API_ENDPOINTS.CHAT.ADMIN_POLL(rid), { params: { afterId } }),
        [],
    );
    const sendFn = useCallback(
        (rid, content) => api.post(API_ENDPOINTS.CHAT.ADMIN_REPLY(rid), { content }),
        [],
    );
    /**
     * 방을 여는 것이 곧 읽음 처리다.
     *
     * ★ 2026-08-25 — 예전에는 무효화만 했다. 그러면 **서버 왕복이 끝나야** 숫자가 사라져서
     *   "눌렀는데 배지가 안 없어진다"로 보인다. 우리는 방금 읽었다는 걸 **이미 알고 있으므로**
     *   캐시를 먼저 내려놓고, 무효화는 그 값을 서버로 확인하는 역할만 시킨다.
     *
     *   0 으로 리셋하지 않고 **1만 깎는다** — 대기 수는 "안 읽은 방의 개수"라서
     *   다른 방이 남아 있으면 0 이 아니다. 그 방이 원래 안 읽음이었을 때만 깎는다
     *   (이미 읽은 방을 다시 열었다고 숫자가 줄면 안 된다).
     */
    const onLoaded = useCallback(() => {
        if (roomIdSel == null) return;

        let hadUnread = false;
        // 목록 캐시는 페이지별로 갈려 있다(키 끝에 page). 접두사로 전부 훑는다.
        queryClient.setQueriesData({ queryKey: adminKeys.chatRooms() }, (old) => {
            if (!old?.content) return old;
            let touched = false;
            const content = old.content.map((r) => {
                if (r.id !== roomIdSel || !(r.adminUnread > 0)) return r;
                hadUnread = true;
                touched = true;
                return { ...r, adminUnread: 0 };
            });
            return touched ? { ...old, content } : old;
        });

        if (hadUnread) {
            queryClient.setQueryData(adminKeys.chatWaiting(), (n) => Math.max(0, (n ?? 1) - 1));
        }

        // 확인용. 위에서 이미 화면이 맞춰졌으므로 이 응답이 늦어도 체감되지 않는다.
        queryClient.invalidateQueries({ queryKey: adminKeys.chatRooms() });
        queryClient.invalidateQueries({ queryKey: adminKeys.chatWaiting() });
    }, [queryClient, roomIdSel]);
    const onSent = useCallback(
        () => queryClient.invalidateQueries({ queryKey: adminKeys.chatRooms() }),
        [queryClient],
    );
    const onError = useCallback((msg) => message.error(msg), [message]);

    const { messages, sending, send } = useChatThread({
        threadKey: roomIdSel,
        myRole: 'ADMIN',
        load, poll, send: sendFn,
        onLoaded, onSent, onError,
        pollMs: POLL_MS,
    });

    const selectRoom = useCallback((room) => setSelected(room), []);


    useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

    const handleSend = async () => {
        const text = draft.trim();
        if (!text || !selected || sending) return;
        // 말풍선이 이미 떠 있는데 입력칸에도 같은 글이 남아 있으면 두 번 보낸 것처럼 보인다.
        setDraft('');
        const ok = await send(text);
        if (!ok) setDraft(text);
    };

    const conversation = (
        <div style={styles.thread}>
            {!selected ? (
                <div style={styles.emptyDetail}>
                    <MessageOutlined style={{ fontSize: 44, color: colors.border.default, marginBottom: 10 }} />
                    <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>
                        대화를 선택하면 내용이 표시됩니다.
                    </Text>
                </div>
            ) : (
                <>
                    <div style={styles.threadBody}>
                        {/* 손님 패널과 **같은 컴포넌트**다 — 두 화면이 같은 대화를 그리는데
                            각자 map 을 돌리면 한쪽만 고쳐지고 다른 쪽이 남는다.
                            다른 건 "내 말풍선이 어느 쪽인가" 하나뿐이라 그것만 넘긴다. */}
                        <ChatBubbleList messages={messages} mine="ADMIN" />
                        <div ref={bottomRef} />
                    </div>
                    <div style={styles.composer}>
                        {/* 손님 쪽 ChatLauncher 와 같은 구조 — 껍데기 하나가 테두리·모서리·포커스링을
                            갖고, 전송 버튼은 그 안에 들어간다. 두 화면의 입력칸이 달라 보이면
                            "같은 기능인데 왜 다르지"가 된다. */}
                        <div style={styles.composerShell} className="reserve-chat-composer">
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    // IME 조합 중(한글) Enter 는 확정이라 전송으로 보면 안 된다.
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="답장을 입력하세요 (Enter 전송 / Shift+Enter 줄바꿈)"
                                maxLength={2000}
                                rows={2}
                                style={styles.textarea}
                            />
                            {/* 전송 중에는 아이콘이 스피너로 바뀌고 버튼이 잠긴다.
                                손님 쪽 ChatLauncher 와 같은 규칙이다. */}
                            <button type="button" onClick={handleSend}
                                disabled={!draft.trim() || sending}
                                style={styles.sendBtn} className="reserve-chat-send"
                                aria-label={sending ? '보내는 중' : '보내기'} aria-busy={sending}>
                                {sending ? <LoadingOutlined /> : <SendOutlined />}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <RefreshButton onReload={refetch} loading={isFetching} />
            </div>

            {isLoading ? (
                <div style={styles.listPanel}>
                    {['s0', 's1', 's2'].map((k) => (
                        <div key={k} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border.light}` }}>
                            <Bone width="55%" height={13} />
                            <Bone width="75%" height={11} style={{ marginTop: 6 }} />
                        </div>
                    ))}
                </div>
            ) : rooms.length === 0 ? (
                <div style={styles.emptyPanel}>
                    <MessageOutlined style={{ fontSize: 52, color: colors.border.default, marginBottom: 14 }} />
                    <Text style={{ fontSize: fontSize.base, color: colors.text.secondary, display: 'block' }}>
                        아직 문의가 없습니다
                    </Text>
                </div>
            ) : isMobile ? (
                // 모바일은 한 화면에 둘을 못 넣는다 — 목록과 대화를 오간다.
                selected ? (
                    <>
                        <Button variant="ghost-sm" size="md" onClick={() => selectRoom(null)} style={{ marginBottom: 10 }}>
                            ← 목록으로
                        </Button>
                        {conversation}
                    </>
                ) : (
                    <>
                        <div style={styles.listPanel}>
                            {rooms.map((r) => (
                                <RoomRow key={r.id} room={r} selected={false} onClick={selectRoom} />
                            ))}
                        </div>
                        {total > PAGE_SIZE && (
                            <div style={styles.paginationBar}>
                                <Pagination current={page} pageSize={PAGE_SIZE} total={total}
                                    onChange={setPage} simple size="small" showSizeChanger={false} />
                            </div>
                        )}
                    </>
                )
            ) : (
                <div style={styles.splitPane}>
                    <div style={styles.listColumn}>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {rooms.map((r) => (
                                <RoomRow key={r.id} room={r} selected={r.id === selected?.id} onClick={selectRoom} />
                            ))}
                        </div>
                        {total > PAGE_SIZE && (
                            <div style={styles.paginationBar}>
                                <Pagination current={page} pageSize={PAGE_SIZE} total={total}
                                    onChange={setPage} size="small" showSizeChanger={false} showQuickJumper={false} />
                            </div>
                        )}
                    </div>
                    {conversation}
                </div>
            )}
        </div>
    );
};

const styles = {
    listPanel:   { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    emptyPanel:  { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, padding: '64px 20px', textAlign: 'center', background: colors.background.paper },
    splitPane:   { display: 'flex', height: 'calc(100vh - 280px)', minHeight: 420, maxHeight: 680, border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    listColumn:  { width: 300, flexShrink: 0, borderRight: `1px solid ${colors.border.light}`, display: 'flex', flexDirection: 'column', background: colors.background.subtle },
    /**
     * ★ background 를 인라인에 두지 않는다 (2026-08-24 수정).
     *
     * 여기엔 {@code .reserve-maillist-item} 클래스가 **같은 엘리먼트에** 붙는데,
     * 인라인 style 이 클래스를 이기므로 {@code background:'none'} 이 있으면
     * hover 도 선택 표시(연한 파란 배경)도 **화면에 전혀 안 나타난다.**
     * 실제로 선택된 방이 왼쪽 세로줄(::before, 인라인의 영향을 안 받는 가상요소)만 보이고
     * 배경은 하얗게 남아 있었다. 기본 배경은 클래스가 transparent 로 준다.
     *
     * 왼쪽 패딩은 16 — 위 스켈레톤(padding '14px 16px')과 같은 값이어야 로딩→완료 때
     * 글자가 옆으로 튀지 않는다. 예전 20 은 지금은 없앤 세로줄 자리를 비우려던 값이었다.
     */
    roomRow:     { width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '13px 16px', borderBottom: `1px solid ${colors.border.light}` },
    roomName:    { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    roomEmail:   { fontSize: fontSize.xs, color: colors.text.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    roomWhen:    { fontSize: fontSize.xs, color: colors.text.tertiary, flexShrink: 0 },
    thread:      { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper, minHeight: 360 },
    threadBody:  { flex: 1, overflowY: 'auto', padding: '18px 20px', background: colors.background.subtle },
    emptyDetail: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    composer:    { padding: 12, borderTop: `1px solid ${colors.border.light}`, background: colors.background.paper },
    // 껍데기가 곧 입력칸이다 — radius 는 field 토큰에서 온다(숫자를 두 번 적지 않는다).
    // border(:focus-within) 와 sendBtn 의 background(:hover) 는 index.css 가 갖는다 —
    // 인라인에 두면 인라인이 이겨서 상태 변화가 화면에 안 나타난다.
    composerShell: { display: 'flex', alignItems: 'flex-end', gap: 6, padding: 6, borderRadius: field.radius, background: colors.background.paper },
    textarea:    { flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', padding: '7px 4px 7px 8px', margin: 0, maxHeight: 120, overflowY: 'auto', fontSize: fontSize.sm, lineHeight: 1.5, fontFamily: 'inherit', color: colors.text.primary },
    sendBtn:     { flexShrink: 0, width: 34, height: 34, borderRadius: radius.md, border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    paginationBar: { display: 'flex', justifyContent: 'center', padding: '10px 8px', borderTop: `1px solid ${colors.border.light}` },
};

export default ChatTab;
