import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import useMessengerStore from '../../store/useMessengerStore';

export default function ChatRetentionNotice({ visible }) {
    const reducedMotion = useReducedMotion();
    const closePanel = useMessengerStore(state => state.closePanel);
    const { shouldRender, isClosing } = useExitAnimation(visible, reducedMotion ? 0 : 220);
    if (!shouldRender) return null;
    return <div className={`reserve-chat-retention-notice-wrap${isClosing ? ' is-closing' : ''}`}
        aria-hidden={!visible || undefined} inert={!visible ? true : undefined}>
        <div className="reserve-chat-retention-notice-inner">
            <p className="reserve-chat-retention-notice">
                일반 글·사진은 90일 보관해요. 신고·분쟁 자료는 별도 보관하며,
                정책 고지 후 30일 유예를 거쳐 적용해요. <Link to="/privacy" onClick={event => {
                    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) closePanel();
                }}>보관 정책 보기</Link>
            </p>
        </div>
    </div>;
}
ChatRetentionNotice.propTypes = { visible: PropTypes.bool.isRequired };
