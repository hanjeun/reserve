import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 손님·관리자의 대화 로드, 증분 폴링, 낙관적 전송을 공유한다.
 * 폴링은 messagesRef로 커서를 읽고 messages 변경만으로 타이머를 다시 만들지 않는다.
 * 폴링·전송 결과는 서버 id로 병합한다. 음수 임시 id는 폴링 커서에서 제외한다.
 * 전송 실패는 false를 반환하며 입력 원문 복원은 호출부가 맡는다.
 * 선택 이유와 전송 응답 격리: docs/technical/ui-decisions.md.
 */

/** 서버 id 기준 병합. 이미 있는 id 는 버린다. 새 것이 없으면 **같은 배열을 그대로** 돌려준다. */
const mergeById = (prev, incoming) => {
    if (!incoming || incoming.length === 0) return prev;
    const seen = new Set(prev.map((m) => m.id));
    const add = incoming.filter((m) => m && !seen.has(m.id));
    // 참조를 유지하는 게 중요하다 — 매번 새 배열을 만들면 스크롤 이펙트가 헛돈다.
    return add.length ? [...prev, ...add] : prev;
};

/**
 * @param {object}   o
 * @param {*}        o.threadKey 어느 대화인가. 이 값이 바뀌면 목록을 즉시 비우고 다시 불러온다.
 *                               `null` 이면 아무것도 하지 않는다(패널이 닫혀 있음 / 방 미선택).
 * @param {string}   o.myRole    내가 보낸 것으로 볼 senderRole ('MEMBER' | 'ADMIN')
 * @param {Function} o.load      () => Promise<{ messages, roomId }>   최초 1회. 읽음 처리도 겸한다
 * @param {Function} o.poll      (roomId, afterId) => Promise<message[]>
 * @param {Function} o.send      (roomId, content) => Promise<message>
 * @param {Function} [o.onLoaded] 최초 로드 성공 후 (배지 무효화 등)
 * @param {Function} [o.onSent]   전송 성공 후 (목록 갱신 등)
 * @param {Function} [o.onError]  사용자에게 알릴 실패
 * @param {number}   [o.pollMs]
 */
export default function useChatThread({
    threadKey, myRole,
    load, poll, send,
    onLoaded, onSent, onError,
    pollMs = 4000,
}) {
    const [messages, setMessages] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const [sending, setSending] = useState(false);

    /*
     * 대화가 바뀌면 렌더 도중에 상태를 맞춘다 — React 가 권장하는 "prop 이 바뀔 때 state 조정" 패턴.
     * 이펙트에서 비우면 (a) 한 프레임 동안 **이전 방 내용이 새 방에 비치고**
     * (b) 이펙트 안 동기 setState 라 React Compiler 규칙에도 걸린다.
     */
    const [scope, setScope] = useState(() => ({ key: threadKey }));
    if (threadKey !== scope.key) {
        setScope({ key: threadKey });
        setMessages([]);
        setRoomId(null);
        setSending(false);
    }

    // A → B → A에서도 처음 A의 응답은 재사용하지 않는다. 커밋된 대화 세대로 펜싱한다.
    const activeRef = useRef(null);
    useLayoutEffect(() => {
        const active = { scope, sending: false };
        activeRef.current = active;
        return () => { if (activeRef.current === active) activeRef.current = null; };
    }, [scope]);

    // 폴링 tick 이 최신 목록을 보되, 목록이 바뀌어도 타이머를 다시 만들지 않기 위한 거울.
    const messagesRef = useRef(messages);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // 최초 로드 — 이 호출이 곧 읽음 처리다. 별도 API 로 두면 화면이 부르는 걸 잊는 순간
    // 배지가 영영 안 사라진다.
    useEffect(() => {
        if (threadKey == null) return undefined;
        let cancelled = false;
        load()
            .then((res) => {
                if (cancelled || activeRef.current?.scope !== scope) return;
                setRoomId(res?.roomId ?? null);
                setMessages(res?.messages ?? []);
                onLoaded?.();
            })
            .catch(() => { if (!cancelled && activeRef.current?.scope === scope) onError?.('대화를 불러오지 못했습니다.'); });
        return () => { cancelled = true; };
    }, [threadKey, scope, load, onLoaded, onError]);

    // 메시지 배열이 바뀌어도 폴링 주기를 재시작하지 않는다.
    useEffect(() => {
        if (threadKey == null || roomId == null) return undefined;
        let alive = true;
        let inFlight = false;

        const tick = () => {
            if (inFlight || !alive) return;
            inFlight = true;
            // 낙관적(음수 id) 항목은 커서에서 제외한다. 서버가 모르는 id 다.
            const list = messagesRef.current;
            let afterId = 0;
            for (let i = list.length - 1; i >= 0; i -= 1) {
                if (list[i].id > afterId) afterId = list[i].id;
            }
            poll(roomId, afterId)
                .then((fresh) => { if (alive && activeRef.current?.scope === scope) setMessages((prev) => mergeById(prev, fresh)); })
                .catch(() => { /* 폴링 실패는 다음 주기에 재시도한다. */ })
                .finally(() => { inFlight = false; });
        };

        tick();                                   // 즉시 한 번. 없으면 첫 응답이 pollMs 뒤에나 온다
        const timer = setInterval(tick, pollMs);

        // 탭으로 돌아오는 순간 최신을 받는다. 백그라운드 탭에서는 브라우저가 타이머를
        // 늦추므로(throttling) 돌아왔을 때 눈에 띄게 밀려 있다.
        const onWake = () => { if (document.visibilityState === 'visible') tick(); };
        window.addEventListener('focus', onWake);
        document.addEventListener('visibilitychange', onWake);

        return () => {
            alive = false;
            clearInterval(timer);
            window.removeEventListener('focus', onWake);
            document.removeEventListener('visibilitychange', onWake);
        };
    }, [threadKey, scope, roomId, poll, pollMs]);

    /**
     * 전송. 성공하면 서버가 돌려준 것으로 임시 말풍선을 **대체**한다.
     * 그 사이 폴링이 같은 메시지를 이미 붙였다면 임시 것만 걷어낸다(중복 방지).
     *
     * @returns {Promise<boolean|null>} false만 현재 대화 실패다. null은 대화 전환/언마운트로 무시할 응답이다
     */
    const submit = useCallback(async (content) => {
        const text = String(content ?? '').trim();
        const active = activeRef.current;
        if (!active || active.scope !== scope) return null;
        if (!text || active.sending || roomId == null) return false;
        active.sending = true;

        const tempId = -Date.now();
        setSending(true);
        setMessages((prev) => [...prev, {
            id: tempId,
            content: text,
            senderRole: myRole,
            createdAt: new Date().toISOString(),
            pending: true,
        }]);

        try {
            const sent = await send(roomId, text);
            if (activeRef.current !== active) return null;
            setMessages((prev) => mergeById(
                prev.filter((m) => m.id !== tempId),
                sent ? [sent] : [],
            ));
            onSent?.(sent);
            return true;
        } catch (e) {
            if (activeRef.current !== active) return null;
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            // 429 는 레이트리밋이다. "실패했다"가 아니라 "너무 빠르다"라고 말해야
            // 사용자가 같은 동작을 계속 반복하지 않는다.
            const tooFast = (e?.status ?? e?.response?.status) === 429;
            onError?.(tooFast
                ? '조금 천천히 보내주세요.'
                : '전송하지 못했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        } finally {
            if (activeRef.current === active) {
                active.sending = false;
                setSending(false);
            }
        }
    }, [send, scope, roomId, myRole, onSent, onError]);

    return { messages, roomId, sending, send: submit };
}
