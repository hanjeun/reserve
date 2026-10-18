import PropTypes from 'prop-types';
import FormModal from '../common/FormModal';
import Bone from '../common/Bone';
import SkeletonText from '../common/SkeletonText';

export default function StoreNewsEditorLoading({ open, onClose }) {
    return (
        <FormModal
            open={open}
            title="가게 소식"
            onClose={onClose}
            footer={null}
            width={740}
            rootClassName="reserve-feed-modal reserve-store-news-modal"
        >
            <div aria-label="가게 소식 작성 정보를 불러오는 중" aria-busy="true">
                {['소식을 올릴 가게', '소식 종류', '제목', '본문'].map((label, index) => (
                    <div key={label} style={{ marginBottom: 24 }} aria-hidden="true">
                        <SkeletonText>{label}</SkeletonText>
                        <Bone width="100%" height={index === 3 ? 160 : 44} style={{ marginTop: 8 }} />
                    </div>
                ))}
                <Bone width={96} height={36} />
            </div>
        </FormModal>
    );
}
StoreNewsEditorLoading.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };
