import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { BellOutlined } from '../common/icons';
import IconTool from '../common/IconTool';
import { chatListQueryPolicy } from './chatListQueryPolicy';
import { chatUnreadCounts } from './chatUnread';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';

export default function ReservationNotificationShortcut({ buttonRef, active, disabled, onSelect, pollUnread }) {
    const { data } = useQuery({ queryKey: chatKeys.unread(), queryFn: chatService.getUnread,
        ...chatListQueryPolicy, enabled: pollUnread, staleTime: 30_000 });
    const { notifications: unread } = chatUnreadCounts(data);
    return <span ref={buttonRef} className="reserve-messenger-notification-shortcut">
        <IconTool label={unread > 0 ? `알림 보기, 읽지 않은 알림 ${unread}개` : '알림 보기'}
            icon={<BellOutlined />} active={active} disabled={disabled} onClick={onSelect} />
        {unread > 0 && <span className="reserve-messenger-unread" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </span>;
}
ReservationNotificationShortcut.propTypes = {
    buttonRef: PropTypes.object.isRequired, active: PropTypes.bool.isRequired, disabled: PropTypes.bool,
    onSelect: PropTypes.func.isRequired, pollUnread: PropTypes.bool.isRequired,
};
