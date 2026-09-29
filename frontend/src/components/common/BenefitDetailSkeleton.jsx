import Bone from './Bone';

// 가게 소식 상세(BenefitDetail)의 데이터 로딩 뼈대. 청크 로딩(RouteLoadingSkeleton)도 이것을 그대로 써서
// 코드 로딩 → 데이터 로딩으로 넘어갈 때 모양이 바뀌지 않는다(2026-09-29). 상태 알림(role=status)은 감싸는 쪽이 붙인다.
export default function BenefitDetailSkeleton(props) {
    return (
        <section className="reserve-benefits-page reserve-benefit-detail" {...props}>
            <div className="reserve-route-skeleton-copy" aria-hidden="true">
                <Bone width="30%" height={14} />
                <Bone width="80%" height={28} />
                <Bone height={180} borderRadius={12} />
                <Bone width="90%" height={14} />
                <Bone width="80%" height={14} />
            </div>
        </section>
    );
}
