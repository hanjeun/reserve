import Bone from './Bone';

// 상세 데이터와 청크 로딩에서 같은 골격을 사용한다.
// 모듈·데이터 로딩에서 같은 배치를 사용하며 상태 알림은 호출부가 담당한다.
export default function BenefitDetailSkeleton(props) {
    return (
        <section className="reserve-benefits-page reserve-benefit-detail" {...props}>
            <div className="reserve-route-skeleton-copy" aria-hidden="true">
                <div className="reserve-page-title ant-typography" style={{ width: '80%', margin: 0 }}><Bone width="100%" height="1.4em" /></div>
                <Bone width="45%" height={20} />
                <Bone height={180} borderRadius={12} />
                <Bone width="90%" height={14} />
                <Bone width="80%" height={14} />
            </div>
        </section>
    );
}
