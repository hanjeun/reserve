import PropTypes from 'prop-types';
import { fontSize } from '../../styles/tokens';
import SkeletonText from './SkeletonText';

export default function UnderlinedTextButton({ disabled = false, loading = false, onClick, className = '', children, ...props }) {
    const textClassName = `reserve-text-link ${className}`.trim();
    const style = {
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: fontSize.sm, padding: '2px 0', marginTop: -2, opacity: disabled ? 0.5 : 1,
    };
    if (loading) return <span aria-hidden="true" className={textClassName} style={{ ...style, display: 'inline-block', cursor: undefined }}>
        <SkeletonText>{children}</SkeletonText>
    </span>;
    return <button {...props} type="button" className={textClassName} onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

UnderlinedTextButton.propTypes = {
    disabled: PropTypes.bool, loading: PropTypes.bool, onClick: PropTypes.func, className: PropTypes.string, children: PropTypes.node.isRequired,
};
