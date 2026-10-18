import PropTypes from 'prop-types';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';

export default function ChatRetentionNotice({ visible }) {
    const reducedMotion = useReducedMotion();
    const { shouldRender, isClosing } = useExitAnimation(visible, reducedMotion ? 0 : 220);
    if (!shouldRender) return null;
    return <div className={`reserve-chat-retention-notice-wrap${isClosing ? ' is-closing' : ''}`}
        aria-hidden={!visible || undefined} inert={!visible ? true : undefined}>
        <div className="reserve-chat-retention-notice-inner">
            <p className="reserve-chat-retention-notice">
                일반 글·사진은 90일 보관해요. 신고·분쟁 자료는 별도 보관하며,
                정책 고지 후 30일 유예를 거쳐 적용해요. <a href="/privacy" target="_blank" rel="noopener noreferrer">보관 정책 보기</a>
            </p>
        </div>
    </div>;
}
ChatRetentionNotice.propTypes = { visible: PropTypes.bool.isRequired };
