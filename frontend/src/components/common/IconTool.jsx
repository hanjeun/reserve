import { useId } from 'react';
import PropTypes from 'prop-types';
import Tooltip from './Tooltip';
import { Link } from 'react-router-dom';
import useMessage from '../../hooks/useMessage';
import { SpinIndicator } from './Loading';

/** 44px 터치 영역 안에 20px 아이콘·32px 면을 표시한다. 모양은 명시한 역할로 정한다. */
export default function IconTool({ label, icon, onClick, to, unavailableReason = '', active = false, expanded, disabled = false, loading = false, kind = 'tool' }) {
    const descriptionId = useId();
    const { message } = useMessage();
    const blocked = disabled || loading;
    const props = { className: `reserve-icon-tool${active ? ' is-active' : ''}`, 'aria-label': label, 'data-icon-kind': kind,
        'aria-haspopup': expanded === undefined ? undefined : 'dialog', 'aria-expanded': expanded,
        'aria-busy': loading || undefined, 'aria-disabled': blocked || Boolean(unavailableReason) || undefined,
        'aria-describedby': unavailableReason ? descriptionId : undefined };
    const click = event => {
        if (blocked || unavailableReason) {
            event.preventDefault();
            if (!blocked && unavailableReason) message.info(unavailableReason);
            return;
        }
        onClick?.(event);
    };
    const content = loading ? <span className="reserve-icon-tool-loading" aria-hidden="true"><SpinIndicator /></span> : icon;
    return <Tooltip title={unavailableReason || label} disabled={expanded === true}>
        <span className="reserve-icon-tool-wrapper">
            {to && !blocked ? <Link {...props} to={to} onClick={click}>{content}</Link> : <button {...props} type="button"
                disabled={blocked} onClick={click}>{content}</button>}
            {unavailableReason && <span id={descriptionId} className="reserve-discovery-visually-hidden">{unavailableReason}</span>}
        </span>
    </Tooltip>;
}
IconTool.propTypes = { label: PropTypes.string.isRequired, icon: PropTypes.node.isRequired,
    onClick: PropTypes.func, to: PropTypes.string, unavailableReason: PropTypes.string, active: PropTypes.bool, expanded: PropTypes.bool,
    disabled: PropTypes.bool, loading: PropTypes.bool, kind: PropTypes.oneOf(['navigation', 'tool']) };
