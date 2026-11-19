import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { BellOffOutlined, BellOutlined } from '../common/icons';
import IconTool from '../common/IconTool';
import { chatListQueryPolicy } from './chatListQueryPolicy';
import { chatUnreadCounts } from './chatUnread';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';

export default function ReservationNotificationShortcut({ buttonRef, active, disabled, onSelect, pollUnread, hidden, controls }) {
    const { data } = useQuery({ queryKey: chatKeys.unread(), queryFn: chatService.getUnread,
        ...chatListQueryPolicy, enabled: pollUnread, staleTime: 30_000 });
    const { notifications: unread } = chatUnreadCounts(data);
    const label = hidden === undefined ? '알림 보기' : hidden ? '알림 대화 표시하기' : '알림 대화 숨기기';
    const hasBadge = !hidden && unread > 0;
    return <span ref={buttonRef} className="reserve-messenger-notification-shortcut">
        <IconTool label={hasBadge ? label + `, 읽지 않은 알림 ${unread}개` : label}
            icon={hidden ? <BellOffOutlined aria-hidden="true" /> : <BellOutlined aria-hidden="true" />}
            active={active} controls={controls} disabled={disabled} onClick={onSelect} />
        {hasBadge && <span className="reserve-messenger-unread" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </span>;
}
ReservationNotificationShortcut.propTypes = {
    buttonRef: PropTypes.object.isRequired, active: PropTypes.bool.isRequired, disabled: PropTypes.bool,
    onSelect: PropTypes.func.isRequired, pollUnread: PropTypes.bool.isRequired,
    hidden: PropTypes.bool, controls: PropTypes.string,
};
