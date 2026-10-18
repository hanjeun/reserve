import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Upload } from 'antd';
import LoadingUpload from './LoadingUpload';
import ImageUploadButton from './ImageUploadButton';
import Button from './Button';
import useImagePreview from '../../hooks/useImagePreview';
import { IMAGE_ACCEPT, imageFileError } from '../../utils/imageUploadPolicy';
import { colors, fontSize } from '../../styles/tokens';

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** The same picture-card control as store/post photos; each owner keeps its existing save API. */
export default function ProfilePhotoUpload({ src, disabled = false, onSelect, label = '프로필 사진' }) {
    const selecting = useRef(false);
    const [error, setError] = useState('');
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    const files = src ? [{ uid: 'profile-photo', name: label, status: 'done', url: src, thumbUrl: src }] : [];
    const select = async file => {
        if (disabled || selecting.current) return Upload.LIST_IGNORE;
        const error = imageFileError(file, PROFILE_IMAGE_MAX_BYTES);
        if (error) { setError(error); return Upload.LIST_IGNORE; }
        selecting.current = true;
        setError('');
        try { await onSelect(file); }
        finally { selecting.current = false; }
        return Upload.LIST_IGNORE;
    };
    return <div style={{ width: '100%' }}>
        <LoadingUpload listType="picture-card" fileList={files} maxCount={1} multiple={false}
            accept={IMAGE_ACCEPT} disabled={disabled} aria-label={label} beforeUpload={select}
            onClickCapture={suppressLinkNavigation} onPreview={file => handlePreview(file, files)}
            showUploadList={{ showPreviewIcon: true, showRemoveIcon: false, showDownloadIcon: false }}>
            <Button variant="ghost" aria-label={`${label} 선택`} disabled={disabled}
                style={{ width: '100%', height: '100%', padding: 0, borderRadius: 'inherit', fontSize: 'inherit' }}>
                <ImageUploadButton />
            </Button>
        </LoadingUpload>
        <p style={{ margin: '4px 0 0', fontSize: fontSize.xs, color: colors.text.tertiary }}>한 장 · 5MB 이하</p>
        {error && <p role="alert" style={{ margin: '8px 0 0', color: colors.error.main, fontSize: fontSize.sm }}>{error}</p>}
        {previewNode}
    </div>;
}
ProfilePhotoUpload.propTypes = { src: PropTypes.string, disabled: PropTypes.bool, onSelect: PropTypes.func.isRequired, label: PropTypes.string };
