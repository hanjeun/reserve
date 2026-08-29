import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 대화 한 개(스레드)의 상태 — 손님 패널(ChatLauncher)과 관리자 탭(ChatTab)이 **같은 것을 쓴다.**
 *
 * <h3>왜 훅으로 뽑았나 (2026-08-25)</h3>
 * 두 화면이 "불러오기 → 증분 폴링 → 전송 후 붙이기"를 **각자 손으로** 짜고 있었다.
 * 그래서 아래 두 버그가 **양쪽에 똑같이** 들어 있었다. 한쪽만 고치면 다른 쪽이 남는,
 * 이 프로젝트가 반복해서 겪은 형태다(CLAUDE.md "규칙은 관문 하나에서 강제한다").
 *
 * ── 고친 버그 ①: 폴링 타이머가 메시지마다 리셋됐다 ─────────────────────────
 * 예전 코드는 이랬다:
 *
 *   useEffect(() => {
 *       const timer = setInterval(tick, 4000);
 *       return () => clearInterval(timer);
 *   }, [selected, messages]);          // ← messages 가 의존성에 있다
 *
 * `messages` 가 바뀔 때마다 이펙트가 정리·재생성된다. 그런데 `setInterval` 은
 * **생성 직후가 아니라 delay 뒤에 첫 tick** 을 낸다. 그래서
 *
 *   - 화면을 열면 초기 목록을 받는 순간 `messages` 가 바뀌고 → 타이머 리셋 →
 *     **첫 폴링이 4초 뒤**
 *   - 그 뒤로도 메시지가 들어올 때마다 리셋되므로 **대화가 활발할수록 폴링이 더 안 돈다**
 *
 * 4초 주기에 3초마다 메시지가 오가는 상황을 그대로 시뮬레이션하면, 20초 동안 폴링이
 * 5번이 아니라 **2번**만 돌고 그 첫 번째가 16.5초에 온다.
 * "처음엔 아무것도 안 뜨다 한참 뒤에 뜬다"가 정확히 이 현상이다.
 *
 * → `messages` 를 의존성에서 빼고 **ref 로 읽는다.** 타이머는 대화가 바뀔 때만 다시 만들고,
 *   만들자마자 **한 번 즉시 돈다**(`tick()`).
 *
 * ── 고친 버그 ②: 같은 메시지가 두 번 붙었다 ────────────────────────────────
 * 전송 응답과 폴링 응답이 **같은 메시지를 둘 다 들고 온다.**
 *
 *   t=0.0  폴링이 afterId=100 으로 요청을 띄운다 (응답 아직)
 *   t=0.1  내가 전송 → 서버가 id=101 로 저장 → 응답을 받아 목록에 붙인다
 *   t=0.3  (t=0 의) 폴링 응답이 [101] 을 들고 도착 → 또 붙인다   ← 101 이 두 개
 *
 * 말풍선의 React key 가 `m.id` 라 중복 key 가 되고, 다음 렌더에서 하나가 사라진다.
 * "두 번 보내진 것처럼 보이다가 하나 사라진다"가 이것이다.
 *
 * → **모든 추가를 id 기준 병합(`mergeById`)으로 통일한다.** 어느 쪽 응답이 먼저 오든 id 는
 *   한 번만 남는다. 서버 쿼리는 `findByRoomIdAndIdGreaterThan...`(exclusive)이라 백엔드는
 *   정상이었다 — 순수한 클라이언트 경합이었다.
 *
 * ── 더한 것: 낙관적 표시 ─────────────────────────────────────────────────
 * 전송을 누르면 **말풍선이 즉시 뜨고**(흐리게 + "보내는 중"), 응답이 오면 그 자리를 진짜
 * 메시지가 대체한다. 카카오톡·채널톡이 하는 방식이다.
 *
 * 임시 id 를 **음수**(`-Date.now()`)로 두는 게 핵심이다 — 서버 id(양수)와 절대 충돌하지 않으므로
 * ②의 병합이 그대로 성립하고, 폴링 커서 계산에서도 쉽게 걸러낸다.
 * (예전 주석의 "낙관적 추가를 하면 폴링이 같은 걸 또 붙인다"는 **병합이 없을 때** 맞는 말이었다.)
 *
 * 실패하면 임시 말풍선을 걷어내고 **입력칸에 원문을 돌려준다.** 실패 말풍선을 남기고 재전송 UI 를
 * 따로 만드는 방법도 있지만, 이 규모에서는 "쓴 글이 사라지지 않는다"가 더 중요하다.
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
    const [seenKey, setSeenKey] = useState(threadKey);
    if (threadKey !== seenKey) {
        setSeenKey(threadKey);
        setMessages([]);
        setRoomId(null);
    }

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
                if (cancelled) return;
                setRoomId(res?.roomId ?? null);
                setMessages(res?.messages ?? []);
                onLoaded?.();
            })
            .catch(() => { if (!cancelled) onError?.('대화를 불러오지 못했습니다.'); });
        return () => { cancelled = true; };
    }, [threadKey, load, onLoaded, onError]);

    // 증분 폴링. ★ 의존성에 messages 가 없다 — 위 주석 ① 참고.
    useEffect(() => {
        if (threadKey == null || roomId == null) return undefined;
        let alive = true;

        const tick = () => {
            // 낙관적(음수 id) 항목은 커서에서 제외한다. 서버가 모르는 id 다.
            const list = messagesRef.current;
            let afterId = 0;
            for (let i = list.length - 1; i >= 0; i -= 1) {
                if (list[i].id > 0) { afterId = list[i].id; break; }
            }
            poll(roomId, afterId)
                .then((fresh) => { if (alive) setMessages((prev) => mergeById(prev, fresh)); })
                .catch(() => { /* 폴링 실패는 조용히 넘긴다 — 다음 주기에 다시 시도한다 */ });
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
    }, [threadKey, roomId, poll, pollMs]);

    /**
     * 전송. 성공하면 서버가 돌려준 것으로 임시 말풍선을 **대체**한다.
     * 그 사이 폴링이 같은 메시지를 이미 붙였다면 임시 것만 걷어낸다(중복 방지).
     *
     * @returns {Promise<boolean>} 성공 여부 — 호출부가 입력칸을 되돌릴지 정한다
     */
    const submit = useCallback(async (content) => {
        const text = String(content ?? '').trim();
        if (!text || sending || roomId == null) return false;

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
            setMessages((prev) => mergeById(
                prev.filter((m) => m.id !== tempId),
                sent ? [sent] : [],
            ));
            onSent?.(sent);
            return true;
        } catch (e) {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            // 429 는 레이트리밋이다. "실패했다"가 아니라 "너무 빠르다"라고 말해야
            // 사용자가 같은 동작을 계속 반복하지 않는다.
            const tooFast = e?.response?.status === 429;
            onError?.(tooFast
                ? '조금 천천히 보내주세요.'
                : '전송하지 못했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        } finally {
            setSending(false);
        }
    }, [send, sending, roomId, myRole, onSent, onError]);

    return { messages, roomId, sending, send: submit };
}
