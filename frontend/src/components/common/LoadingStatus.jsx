import PropTypes from 'prop-types';

/** Keep visual loading markup outside output's phrasing-only content model. */
const LoadingStatus = ({ as: Container = 'div', children, 'aria-label': label, ...props }) => (
    <Container {...props}>
        <output className="reserve-sr-only" aria-label={label}
            aria-live="polite" aria-atomic="true" aria-busy={props['aria-busy']}>
            {label}
        </output>
        {children}
    </Container>
);

LoadingStatus.propTypes = {
    as: PropTypes.oneOf(['div', 'section']),
    children: PropTypes.node,
    'aria-label': PropTypes.string.isRequired,
    'aria-busy': PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
};

export default LoadingStatus;
