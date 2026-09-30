import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 손님·사장님·관리자의 대화 로드, 증분 폴링, 낙관적 전송을 공유한다.
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

const prependById = (prev, incoming) => {
    if (!incoming || incoming.length === 0) return prev;
    const seen = new Set(prev.map((m) => m.id));
    const add = incoming.filter((m) => m && !seen.has(m.id));
    return add.length ? [...add, ...prev] : prev;
};

// 취소 이벤트는 이미 표시된 메시지만 갱신한다. 옛 메시지를 대화 끝에 추가하지 않는다.
const applyChanges = (previous, incoming) => {
    if (!incoming?.length) return previous;
    const changes = new Map(incoming.map(message => [message.id, message]));
    let changed = false;
    const next = previous.map(message => {
        const update = changes.get(message.id);
        if (!update || (message.retracted && update.retracted && message.expired === update.expired)) return message;
        changed = true;
        return { ...message, ...update };
    });
    return changed ? next : previous;
};

const newClientMessageId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) return null;
    return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
};

// 같은 본문·첨부를 다시 보내면 직전 식별자를 재사용한다.
const reuseOrNewClientMessageId = (retry, text, attachment) => (
    retry?.content === text && retry?.attachment === attachment
        ? retry.clientMessageId
        : newClientMessageId()
);

// 중단 가능하면 signal 을, 사진이 있으면 첨부까지 넘긴다(없는 인자는 넘기지 않는다).
const callSend = (send, controller, roomId, text, clientMessageId, attachment) => {
    if (controller) return send(roomId, text, clientMessageId, attachment, { signal: controller.signal });
    if (attachment) return send(roomId, text, clientMessageId, attachment);
    return send(roomId, text, clientMessageId);
};

// 429 는 레이트리밋이다. "실패했다"가 아니라 "너무 빠르다"라고 말해야
// 사용자가 같은 동작을 계속 반복하지 않는다.
const sendFailureText = (error, controller) => {
    if (controller?.signal.aborted) return '전송 요청을 중단했습니다. 서버에 도착했을 수 있으니 대화를 확인해주세요.';
    if ((error?.status ?? error?.response?.status) === 429) return '조금 천천히 보내주세요.';
    return '전송하지 못했습니다. 잠시 후 다시 시도해주세요.';
};

/**
 * @param {object}   o
 * @param {*}        o.threadKey 어느 대화인가. 이 값이 바뀌면 목록을 즉시 비우고 다시 불러온다.
 *                               `null` 이면 아무것도 하지 않는다(패널이 닫혀 있음 / 방 미선택).
 * @param {string}   o.myRole    내가 보낸 것으로 볼 senderRole ('MEMBER' | 'ADMIN' | 'OWNER')
 * @param {Function} o.load      () => Promise<{ messages, roomId }>   최초 1회. 읽음 처리도 겸한다
 * @param {Function} o.poll      (roomId, afterId) => Promise<message[]>
 * @param {Function} o.send      (roomId, content, clientMessageId) => Promise<message>
 * @param {Function} [o.onLoaded] 최초 로드 성공 후 (배지 무효화 등)
 * @param {Function} [o.onSent]   전송 성공 후 (목록 갱신 등)
 * @param {Function} [o.onPolled] 새 메시지를 폴링한 뒤 (가시 화면 읽음 처리 등)
 * @param {Function} [o.onError]  사용자에게 알릴 실패
 * @param {number}   [o.pollMs]
 */
