import PropTypes from 'prop-types';
import FormModal from '../common/FormModal';
import Bone from '../common/Bone';
import SkeletonText from '../common/SkeletonText';

/** 작성기 다운로드 중에도 실제 모달의 폭·필드 위치를 유지한다. */
export default function FeedModalLoading({ open, onClose, kind = 'compose' }) {
    const profile = kind === 'profile';
    const report = kind === 'report';
    const fields = profile ? ['공개 닉네임', '소개'] : report ? ['신고 이유', '추가 설명'] : ['글', '지역 (선택)'];
    return (
        <FormModal
            title={profile ? '피드 공개 프로필' : report ? '게시물 신고' : '피드 글쓰기'}
            open={open}
            onClose={onClose}
            footer={null}
            width={profile || report ? 520 : 680}
            rootClassName="reserve-feed-modal"
        >
            <div aria-label="피드 작성 화면을 불러오는 중" aria-busy="true">
                {(profile || report) && (
                    <div className="reserve-feed-note" aria-hidden="true">
                        <Bone height={18} />
                        <Bone height={18} style={{ marginTop: 4 }} />
                    </div>
                )}
                {fields.map((label, index) => (
                    <div key={label} style={{ marginBottom: 24 }} aria-hidden="true">
                        <SkeletonText>{label}</SkeletonText>
                        <Bone
                            height={
                                !profile && !report && index === 0 ? 160 : index === 1 && (profile || report) ? 96 : 44
                            }
                            style={{ marginTop: 8 }}
                        />
                    </div>
                ))}
                <Bone width={96} height={44} />
            </div>
        </FormModal>
    );
}
FeedModalLoading.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    kind: PropTypes.oneOf(['compose', 'profile', 'report']),
};
