import Bone from '../common/Bone';

export default function MessengerThreadSkeleton() {
    return <output className="reserve-messenger-thread-skeleton" aria-label="대화를 불러오는 중" aria-busy="true">
        <div aria-hidden="true"><Bone width="65%" height={44} borderRadius={14} /><Bone width="50%" height={44} borderRadius={14} style={{ marginLeft: 'auto' }} /><Bone width="75%" height={44} borderRadius={14} /></div>
    </output>;
}
