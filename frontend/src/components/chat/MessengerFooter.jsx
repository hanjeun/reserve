import { useId } from 'react';
import PropTypes from 'prop-types';
import { HomeOutlined, MessageOutlined, SettingOutlined } from '@ant-design/icons';

const VIEWS = [
    { value: 'home', label: '홈', icon: <HomeOutlined /> },
    { value: 'conversations', label: '대화', icon: <MessageOutlined /> },
    { value: 'settings', label: '설정', icon: <SettingOutlined /> },
];

export default function MessengerFooter({ view, onChange, unread = 0 }) {
    const unreadId = useId();
    const unreadCount = Number.isFinite(unread) ? Math.max(0, Math.trunc(unread)) : 0;

    return (
        <nav className="reserve-messenger-footer" aria-label="메신저 화면">
            {VIEWS.map(({ value, label, icon }) => {
                const hasUnread = value === 'conversations' && unreadCount > 0;
                return (
                    <button
                        key={value}
                        type="button"
                        className={`reserve-messenger-footer-tab${view === value ? ' is-active' : ''}`}
                        aria-label={label}
                        aria-current={view === value ? 'page' : undefined}
                        aria-describedby={hasUnread ? unreadId : undefined}
                        onClick={() => onChange(value)}
                    >
                        <span className="reserve-messenger-footer-icon" aria-hidden="true">{icon}</span>
                        <span>{label}</span>
                        {hasUnread && (
                            <>
                                <span className="reserve-messenger-footer-badge" aria-label={`읽지 않은 메시지 ${unreadCount}개`}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                                <span id={unreadId} hidden>읽지 않은 메시지 {unreadCount}개</span>
                            </>
                        )}
                    </button>
                );
            })}
        </nav>
    );
}

MessengerFooter.propTypes = {
    view: PropTypes.oneOf(['home', 'conversations', 'settings']).isRequired,
    onChange: PropTypes.func.isRequired,
    unread: PropTypes.number,
};
