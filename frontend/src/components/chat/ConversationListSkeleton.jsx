import { Bone } from '../common/Skeletons';

export default function ConversationListSkeleton() {
    return (
        <div role="status" aria-label="대화 목록을 불러오는 중" aria-busy="true">
            {[1, 2, 3].map(key => (
                <div className="reserve-messenger-skeleton-row" key={key} aria-hidden="true">
                    <Bone width={36} height={36} borderRadius="50%" />
                    <div><Bone width="65%" height={14} /><Bone width="90%" height={12} /></div>
                </div>
            ))}
        </div>
    );
}
