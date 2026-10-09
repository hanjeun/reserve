import PropTypes from 'prop-types';
import { AppstoreOutlined, CalendarOutlined, ClockCircleOutlined, PictureOutlined, QrcodeOutlined, ShopOutlined, ProfileOutlined, WalletOutlined, RollbackOutlined } from '@ant-design/icons';
import IconChoicePicker from '../common/IconChoicePicker';
import { STORE_EDIT_SECTIONS, STORE_EDIT_SELECTION_HELP } from '../../utils/storeOnboarding';

const SECTION_ICONS = {
    industry: ShopOutlined,
    service: AppstoreOutlined,
    booking: CalendarOutlined,
    waiting: QrcodeOutlined,
    operation: ClockCircleOutlined,
    identity: PictureOutlined,
    'booking-policy': ProfileOutlined,
    deposit: WalletOutlined,
    refund: RollbackOutlined,
};
const SECTION_OPTIONS = STORE_EDIT_SECTIONS.map(section => {
    const Icon = SECTION_ICONS[section.value];
    return { ...section, icon: <Icon /> };
});

export default function StoreEditSelection({ onSelectStep, disabled = false }) {
    return <div className="reserve-onboarding-edit-selection">
        <p className="reserve-onboarding-help">{STORE_EDIT_SELECTION_HELP}</p>
        <IconChoicePicker label="수정할 항목" options={SECTION_OPTIONS}
            onChange={onSelectStep} disabled={disabled} />
    </div>;
}

StoreEditSelection.propTypes = {
    onSelectStep: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};
