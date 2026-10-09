import PropTypes from 'prop-types';
import { Typography } from 'antd';

/** Page headings share one responsive type scale; section and card titles keep their own scale. */
export function PageTitle({ className, level = 2, children, ...props }) {
    return <Typography.Title {...props} level={level}
        className={['reserve-page-title', className].filter(Boolean).join(' ')}>{children}</Typography.Title>;
}

export function PageDescription({ className, children, ...props }) {
    return <Typography.Paragraph {...props}
        className={['reserve-page-description', className].filter(Boolean).join(' ')}>{children}</Typography.Paragraph>;
}

PageTitle.propTypes = {
    className: PropTypes.string,
    level: PropTypes.oneOf([1, 2, 3, 4, 5]),
    children: PropTypes.node,
};
PageDescription.propTypes = { className: PropTypes.string, children: PropTypes.node };
