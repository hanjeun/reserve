import PropTypes from 'prop-types';
import { colors, fontSize } from '../../styles/tokens';
import SkeletonText from './SkeletonText';

export default function UnderlinedTextButton({ disabled = false, loading = false, onClick, children, ...props }) {
    const style = {
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: fontSize.sm, color: colors.text.tertiary, textDecoration: 'underline',
        textUnderlineOffset: '3px', padding: '2px 0', marginTop: -2, opacity: disabled ? 0.5 : 1,
    };
    if (loading) return <span aria-hidden="true" style={{ ...style, display: 'inline-block', cursor: undefined }}>
        <SkeletonText>{children}</SkeletonText>
    </span>;
    return <button {...props} type="button" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

UnderlinedTextButton.propTypes = {
    disabled: PropTypes.bool, loading: PropTypes.bool, onClick: PropTypes.func, children: PropTypes.node.isRequired,
};
