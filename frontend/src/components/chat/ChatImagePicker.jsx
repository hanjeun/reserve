import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { PaperClipOutlined, CloseOutlined } from '../common/icons';
import { animation, colors, radius } from '../../styles/tokens';
import useExitAnimation from '../../hooks/useExitAnimation';
import useAuthStore from '../../store/useAuthStore';
import LoadingImage from '../common/LoadingImage';
import Tooltip from '../common/Tooltip';
import ChatAttachmentThumbnail from './ChatAttachmentThumbnail';

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const IMAGE_LABELS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF' };

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
        {url && (active ? <ChatAttachmentThumbnail key={url} file={file} url={url} />
            : <LoadingImage src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: radius.md }} />)}
        <Tooltip title="첨부 사진 제거"><button type="button" className="reserve-chat-tool" aria-label="첨부 사진 제거"
            disabled={disabled || !active} onClick={onRemove}><CloseOutlined /></button></Tooltip>
    </div>;
}
AnimatedAttachment.propTypes = { file: PropTypes.object.isRequired, active: PropTypes.bool.isRequired,
    closing: PropTypes.bool.isRequired, disabled: PropTypes.bool, onRemove: PropTypes.func.isRequired };

export default function ChatImagePicker({ file, onChange, disabled, enabled, onFilesChange,
    accept = IMAGE_TYPES, maxBytes = 8 * 1024 * 1024 }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const input = useRef(null);
    const selecting = useRef(false);
    const [error, setError] = useState('');
    const [retained, setRetained] = useState({ file, revision, version: 0 });
    if (revision !== retained.revision || (file && file !== retained.file)) {
        setRetained({ file, revision, version: retained.version + 1 });
    }
    const { shouldRender, isClosing } = useExitAnimation(Boolean(file), 200);
    const select = async event => {
        const selected = Array.from(event.target.files || []);
        event.target.value = '';
        if (!selected.length || disabled || selecting.current) return;
        const types = accept.split(',').map(type => type.trim());
        if (selected.some(image => !types.includes(image.type))) {
            setError(`${types.map(type => IMAGE_LABELS[type]).filter(Boolean).join(', ')} 사진을 선택해주세요.`);
            return;
        }
        if (selected.some(image => image.size > maxBytes)) { setError(`사진은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하로 올려주세요.`); return; }
        selecting.current = true;
        try { setError(''); await (onFilesChange ? onFilesChange(selected) : onChange(selected[0])); }
        finally { selecting.current = false; }
    };
    if (!enabled) return null;
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <input ref={input} type="file" accept={accept} multiple={Boolean(onFilesChange)}
            onChange={select} disabled={disabled} hidden aria-label="첨부할 사진 선택" />
        <Tooltip title="사진 첨부"><button type="button" className="reserve-chat-tool" aria-label="사진 첨부"
            disabled={disabled} onClick={() => input.current?.click()}><PaperClipOutlined /></button></Tooltip>
        {shouldRender && retained.file && retained.revision === revision && <AnimatedAttachment key={`${revision}:${retained.version}`}
            file={retained.file} active={Boolean(file) && !isClosing} closing={isClosing || !file}
            disabled={disabled} onRemove={() => { setError(''); onChange(null); }} />}
        {error && <span role="alert" style={{ color: colors.error.main, fontSize: 12, flexBasis: '100%' }}>{error}</span>}
    </div>;
}
ChatImagePicker.propTypes = {
    file: PropTypes.object, onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool, enabled: PropTypes.bool,
    onFilesChange: PropTypes.func, accept: PropTypes.string, maxBytes: PropTypes.number,
};
