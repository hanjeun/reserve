import PropTypes from 'prop-types';
import { Button } from '../common';
import ProfilePhotoPicker from '../common/ProfilePhotoPicker';

export default function FeedProfileAvatarField({ value, onChange, accountImage, customImage, pendingImage, onSelect, onReset, disabled, id }) {
    const select = file => { onSelect(file); onChange('CUSTOM'); };
    const preview = value === 'CUSTOM' ? pendingImage || customImage : value === 'ACCOUNT' ? accountImage : undefined;
    return <div id={id} style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
        <ProfilePhotoPicker src={preview} disabled={disabled} onSelect={select} label="피드 프로필 사진 변경" animate={Boolean(pendingImage)} />
        {value !== 'ACCOUNT' && <Button variant="ghost-sm" disabled={disabled} onClick={() => { onReset(); onChange('ACCOUNT'); }}>계정 사진으로 되돌리기</Button>}
    </div>;
}
FeedProfileAvatarField.propTypes = { value: PropTypes.string, onChange: PropTypes.func, accountImage: PropTypes.string,
    customImage: PropTypes.string, pendingImage: PropTypes.string, onSelect: PropTypes.func.isRequired, onReset: PropTypes.func.isRequired,
    disabled: PropTypes.bool, id: PropTypes.string };
