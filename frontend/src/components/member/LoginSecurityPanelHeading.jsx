import PropTypes from 'prop-types';
import IconTool from '../common/IconTool';
import { CloseOutlined } from '../common/icons';

export default function LoginSecurityPanelHeading({ children, onClose, disabled }) {
    return <div className="reserve-login-panel-heading">
        {children}
        {onClose && <IconTool label="닫기" icon={<CloseOutlined aria-hidden="true" />} tooltip={false} disabled={disabled} onClick={onClose} />}
    </div>;
}

LoginSecurityPanelHeading.propTypes = { children: PropTypes.node.isRequired, onClose: PropTypes.func, disabled: PropTypes.bool };
