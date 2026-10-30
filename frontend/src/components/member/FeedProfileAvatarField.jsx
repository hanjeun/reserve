import PropTypes from 'prop-types';
import ProfilePhotoPicker from '../common/ProfilePhotoPicker';
import ProfilePhotoResetButton from '../common/ProfilePhotoResetButton';

export default function FeedProfileAvatarField({ value, onChange, accountImage, customImage, pendingImage, onSelect, onReset, disabled, id }) {
    const select = file => { onSelect(file); onChange('CUSTOM'); };
    const reset = source => { onReset(); onChange(source); };
    const preview = value === 'CUSTOM' ? pendingImage || customImage : value === 'ACCOUNT' ? accountImage : undefined;
    return <div id={id} style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
        <ProfilePhotoPicker src={preview} disabled={disabled} onSelect={select} label="피드 프로필 사진 변경" animate={Boolean(pendingImage)} />
        {value !== 'NONE' && <ProfilePhotoResetButton disabled={disabled} onClick={() => reset('NONE')} />}
        {value !== 'ACCOUNT' && <ProfilePhotoResetButton disabled={disabled} onClick={() => reset('ACCOUNT')}>계정 사진으로 되돌리기</ProfilePhotoResetButton>}
    </div>;
}
FeedProfileAvatarField.propTypes = { value: PropTypes.string, onChange: PropTypes.func, accountImage: PropTypes.string,
    customImage: PropTypes.string, pendingImage: PropTypes.string, onSelect: PropTypes.func.isRequired, onReset: PropTypes.func.isRequired,
    disabled: PropTypes.bool, id: PropTypes.string };
