import { useState } from 'react';
import PropTypes from 'prop-types';
import { NotificationOutlined } from '@ant-design/icons';
import { DEFAULT_STORE_GREETING, DEFAULT_SUPPORT_GREETING, fillGreeting } from '../../constants/chatIntro';

/**
 * 채팅 첫 안내 — 고객지원(관리자 설정)과 가게 문의(사장님 설정)가 같은 컴포넌트·같은 구성을 쓴다 (2026-09-23).
 * 채팅 관리 화면의 미리보기도 이 컴포넌트를 그대로 그린다(preview).
 *
 * <p>구성(2026-09-24 채팅 관리):
 * <ol>
 *   <li>확성기 줄 — 공지사항. 없으면 "안녕하세요. {표시 이름}입니다."</li>
 *   <li>인사말 — 설정한 문구({이름} → 손님 이름, 빈 줄 = 문단). 없으면 범위별 기본 문구.
 *       보낸 사람 표시(아바타 + 이름)는 대화창 헤더와 겹쳐서 두지 않는다.</li>
 *   <li>자주 묻는 질문 — 답변이 있으면 누르는 즉시 답변을 보여준다(자동 문답, 서버로 보내지 않음).
 *       답변이 없는 질문(서버를 못 부를 때의 대체값)은 입력칸에 질문을 채운다.</li>
 * </ol>
 */
export default function ChatIntro({
    variant = 'support',
    userName,
    displayName,
    notice,
    greeting,
    items = [],
    onAsk,
    disabled = false,
    draftLength = 0,
    preview = false,
}) {
    const [askedQuestions, setAskedQuestions] = useState([]);
    const validItems = items.filter(item => item?.question);
    const answered = askedQuestions
        .map(question => validItems.find(item => item.question === question && item.answer))
        .filter(Boolean);
    const remaining = validItems.filter(item => !answered.includes(item));
    const isStore = variant === 'store';
    const name = displayName || (isStore ? '가게' : 'RESERVE');
    const paragraphs = fillGreeting(greeting || (isStore ? DEFAULT_STORE_GREETING : DEFAULT_SUPPORT_GREETING), userName);

    const ask = (item) => {
        if (item.answer) {
            setAskedQuestions(prev => (prev.includes(item.question) ? prev : [...prev, item.question]));
            return;
        }
        if (!preview) onAsk?.(item.question);
    };

    return (
        <section className="reserve-messenger-support-intro" aria-label="문의 시작 안내">
            <p className="reserve-messenger-support-announcement">
                <NotificationOutlined aria-hidden="true" /> <span className="reserve-chat-intro-notice">{notice || `안녕하세요. ${name}입니다.`}</span>
            </p>
            <div className="reserve-messenger-support-greeting">
                {paragraphs.map(paragraph => (
                    <p key={paragraph.key} className="reserve-chat-intro-greeting">{paragraph.text}</p>
                ))}
            </div>
            {answered.length > 0 && (
                <div className="reserve-chat-intro-answers" aria-live="polite">
                    {answered.map(item => (
                        <div className="reserve-chat-intro-exchange" key={item.question}>
                            <p className="reserve-chat-intro-question">{item.question}</p>
                            <div className="reserve-chat-intro-answer">
                                <span className="reserve-chat-intro-auto-label">자동 답변</span>
                                <p>{item.answer}</p>
                            </div>
                        </div>
                    ))}
                    <p className="reserve-chat-intro-note">더 궁금한 점은 아래에 메시지로 남겨주세요.</p>
                </div>
            )}
            {remaining.length > 0 && (
                <fieldset className="reserve-messenger-support-questions" aria-label="자주 묻는 질문" style={{ border: 0, margin: 0, minWidth: 0, paddingInline: 0, paddingBottom: 0 }}>
                    {remaining.map(item => (
                        <button key={item.question} type="button" className="reserve-messenger-support-question"
                            disabled={!item.answer && (disabled
                                || draftLength + item.question.length + (draftLength ? 1 : 0) > 2000)}
                            onClick={() => ask(item)}>{item.question}</button>
                    ))}
                </fieldset>
            )}
        </section>
    );
}

ChatIntro.propTypes = {
    variant: PropTypes.oneOf(['support', 'store']),
    userName: PropTypes.string,
    displayName: PropTypes.string,
    notice: PropTypes.string,
    greeting: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.shape({
        question: PropTypes.string.isRequired,
        answer: PropTypes.string,
    })),
    onAsk: PropTypes.func,
    disabled: PropTypes.bool,
    draftLength: PropTypes.number,
    preview: PropTypes.bool,
};
