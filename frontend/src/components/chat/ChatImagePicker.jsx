import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { PaperClipOutlined, CloseOutlined } from '@ant-design/icons';
import { Button } from '../common';
import { colors, radius } from '../../styles/tokens';
import useImagePreview from '../../hooks/useImagePreview';
import useAuthStore from '../../store/useAuthStore';

function AttachmentThumbnail({ file, url }) {
    const { previewOpen, handlePreview, handleCancel, previewNode } = useImagePreview();
    return <>
        <button type="button" className="reserve-chat-attachment-preview" aria-label="첨부 사진 크게 보기"
            onKeyDown={event => {
                if (event.key === 'Escape' && previewOpen) {
                    event.stopPropagation();
                    handleCancel();
                }
            }}
            onClick={() => handlePreview({ originFileObj: file })}>
            <img src={url} alt="전송할 사진" style={{ width: 44, height: 44, objectFit: 'cover',
                borderRadius: radius.md, border: `1px solid ${colors.border.light}` }} />
        </button>
        {previewNode}
    </>;
}
AttachmentThumbnail.propTypes = { file: PropTypes.object.isRequired, url: PropTypes.string.isRequired };

export default function ChatImagePicker({ file, onChange, disabled, enabled }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const input = useRef(null);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);
    useEffect(() => {
        if (!file) return undefined;
        const url = URL.createObjectURL(file);
        Promise.resolve().then(() => setPreview({ file, url }));
        return () => URL.revokeObjectURL(url);
    }, [file]);
    const select = event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (!selected) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(selected.type)) {
            setError('JPG, PNG, WEBP, GIF 사진을 선택해주세요.');
        } else if (selected.size > 8 * 1024 * 1024) {
            setError('사진은 8MB 이하로 올려주세요.');
        } else {
            setError('');
            onChange(selected);
        }
    };
    if (!enabled) return null;
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={select} disabled={disabled} hidden aria-label="첨부할 사진 선택" />
        <button type="button" className="reserve-chat-tool" aria-label="사진 첨부"
            disabled={disabled} onClick={() => input.current?.click()}><PaperClipOutlined /></button>
        {file && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {preview?.file === file && <AttachmentThumbnail key={revision} file={file} url={preview.url} />}
            <Button variant="ghost" size="sm" style={{ width: 32, height: 32, padding: 0 }} icon={<CloseOutlined />} aria-label="첨부 사진 제거"
                disabled={disabled} onClick={() => { setError(''); onChange(null); }} />
        </div>}
        {error && <span role="alert" style={{ color: colors.error.main, fontSize: 12, flexBasis: '100%' }}>{error}</span>}
    </div>;
}
ChatImagePicker.propTypes = {
    file: PropTypes.object, onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool, enabled: PropTypes.bool,
};
