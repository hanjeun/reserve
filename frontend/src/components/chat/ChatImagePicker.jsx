import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { PaperClipOutlined, CloseOutlined } from '@ant-design/icons';
import { animation, colors, radius } from '../../styles/tokens';
import useImagePreview from '../../hooks/useImagePreview';
import useExitAnimation from '../../hooks/useExitAnimation';
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

function AnimatedAttachment({ file, active, closing, disabled, onRemove }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        let mounted = true;
        queueMicrotask(() => { if (mounted) setUrl(objectUrl); });
        return () => { mounted = false; URL.revokeObjectURL(objectUrl); };
    }, [file]);
    return <div className="reserve-chat-attachment" aria-hidden={!active || undefined}
        inert={!active ? true : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 4,
            animation: closing ? animation.slideUpOut : animation.slideUpIn }}>
        {url && (active ? <AttachmentThumbnail key={url} file={file} url={url} />
            : <img src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: radius.md }} />)}
        <button type="button" className="reserve-chat-tool" aria-label="첨부 사진 제거"
            disabled={disabled || !active} onClick={onRemove}><CloseOutlined /></button>
    </div>;
}
AnimatedAttachment.propTypes = { file: PropTypes.object.isRequired, active: PropTypes.bool.isRequired,
    closing: PropTypes.bool.isRequired, disabled: PropTypes.bool, onRemove: PropTypes.func.isRequired };

export default function ChatImagePicker({ file, onChange, disabled, enabled }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const input = useRef(null);
    const [error, setError] = useState('');
    const [retained, setRetained] = useState({ file, revision, version: 0 });
    if (revision !== retained.revision || (file && file !== retained.file)) {
        setRetained({ file, revision, version: retained.version + 1 });
    }
    const { shouldRender, isClosing } = useExitAnimation(Boolean(file), 200);
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
        {shouldRender && retained.file && retained.revision === revision && <AnimatedAttachment key={`${revision}:${retained.version}`}
            file={retained.file} active={Boolean(file) && !isClosing} closing={isClosing || !file}
            disabled={disabled} onRemove={() => { setError(''); onChange(null); }} />}
        {error && <span role="alert" style={{ color: colors.error.main, fontSize: 12, flexBasis: '100%' }}>{error}</span>}
    </div>;
}
ChatImagePicker.propTypes = {
    file: PropTypes.object, onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool, enabled: PropTypes.bool,
};
