import PropTypes from 'prop-types';
import { CloseOutlined, MoreOutlined } from '../common/icons';
import ChatComposer from './ChatComposer';
import ChatIntro from './ChatIntro';
import MessengerAvatar from './MessengerAvatar';
import { SUPPORT_DISPLAY_NAME } from '../../constants/chatIntro';

/*
 * 실제 메신저 클래스로 미리보기를 구성하고 입력창은 inert로 실행을 막는다.
 */
const noop = () => {};

export default function ChatIntroPreview({ kind = 'store', name, imageSrc, userName, notice, greeting, items = [] }) {
    const isStore = kind === 'store';
    const displayName = name || (isStore ? '가게' : SUPPORT_DISPLAY_NAME);

    return (
        <div className="reserve-chat-intro-device">
            <div className="reserve-messenger-thread reserve-chat-intro-device-thread">
                <div className="reserve-messenger-thread-heading reserve-chat-intro-device-heading">
                    <MessengerAvatar variant={isStore ? 'store' : 'brand'} imageSrc={imageSrc || undefined}
                        className="reserve-messenger-thread-avatar" />
                    <span className="reserve-messenger-thread-copy">
                        <strong>{displayName}</strong>
                        {isStore && <span>가게에 문의</span>}
                    </span>
                    <span className="reserve-chat-intro-device-icons" aria-hidden="true">
                        {isStore && <MoreOutlined />}
                        <CloseOutlined />
                    </span>
                </div>
                <div className={'reserve-messenger-thread-body reserve-chat-intro-device-body'
                    + (isStore ? '' : ' reserve-messenger-thread-body--support')}>
                    <ChatIntro
                        preview
                        variant={isStore ? 'store' : 'support'}
                        userName={userName}
                        displayName={displayName}
                        notice={notice || undefined}
                        greeting={greeting || undefined}
                        items={items}
                    />
                </div>
                <div className="reserve-messenger-composer-wrap" aria-hidden="true" inert>
                    <ChatComposer value="" onChange={noop} onSend={noop} onFileChange={noop} imageEnabled />
                </div>
            </div>
        </div>
    );
}

ChatIntroPreview.propTypes = {
    kind: PropTypes.oneOf(['store', 'support']),
    name: PropTypes.string,
    imageSrc: PropTypes.string,
    userName: PropTypes.string,
    notice: PropTypes.string,
    greeting: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.shape({ question: PropTypes.string, answer: PropTypes.string })),
};
