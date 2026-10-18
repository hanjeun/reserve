import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import Tooltip from '../common/Tooltip';
import InterfaceIcon from '../common/InterfaceIcon';

export default function FeedItemMenu({ label, actions }) {
    const [open, setOpen] = useState(false);
    const trigger = useRef(null);
    const available = actions.filter(Boolean);
    if (!available.length) return null;
    return <Dropdown trigger={['click']} placement="bottomRight" autoFocus open={open} onOpenChange={setOpen}
        menu={{ className: 'reserve-feed-item-menu', items: available.map(item => ({ key: item.key, label: item.label,
            danger: item.danger, icon: <InterfaceIcon name={item.icon} /> })), onClick: ({ key }) => {
            setOpen(false); trigger.current?.focus({ preventScroll: true }); available.find(item => item.key === key)?.onClick();
        } }}>
        <Tooltip title={label} disabled={open}><button ref={trigger} type="button" className="reserve-feed-more"
            aria-label={label} aria-haspopup="menu" aria-expanded={open} data-discovery-swipe-ignore="true"
            onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
            <InterfaceIcon name="more" />
        </button></Tooltip>
    </Dropdown>;
}
FeedItemMenu.propTypes = { label: PropTypes.string.isRequired, actions: PropTypes.array.isRequired };
