import PropTypes from 'prop-types';
import InterfaceIcon from '../common/InterfaceIcon';
import IconTool from '../common/IconTool';
import useAuthStore from '../../store/useAuthStore';
import { storeNewsManagementPath } from '../../utils/storeNews';

export function StoreNewsWriteAction({ onWrite, unavailableReason = '' }) {
    return <IconTool label="가게 소식 작성" icon={<InterfaceIcon name="compose" />}
        onClick={onWrite} unavailableReason={unavailableReason} />;
}
StoreNewsWriteAction.propTypes = { onWrite: PropTypes.func.isRequired, unavailableReason: PropTypes.string };

export function StoreNewsManageAction() {
    const user = useAuthStore(state => state.user);
    return <IconTool label="내 가게 소식 관리" icon={<InterfaceIcon name="folder" />} to={storeNewsManagementPath(user)} />;
}
