import PropTypes from 'prop-types';
import { colors, fontSize } from '../../styles/tokens';

export default function ProfilePhotoResetButton({ disabled = false, onClick, children = '기본 이미지로 변경' }) {
    return <button type="button" onClick={onClick} disabled={disabled} style={{
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: fontSize.sm, color: colors.text.tertiary, textDecoration: 'underline',
        textUnderlineOffset: '3px', padding: '2px 0', marginTop: -2, opacity: disabled ? 0.5 : 1,
    }}>{children}</button>;
}

ProfilePhotoResetButton.propTypes = { disabled: PropTypes.bool, onClick: PropTypes.func.isRequired, children: PropTypes.node };
