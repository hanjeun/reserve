import PropTypes from 'prop-types';
import { CloseOutlined, MoreOutlined, SendOutlined } from '@ant-design/icons';
import ChatIntro from './ChatIntro';
import MessengerAvatar from './MessengerAvatar';
import { SUPPORT_DISPLAY_NAME } from '../../constants/chatIntro';

/**
 * 채팅 관리 화면의 미리보기 — 손님이 보는 메신저 대화창 모양 그대로 그린다 (2026-09-23).
 * 헤더·본문·입력창은 메신저의 실제 클래스를 재사용한다. 가게·고객지원 모두 첫 대화에는 항상 안내가 보인다(09-24 통일).
 * 질문 버튼은 실제처럼 눌러 볼 수 있고, 입력창·전송·메뉴는 모양만 있다.
 */
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
                        {isStore && <span>가게 문의</span>}
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
                <div className="reserve-messenger-composer-wrap" aria-hidden="true">
                    <div className="reserve-chat-composer reserve-chat-intro-device-composer">
                        <span>메시지를 입력하세요</span>
                        <span className="reserve-chat-send reserve-chat-intro-device-send"><SendOutlined /></span>
                    </div>
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
