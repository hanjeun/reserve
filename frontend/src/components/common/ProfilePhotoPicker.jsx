import { useRef } from 'react';
import PropTypes from 'prop-types';
import Avatar from './Avatar';
import useMessage from '../../hooks/useMessage';
import { IMAGE_ACCEPT, imageFileError } from '../../utils/imageUploadPolicy';
import { animation, colors, fontSize } from '../../styles/tokens';

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Keep the existing account-photo control identical for account and feed photos. */
export default function ProfilePhotoPicker({ src, disabled = false, onSelect, label = '프로필 사진 변경', animate = false }) {
    const input = useRef(null);
    const { message } = useMessage();
    const select = event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || disabled) return;
        const error = imageFileError(file, PROFILE_IMAGE_MAX_BYTES);
        if (error) { message.error(error); return; }
        onSelect(file);
    };
    return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button type="button" className="reserve-profile-image-button" disabled={disabled} aria-label={label}
            onClick={() => input.current?.click()}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            <Avatar key={src ?? 'default'} src={src} size={80} style={animate ? { animation: animation.scaleSpringIn } : undefined} />
        </button>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} disabled={disabled} style={{ display: 'none' }} onChange={select} />
        <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>클릭하여 사진 변경</span>
    </div>;
}
ProfilePhotoPicker.propTypes = { src: PropTypes.string, disabled: PropTypes.bool, onSelect: PropTypes.func.isRequired,
    label: PropTypes.string, animate: PropTypes.bool };
