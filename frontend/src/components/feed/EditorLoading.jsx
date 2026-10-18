import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import SkeletonText from '../common/SkeletonText';

/** 로딩 본문만 교체한다. 새 Modal을 열거나 닫지 않는다. */
export default function EditorLoading({ news = false }) {
    return <div aria-label="작성 정보를 불러오는 중" aria-busy="true">
        {news && ['소식을 올릴 가게', '소식 종류'].map(label => <div key={label} style={{ marginBottom: 24 }} aria-hidden="true">
            <SkeletonText>{label}</SkeletonText><Bone height={44} style={{ marginTop: 8 }} />
        </div>)}
        <Bone height={120} style={{ marginBottom: 24 }} />
        {(news ? ['제목', '본문'] : ['글', '지역 (선택)']).map((label, index) => <div key={label} style={{ marginBottom: 24 }} aria-hidden="true">
            <SkeletonText>{label}</SkeletonText><Bone height={news && index === 1 || !news && index === 0 ? 160 : 44} style={{ marginTop: 8 }} />
        </div>)}
    </div>;
}
EditorLoading.propTypes = { news: PropTypes.bool };
