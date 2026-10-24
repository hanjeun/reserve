import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

/** Neutral text navigation shares the footer's hover and keyboard focus treatment. */
export default function TextLink({ to, href, className = '', children, ...props }) {
    const Component = to == null ? 'a' : Link;
    const destination = to == null ? { href } : { to };
    return <Component {...props} {...destination} className={`reserve-text-link ${className}`.trim()}>
        {children}
    </Component>;
}

TextLink.propTypes = {
    to: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    href: PropTypes.string,
    className: PropTypes.string,
    children: PropTypes.node.isRequired,
};
