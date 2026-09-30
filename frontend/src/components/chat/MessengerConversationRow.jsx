import PropTypes from 'prop-types';
import { ShopOutlined } from '@ant-design/icons';
import MessengerAvatar from './MessengerAvatar';
import { conversationTitle, useSupportIdentity } from './messengerIdentity';
import { SupportAvatar } from './SupportIdentity';

const formatWhen = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    if (date.toDateString() === new Date().toDateString()) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}.${date.getDate()}`;
};

export default function MessengerConversationRow({ row, selected = false, owner = false, onSelect }) {
    const supportIdentity = useSupportIdentity();
    const title = conversationTitle(row, supportIdentity.name);
    const preview = row.lastMessagePreview || '아직 메시지가 없습니다.';
    const unread = Number.isSafeInteger(row.unread) ? Math.max(0, row.unread) : 0;
    // 아이콘: 사람(관리자·사업자 시점) → 고객지원 → 가게 사진 → 기본 가게 아이콘.
    let icon;
    if (row.viewerRole === 'ADMIN' || owner) {
        icon = <MessengerAvatar imageSrc={row.counterpartProfileImage} variant="person" className="reserve-messenger-row-icon" />;
    } else if (row.type === 'SUPPORT') {
        icon = <SupportAvatar className="reserve-messenger-row-icon" />;
    } else if (row.storeImageUrl) {
        icon = <MessengerAvatar imageSrc={row.storeImageUrl} variant="store" className="reserve-messenger-row-icon" />;
    } else {
        icon = <span className="reserve-messenger-row-icon" aria-hidden="true"><ShopOutlined /></span>;
    }
    return (
        <button type="button" className={`reserve-messenger-row${selected ? ' is-selected' : ''}`}
            onClick={onSelect} aria-current={selected ? 'true' : undefined}>
            {icon}
            <span className="reserve-messenger-row-copy">
                <span className="reserve-messenger-row-line">
                    <strong>{title}</strong>
                    <time dateTime={row.lastMessageAt || undefined}>{formatWhen(row.lastMessageAt)}</time>
                </span>
                {row.blocked && <span className="reserve-messenger-sr-only">차단됨</span>}
                <span className="reserve-messenger-row-preview">{preview}</span>
            </span>
            {unread > 0 && <span className="reserve-messenger-unread" aria-label={`읽지 않은 메시지 ${unread}개`}>{unread > 99 ? '99+' : unread}</span>}
        </button>
    );
}

MessengerConversationRow.propTypes = {
    row: PropTypes.object.isRequired,
    selected: PropTypes.bool,
    owner: PropTypes.bool,
    onSelect: PropTypes.func.isRequired,
};
