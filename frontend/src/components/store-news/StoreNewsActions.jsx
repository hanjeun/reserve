import PropTypes from 'prop-types';
import InterfaceIcon from '../common/InterfaceIcon';
import IconTool from '../common/IconTool';

export function StoreNewsWriteAction({ onWrite, unavailableReason = '' }) {
    return <IconTool label="가게 소식 작성" icon={<InterfaceIcon name="compose" />}
        onClick={onWrite} unavailableReason={unavailableReason} />;
}
StoreNewsWriteAction.propTypes = { onWrite: PropTypes.func.isRequired, unavailableReason: PropTypes.string };

export function StoreNewsManageAction() {
    return <IconTool label="내 가게 소식 관리" icon={<InterfaceIcon name="folder" />} to="/business?tab=news" />;
}
