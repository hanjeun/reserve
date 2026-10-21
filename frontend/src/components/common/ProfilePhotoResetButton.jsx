import PropTypes from 'prop-types';
import UnderlinedTextButton from './UnderlinedTextButton';

export default function ProfilePhotoResetButton({ disabled = false, onClick, children = '기본 이미지로 변경' }) {
    return <UnderlinedTextButton onClick={onClick} disabled={disabled}>{children}</UnderlinedTextButton>;
}

ProfilePhotoResetButton.propTypes = { disabled: PropTypes.bool, onClick: PropTypes.func.isRequired, children: PropTypes.node };
