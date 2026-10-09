import { PageTitle, PageDescription } from './PageTypography';
import { useId } from 'react';
import PropTypes from 'prop-types';
import StateIllustration, { StateIllustrationSkeleton } from './StateIllustration';
import PageContainer from './PageContainer';
import Bone from './Bone';

/**
 * 화면 전체가 "이 주소에는 보여 줄 페이지가 없다"거나 "화면을 그리다 실패했다"는 한 가지 사실만
 * 전하는 자리의 공통 틀이다. 404 페이지와 오류 경계 폴백이 같은 모양을 쓴다.
 *
 * 목록·상세 조회 결과의 빈 상태·실패는 DataState 가 맡는다. 이 틀은 페이지 자체가 없을 때만 쓴다.
 * 스켈레톤(PageStatusSkeleton)도 같은 컨테이너·여백을 써서 청크 로딩 → 실제 화면 전환 때
 * 높이가 튀거나 푸터가 들썩이지 않게 한다.
 */
const PAGE_STATUS_PADDING_TOP = 'clamp(56px, 14vh, 128px)';

export default function PageStatus({ icon, illustration, title, description, actions, role, className }) {
    const titleId = useId();
    return (
        <PageContainer size="sm" center paddingTop={PAGE_STATUS_PADDING_TOP} className={['reserve-page-status-page', className].filter(Boolean).join(' ')}>
            <section className="reserve-page-status" role={role} aria-labelledby={titleId}>
                {illustration ? <span className="reserve-page-status__illustration"><StateIllustration name={illustration} size="lg" fallback={icon} interactive /></span>
                    : icon && <span className="reserve-page-status__icon" aria-hidden="true">{icon}</span>}
                <PageTitle level={1} id={titleId} className="reserve-page-status__title">{title}</PageTitle>
                {description && <PageDescription className="reserve-page-status__description">{description}</PageDescription>}
                {actions && <div className="reserve-page-status__actions">{actions}</div>}
            </section>
        </PageContainer>
    );
}

PageStatus.propTypes = {
    icon: PropTypes.node,
    illustration: PropTypes.string,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    actions: PropTypes.node,
    role: PropTypes.string,
    className: PropTypes.string,
};

/** PageStatus 와 같은 폭·여백·줄 수의 골격. 버튼·링크는 그리지 않는다. */
export function PageStatusSkeleton() {
    return (
        <PageContainer size="sm" center paddingTop={PAGE_STATUS_PADDING_TOP} className="reserve-page-status-page">
            <div className="reserve-page-status">
                <StateIllustrationSkeleton />
                <div className="reserve-page-title ant-typography" style={{ width: '62%', margin: '4px 0 0' }} aria-hidden="true"><Bone width="100%" height="1.4em" /></div>
                <div className="reserve-page-description ant-typography" style={{ width: '84%' }} aria-hidden="true"><Bone width="100%" height="1.65em" /></div>
                <div className="reserve-page-status__actions">
                    <Bone width={112} height={44} borderRadius={16} />
                    <Bone width={112} height={44} borderRadius={16} />
                </div>
            </div>
        </PageContainer>
    );
}
