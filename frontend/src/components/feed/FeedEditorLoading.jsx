import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import SkeletonText from '../common/SkeletonText';
import { field } from '../../styles/tokens';

const Field = ({ label, height = field.height }) => <div style={{ marginBottom: 24 }} aria-hidden="true">
    <div style={{ marginBottom: 8 }}><SkeletonText>{label}</SkeletonText></div>
    <Bone height={height} borderRadius={field.radius} />
</div>;
Field.propTypes = { label: PropTypes.string.isRequired, height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) };

export function FeedProfileLoading() {
    return <div aria-label="프로필을 불러오는 중" aria-busy="true">
        <p className="reserve-feed-note"><SkeletonText>게시물과 댓글에 사용할 공개 닉네임을 정해주세요.</SkeletonText></p>
        <Field label="공개 닉네임" /><Field label="소개 (선택)" height={96} />
        <Field label="프로필 공개 범위" />
    </div>;
}

export default function FeedEditorLoading({ business = false }) {
    return <div aria-label="작성 정보를 불러오는 중" aria-busy="true">
        <div className="reserve-feed-photo-upload" aria-hidden="true">
            <p className="reserve-feed-photo-upload-label"><SkeletonText>피드 사진</SkeletonText></p>
            <Bone width={102} height={102} borderRadius={field.radius} />
            <p className="reserve-feed-note"><SkeletonText>사진을 불러오는 중</SkeletonText></p>
        </div>
        <Field label="글" height={160} />
        {business && <Field label="내 가게 연결 (선택)" />}
        <p className="reserve-feed-note"><SkeletonText>게시한 글과 사진은 누구나 볼 수 있어요.</SkeletonText></p>
    </div>;
}
FeedEditorLoading.propTypes = { business: PropTypes.bool };
