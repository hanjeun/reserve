import PropTypes from 'prop-types';

export default function SvgIcon({ glyph: Glyph, filled = false, className, ...rest }) {
    return <svg {...rest} className={['reserve-interface-icon', className].filter(Boolean).join(' ')} width="1em" height="1em"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"><Glyph filled={filled} /></svg>;
}
SvgIcon.propTypes = { glyph: PropTypes.elementType.isRequired, filled: PropTypes.bool, className: PropTypes.string };
