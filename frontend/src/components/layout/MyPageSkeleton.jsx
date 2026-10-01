import Bone from '../common/Bone';
import { field } from '../../styles/tokens/field';

const ROWS = ['one', 'two', 'three', 'four'];

// 카드형 골격을 추가하기 전 사용하던 제목·입력칸 형태를 그대로 복원한다.
export default function MyPageSkeleton() {
    return (
        <div className="reserve-route-skeleton-form">
            <Bone width="55%" height={24} />
            {ROWS.map(key => <Bone key={key} height={field.height} borderRadius={field.radius} />)}
        </div>
    );
}
