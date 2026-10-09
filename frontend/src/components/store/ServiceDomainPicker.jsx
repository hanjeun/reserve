import PropTypes from 'prop-types';
import IconChoicePicker from '../common/IconChoicePicker';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';
import ServiceDomainIcon from '../common/ServiceDomainIcon';

export default function ServiceDomainPicker({ value, selectedValue, onChange, id, disabled }) {
    return <IconChoicePicker value={value} selectedValue={selectedValue} onChange={onChange} id={id} disabled={disabled}
        label="서비스 분야" options={SERVICE_DOMAIN_OPTIONS.map(option => ({ ...option, icon: <ServiceDomainIcon domain={option.value} /> }))} />;
}
ServiceDomainPicker.propTypes = {
    value: PropTypes.string, selectedValue: PropTypes.string, onChange: PropTypes.func, id: PropTypes.string, disabled: PropTypes.bool,
};