export default function useChatThread({
    threadKey, myRole,
    load, poll, send, pollChanges, cancellable = false,
    onLoaded, onSent, onPolled, onChanged, onError,
    pollMs = 4000,
}) {
    const [messages, setMessages] = useState([]);
    const [roomId, setRoomId] = useState(null);
    const [sending, setSending] = useState(false);
    const [thread, setThread] = useState(null);
    const [loading, setLoading] = useState(threadKey != null);
    const [loadError, setLoadError] = useState(false);
    const [reloadRevision, setReloadRevision] = useState(0);

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
        setThread(null);
        setLoading(threadKey != null);
        setLoadError(false);
    }

    // A → B → A와 같은 방 재조회에서도 이전 응답을 재사용하지 않는다.
    const activeRef = useRef(null);
    // 응답을 받지 못한 전송은 서버에 저장됐을 수도 있다. 같은 본문을 다시 누르면
    // 같은 식별자를 보내 서버가 기존 한 줄을 돌려주게 한다.
    const retryRef = useRef(null);
    useLayoutEffect(() => {
        const active = { scope, sending: false, ready: false, invalidated: false };
        activeRef.current = active;
        return () => {
            active.requestController?.abort();
            if (activeRef.current === active) activeRef.current = null;
        };
    }, [scope, reloadRevision]);
    // 같은 방 재조회는 응답 유실 재시도의 식별자를 지우지 않는다.
    useLayoutEffect(() => {
        retryRef.current = null;
    }, [scope]);

    // 폴링 tick 이 최신 목록을 보되, 목록이 바뀌어도 타이머를 다시 만들지 않기 위한 거울.
    const messagesRef = useRef(messages);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // 최초 로드 — 이 호출이 곧 읽음 처리다. 별도 API 로 두면 화면이 부르는 걸 잊는 순간
    // 배지가 영영 안 사라진다.
    useEffect(() => {
        if (threadKey == null) return undefined;
        let cancelled = false;
        const active = activeRef.current;
        load()
            .then((res) => {
                if (cancelled || activeRef.current !== active || active?.invalidated) return;
                active.ready = true;
                setRoomId(res?.roomId ?? null);
                setMessages(res?.messages ?? []);
                setThread(res ?? null);
                setLoading(false);
                setLoadError(false);
                onLoaded?.(res);
            })
            .catch(() => {
                if (cancelled || activeRef.current !== active || active?.invalidated) return;
                active.ready = false;
                setLoading(false);
                setLoadError(true);
                onError?.('대화를 불러오지 못했습니다.');
            });
        return () => { cancelled = true; };
    }, [threadKey, scope, load, onLoaded, onError, reloadRevision]);

    // 메시지 배열이 바뀌어도 폴링 주기를 재시작하지 않는다.
    useEffect(() => {
        const active = activeRef.current;
        if (threadKey == null || roomId == null || loading || loadError || !active?.ready) return undefined;
        let alive = true;
        let inFlight = false;
        let changeRevision = 0;

        const tick = () => {
            if (inFlight || !alive || activeRef.current !== active || active.invalidated || !active.ready) return;
            inFlight = true;
            // 낙관적(음수 id) 항목은 커서에서 제외한다. 서버가 모르는 id 다.
            const list = messagesRef.current;
            let afterId = 0;
            for (let i = list.length - 1; i >= 0; i -= 1) {
                if (list[i].id > afterId) afterId = list[i].id;
            }
            poll(roomId, afterId)
                .then((fresh) => {
                    if (!alive || activeRef.current !== active || active.invalidated) return;
                    setMessages((prev) => mergeById(prev, fresh));
                    if (fresh?.length) onPolled?.(roomId, fresh);
                })
                .catch(() => { /* 폴링 실패는 다음 주기에 재시도한다. */ })
                .finally(() => { inFlight = false; });
            if (pollChanges && !active.pollingChanges) {
                active.pollingChanges = true;
                pollChanges(roomId, changeRevision).then(changes => {
                    if (!alive || activeRef.current !== active || active.invalidated) return;
                    setMessages(previous => applyChanges(previous, changes?.messages));
                    changeRevision = changes?.nextRevision ?? changeRevision;
                    if (changes?.messages?.length) onChanged?.();
                }).catch(() => { /* 커서는 성공했을 때만 진행한다. 다음 폴링에서 재조회한다. */ })
                    .finally(() => { active.pollingChanges = false; });
            }
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
    }, [threadKey, scope, roomId, loading, loadError, poll, pollChanges, pollMs, onPolled, onChanged]);

    /**
     * 전송. 성공하면 서버가 돌려준 것으로 임시 말풍선을 **대체**한다.
     * 그 사이 폴링이 같은 메시지를 이미 붙였다면 임시 것만 걷어낸다(중복 방지).
     *
     * @returns {Promise<boolean|null>} false만 현재 대화 실패다. null은 대화 전환/언마운트로 무시할 응답이다
     */
    const submit = useCallback(async (content, attachment = null) => {
        const text = String(content ?? '').trim();
        const active = activeRef.current;
        if (!active || active.scope !== scope) return null;
        if ((!text && !attachment) || active.sending || roomId == null || !active.ready || active.invalidated) return false;
        const clientMessageId = reuseOrNewClientMessageId(retryRef.current, text, attachment);
        if (!clientMessageId) { onError?.('안전한 연결에서 다시 시도해주세요.'); return false; }
        active.sending = true;
        const controller = cancellable ? new AbortController() : null;
        active.requestController = controller;
        retryRef.current = { content: text, attachment, clientMessageId };

        const tempId = -Date.now();
        setSending(true);
        setMessages((prev) => [...prev, {
            id: tempId,
            content: text || (attachment ? '사진 전송 중' : ''),
            senderRole: myRole,
            clientMessageId,
            createdAt: new Date().toISOString(),
            pending: true,
        }]);

        try {
            const sent = await callSend(send, controller, roomId, text, clientMessageId, attachment);
            if (activeRef.current !== active || active.invalidated) return null;
            setMessages((prev) => mergeById(
                prev.filter((m) => m.id !== tempId),
                sent ? [sent] : [],
            ));
            if (retryRef.current?.clientMessageId === clientMessageId) retryRef.current = null;
            onSent?.(sent);
            return true;
        } catch (e) {
            if (activeRef.current !== active || active.invalidated) return null;
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            onError?.(sendFailureText(e, controller));
            return false;
        } finally {
            if (activeRef.current === active && !active.invalidated) {
                active.sending = false;
                active.requestController = null;
                setSending(false);
            }
        }
    }, [send, scope, roomId, myRole, onSent, onError, cancellable]);

    const cancelSend = useCallback(() => {
        activeRef.current?.requestController?.abort();
    }, []);

    const updateMessage = useCallback(message => {
        if (activeRef.current?.scope !== scope || activeRef.current.invalidated) return;
        setMessages(previous => applyChanges(previous, message ? [message] : []));
        if (message) onChanged?.();
    }, [scope, onChanged]);

    const reload = useCallback(() => {
        const active = activeRef.current;
        if (threadKey == null || !active || active.scope !== scope || active.invalidated) return;
        // 다음 커밋 전 도착한 이전 응답과 같은 tick의 전송도 즉시 차단한다.
        active.ready = false;
        active.invalidated = true;
        setSending(false);
        setLoading(true);
        setLoadError(false);
        setReloadRevision((value) => value + 1);
    }, [threadKey, scope]);

    const prepend = useCallback((olderMessages) => {
        setMessages((prev) => prependById(prev, olderMessages));
    }, []);

    return {
        messages, roomId, thread, loading, loadError, sending,
        send: submit, reload, prepend, cancelSend, updateMessage,
    };
}
