import { useState } from 'react';
import PropTypes from 'prop-types';
import { NotificationOutlined } from '../common/icons';
import { DEFAULT_STORE_GREETING, DEFAULT_SUPPORT_GREETING, fillGreeting } from '../../constants/chatIntro';

/*
 * 실제 대화와 미리보기에 같은 안내를 사용한다. 자동 문답은 서버 전송 없이 표시하며 답변이 없을 때만 입력칸을 채운다.
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
                <NotificationOutlined aria-hidden="true" /> <span className="reserve-chat-intro-notice">{notice || `안녕하세요. ${name}에서 안내해드려요.`}</span>
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
