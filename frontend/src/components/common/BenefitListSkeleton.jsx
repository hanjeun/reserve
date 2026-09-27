import Bone from './Bone';

/** 코드 청크/데이터 로딩 모두 같은 가게 소식 행을 사용한다. */
export default function BenefitListSkeleton() {
    return <div className="reserve-benefit-list" role="status" aria-label="가게 소식을 불러오는 중" aria-busy="true">
        {[1, 2, 3, 4, 5, 6].map(key => <div className="reserve-benefit-row reserve-benefit-row--skeleton" key={key} aria-hidden="true">
            <div className="reserve-benefit-media"><Bone height="100%" borderRadius={16} /></div>
            <div className="reserve-benefit-row-copy"><Bone width="70%" height={12} /><Bone width="55%" height={24} /><Bone width="85%" height={26} /></div>
        </div>)}
    </div>;
}
