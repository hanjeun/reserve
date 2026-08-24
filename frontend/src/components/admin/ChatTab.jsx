/**
 * 관리자 채팅 탭 (2026-08-24 신설) — 왼쪽 방 목록 / 오른쪽 대화.
 *
 * 목록 정렬은 서버가 정한다 — **안 읽은 방이 먼저, 그다음 최근 순.**
 * 단순히 최근 순이면 답을 기다리는 방이 활발한 방에 밀려 아래로 내려간다.
 *
 * 폴링은 **방을 열어둔 동안에만** 돈다. 목록은 사용자가 새로고침하거나 답장한 뒤에만 갱신한다 —
 * 목록까지 4초마다 돌리면 관리자 한 명이 서버를 계속 두드리게 된다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Typography, Pagination } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SendOutlined, MessageOutlined, SyncOutlined } from '@ant-design/icons';
import { Button } from '../common';
import { Bone } from '../common/Skeletons';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { adminKeys } from '../../hooks/queryKeys';
import { useMessage, useWindowWidth } from '../../hooks';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

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

const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
            {/* 안 읽은 개수는 정렬 기준이기도 하다 — 숫자를 보여주면 왜 위에 있는지가 설명된다. */}
            {room.adminUnread > 0 && <span style={styles.unreadDot}>{room.adminUnread}</span>}
        </div>
    </button>
);

const ChatTab = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const isMobile = useWindowWidth() < 768;

    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState('');
    const bottomRef = useRef(null);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: [...adminKeys.chatRooms(), page],
        queryFn: () => api.get(API_ENDPOINTS.CHAT.ADMIN_ROOMS, { params: { page: page - 1 } }),
    });

    const rooms = data?.content ?? [];
    // Spring Boot 3.5 부터 페이지 메타가 page 하위로 내려갔다 — 신버전 우선, 구버전 폴백.
    const total = data?.page?.totalElements ?? data?.totalElements ?? 0;

    /**
     * 방 선택 — 메시지 비우기를 **이벤트 핸들러에서** 한다.
     *
     * 이펙트 안에서 동기 setState 를 하면 React Compiler 규칙(preserve-manual-memoization 계열)이
     * 잡는다. 규칙이 옳다 — "선택이 없으면 목록도 비어야 한다"는 파생 상태이지 동기화 대상이 아니다.
     * 여기서 같이 비우면 **이전 방 내용이 새 방에 잠깐 비치는 것**도 함께 막힌다.
     */
    const selectRoom = React.useCallback((room) => {
        setSelected(room);
        setMessages([]);
    }, []);

    // 방을 고르면 메시지를 받고, 그 호출이 곧 읽음 처리다.
    useEffect(() => {
        if (!selected) return;
        let cancelled = false;
        api.get(API_ENDPOINTS.CHAT.ADMIN_ROOM(selected.id))
            .then((list) => {
                if (cancelled) return;
                setMessages(list ?? []);
                // 읽음 처리가 반영된 목록을 다시 받아 배지를 지운다.
                queryClient.invalidateQueries({ queryKey: adminKeys.chatRooms() });
                queryClient.invalidateQueries({ queryKey: adminKeys.chatWaiting() });
            })
            .catch(() => { if (!cancelled) message.error('대화를 불러오지 못했습니다.'); });
        return () => { cancelled = true; };
    }, [selected, queryClient, message]);

    // 증분 폴링 — 열어둔 방에 대해서만.
    useEffect(() => {
        if (!selected) return;
        const timer = setInterval(() => {
            const afterId = messages.length ? messages[messages.length - 1].id : 0;
            api.get(API_ENDPOINTS.CHAT.ADMIN_POLL(selected.id), { params: { afterId } })
                .then((fresh) => { if (fresh?.length) setMessages((prev) => [...prev, ...fresh]); })
                .catch(() => { /* 다음 주기에 다시 시도한다 */ });
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [selected, messages]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

    const replyMutation = useMutation({
        mutationFn: (content) => api.post(API_ENDPOINTS.CHAT.ADMIN_REPLY(selected.id), { content }),
        onSuccess: (sent) => {
            setMessages((prev) => [...prev, sent]);
            setDraft('');
            queryClient.invalidateQueries({ queryKey: adminKeys.chatRooms() });
        },
        onError: () => message.error('전송하지 못했습니다.'),
    });

    const handleSend = () => {
        const text = draft.trim();
        if (!text || !selected || replyMutation.isPending) return;
        replyMutation.mutate(text);
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {messages.map((m) => {
                                const mine = m.senderRole === 'ADMIN';
                                return (
                                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6 }}>
                                        {mine && <Text style={styles.stamp}>{formatTime(m.createdAt)}</Text>}
                                        <div style={{ ...styles.bubble, ...(mine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                                            {m.content}
                                        </div>
                                        {!mine && <Text style={styles.stamp}>{formatTime(m.createdAt)}</Text>}
                                    </div>
                                );
                            })}
                        </div>
                        <div ref={bottomRef} />
                    </div>
                    <div style={styles.composer}>
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
                        <button type="button" onClick={handleSend}
                            disabled={!draft.trim() || replyMutation.isPending}
                            style={styles.sendBtn} aria-label="보내기">
                            <SendOutlined />
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <Button variant="ghost-sm" size="md" onClick={() => refetch()} disabled={isFetching}>
                    <SyncOutlined spin={isFetching} /> 새로고침
                </Button>
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
    roomRow:     { width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '13px 16px 13px 20px', borderBottom: `1px solid ${colors.border.light}` },
    roomName:    { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    roomEmail:   { fontSize: fontSize.xs, color: colors.text.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    roomWhen:    { fontSize: fontSize.xs, color: colors.text.tertiary, flexShrink: 0 },
    unreadDot:   { flexShrink: 0, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: colors.primary.main, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center' },
    thread:      { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper, minHeight: 360 },
    threadBody:  { flex: 1, overflowY: 'auto', padding: '18px 20px', background: colors.background.subtle },
    emptyDetail: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    bubble:      { maxWidth: '72%', padding: '8px 12px', borderRadius: radius.md, fontSize: fontSize.sm, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    bubbleMine:  { background: colors.primary.main, color: '#fff', borderBottomRightRadius: 4 },
    bubbleTheirs:{ background: colors.background.paper, color: colors.text.primary, border: `1px solid ${colors.border.light}`, borderBottomLeftRadius: 4 },
    stamp:       { fontSize: 10, color: colors.text.tertiary, flexShrink: 0 },
    composer:    { display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${colors.border.light}`, alignItems: 'flex-end' },
    textarea:    { flex: 1, resize: 'none', border: `1px solid ${colors.border.default}`, borderRadius: radius.md, padding: '8px 10px', fontSize: fontSize.sm, fontFamily: 'inherit', outline: 'none', background: colors.background.paper, color: colors.text.primary },
    sendBtn:     { flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', background: colors.primary.main, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    paginationBar: { display: 'flex', justifyContent: 'center', padding: '10px 8px', borderTop: `1px solid ${colors.border.light}` },
};

export default ChatTab;
