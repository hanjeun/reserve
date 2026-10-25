import PropTypes from 'prop-types';
import { Typography } from 'antd';
import SkeletonText from './SkeletonText';

/* 페이지 제목의 반응형 크기만 공유하고 섹션·카드 제목과 구분한다. */
export function PageTitle({ className, level = 2, children, loading = false, ...props }) {
    return <Typography.Title {...props} level={level}
        className={['reserve-page-title', className].filter(Boolean).join(' ')}><SkeletonText loading={loading}>{children}</SkeletonText></Typography.Title>;
}

export function PageDescription({ className, children, loading = false, ...props }) {
    return <Typography.Paragraph {...props}
        className={['reserve-page-description', className].filter(Boolean).join(' ')}><SkeletonText loading={loading}>{children}</SkeletonText></Typography.Paragraph>;
}

export function SkeletonPageTitle({ children, ...props }) {
    return <PageTitle {...props} loading>{children}</PageTitle>;
}
export function SkeletonPageDescription({ children, ...props }) {
    return <PageDescription {...props} loading>{children}</PageDescription>;
}

PageTitle.propTypes = {
    className: PropTypes.string,
    level: PropTypes.oneOf([1, 2, 3, 4, 5]),
    children: PropTypes.node,
    loading: PropTypes.bool,
};
PageDescription.propTypes = { className: PropTypes.string, children: PropTypes.node, loading: PropTypes.bool };
SkeletonPageTitle.propTypes = { children: PropTypes.node };
SkeletonPageDescription.propTypes = { children: PropTypes.node };
