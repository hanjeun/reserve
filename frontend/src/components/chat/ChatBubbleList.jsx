/**
 * 대화 말풍선 목록 — 손님 패널(ChatLauncher)과 관리자 탭(ChatTab)이 **같은 것을 쓴다**.
 *
 * <h3>왜 컴포넌트로 뽑았나 (2026-08-24)</h3>
 * 두 화면은 같은 대화를 보여준다. 그런데 처음엔 각자 map 을 돌려 각자 그렸다 —
 * 말풍선 스타일이 양쪽에 복사돼 있으니 한쪽만 고쳐지고 다른 쪽이 남는 게 시간문제였다.
 * 이 프로젝트의 반복 회귀가 전부 그 형태였다(field.js 주석 참고 —
 * "같아 보여야 하는 것들이 서로 다른 렌더러를 가질 때, 관문은 값이다").
 * 실제로 다른 건 **"내 말풍선이 어느 쪽인가"** 하나뿐이라 그것만 prop 으로 받는다.
 *
 * <h3>★ 연속 메시지 묶기</h3>
 * 같은 사람이 이어서 보낸 것은 한 덩어리로 본다.
 * <ul>
 *   <li><b>덩어리의 첫 말풍선만</b> 모서리를 깎는다 — 카카오톡이 하는 방식이다.
 *       이어지는 말풍선까지 전부 모서리가 나면 매번 새 대화가 시작되는 것처럼 보인다.</li>
 *   <li><b>시각은 덩어리의 마지막에만</b> 붙인다. 세 줄 연속으로 보낸 것에 시각이 세 번 붙으면
 *       그게 다 별개의 발언처럼 읽힌다. 장식이 아니라 정보량 문제다.</li>
 *   <li>덩어리 안은 간격을 좁히고(2px), 덩어리 사이는 벌린다(10px).
 *       묶임은 모서리보다 <b>간격</b>이 먼저 알려준다.</li>
 * </ul>
 * 시간이 많이 벌어지면(기본 5분) 같은 사람이라도 다른 덩어리로 본다 —
 * 아침에 한 말과 저녁에 한 말이 한 덩어리로 붙어 있으면 오히려 헷갈린다.
 *
 * <h3>★ 보내는 중 (2026-08-25)</h3>
 * {@code m.pending} 은 아직 서버 응답을 못 받은 낙관적 말풍선이다(useChatThread 참고).
 * 시각 자리에 <b>"보내는 중"</b> 을 넣고 말풍선을 흐리게 만든다.
 * 스피너를 쓰지 않는 이유 — 보통 100~300ms 안에 끝나서 스피너는 <b>깜빡임</b>으로만 보이고,
 * 여러 개를 연달아 보내면 화면에 스피너가 여러 개 돈다. 글자는 그런 소란이 없다.
 */
import React from 'react';
import { Typography } from 'antd';
import { colors, fontSize, radius } from '../../styles/tokens';

const { Text } = Typography;

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
const ChatBubbleList = ({ messages, mine }) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
        {messages.map((m, i) => {
            const isMine = m.senderRole === mine;
            const first = !inSameGroup(messages[i - 1], m);
            const last = !inSameGroup(m, messages[i + 1]);

            const corner = first
                ? (isMine ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 })
                : null;

            return (
                <div key={m.id}
                    style={{
                        display: 'flex',
                        justifyContent: isMine ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end',
                        gap: 6,
                        // 덩어리 사이만 벌린다. 첫 줄 위에는 여백을 주지 않는다.
                        marginTop: i === 0 ? 0 : (first ? 10 : 2),
                    }}>
                    {isMine && (m.pending || last) && (
                        <Text style={styles.stamp}>
                            {m.pending ? '보내는 중' : formatTime(m.createdAt)}
                        </Text>
                    )}
                    <div style={{
                        ...styles.bubble,
                        ...(isMine ? styles.bubbleMine : styles.bubbleTheirs),
                        ...corner,
                        // 아직 서버가 받았는지 모르는 상태. 자리는 잡되 "확정 아님"이 보여야 한다.
                        ...(m.pending ? styles.bubblePending : null),
                    }}>
                        {m.content}
                    </div>
                    {!isMine && last && <Text style={styles.stamp}>{formatTime(m.createdAt)}</Text>}
                </div>
            );
        })}
    </div>
);

const styles = {
    bubble: {
        maxWidth: '78%', padding: '9px 13px', borderRadius: radius.lg,
        fontSize: fontSize.sm, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    },
    bubbleMine: { background: colors.primary.main, color: '#fff' },
    bubbleTheirs: {
        background: colors.background.paper, color: colors.text.primary,
        border: `1px solid ${colors.border.light}`,
    },
    // 확정되지 않은 말풍선. 색을 바꾸지 않고 투명도만 낮춘다 — 색을 바꾸면
    // "실패했다"로 읽히는데, 대부분은 곧 성공한다.
    bubblePending: { opacity: 0.55 },
    stamp: { fontSize: 10, color: colors.text.tertiary, flexShrink: 0, whiteSpace: 'nowrap' },
};

export default ChatBubbleList;
