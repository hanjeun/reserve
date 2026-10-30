import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { PaperClipOutlined, CloseOutlined } from '../common/icons';
import { animation, colors, radius } from '../../styles/tokens';
import useExitAnimation from '../../hooks/useExitAnimation';
import useAuthStore from '../../store/useAuthStore';
import LoadingImage from '../common/LoadingImage';
import ChatAttachmentThumbnail from './ChatAttachmentThumbnail';

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const IMAGE_LABELS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF' };

const EMPTY_FILES = [];

function AnimatedAttachment({ file, active, disabled, onRemove, itemKey, onExited, label }) {
    const [url, setUrl] = useState(null);
    const [ready, setReady] = useState(false);
    const imageReady = useCallback(() => setReady(true), []);
    const { shouldRender, isClosing } = useExitAnimation(active, 200);
    useEffect(() => {
        if (!shouldRender) onExited(itemKey);
    }, [shouldRender, itemKey, onExited]);
    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        let mounted = true;
        queueMicrotask(() => { if (mounted) setUrl(objectUrl); });
        return () => { mounted = false; URL.revokeObjectURL(objectUrl); };
    }, [file]);
    if (!shouldRender) return null;
    return <div className="reserve-chat-attachment" aria-hidden={!active || undefined}
        inert={!active ? true : undefined}
        data-ready={ready}
        style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 92, height: 44,
            opacity: active && !ready ? 0 : undefined,
            animation: isClosing || !active ? animation.slideUpOut : ready ? animation.slideUpIn : 'none' }}>
        {url && (active ? <ChatAttachmentThumbnail key={url} file={file} url={url} onReady={imageReady} />
            : <LoadingImage src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: radius.md }} />)}
        <button type="button" className="reserve-chat-tool" aria-label={label}
            disabled={disabled || !active} onClick={onRemove}><CloseOutlined /></button>
    </div>;
}
AnimatedAttachment.propTypes = { file: PropTypes.object.isRequired, active: PropTypes.bool.isRequired,
    disabled: PropTypes.bool, onRemove: PropTypes.func.isRequired, itemKey: PropTypes.number.isRequired,
    onExited: PropTypes.func.isRequired, label: PropTypes.string.isRequired };

export default function ChatImagePicker({ file, onChange, disabled, enabled, onFilesChange,
    files, onRemoveFile, maxFiles = 3, renderContent,
    accept = IMAGE_TYPES, maxBytes = 8 * 1024 * 1024 }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const input = useRef(null);
    const selecting = useRef(false);
    const [error, setError] = useState('');
    const selectedFiles = files ?? (file ? [file] : EMPTY_FILES);
    const [retained, setRetained] = useState(() => ({ revision, files: selectedFiles,
        entries: selectedFiles.map((image, key) => ({ file: image, key })), next: selectedFiles.length }));
    if (revision !== retained.revision) {
        setRetained({ revision, files: selectedFiles, entries: selectedFiles.map((image, key) => ({ file: image, key })), next: selectedFiles.length });
    } else if (selectedFiles.length !== retained.files.length || selectedFiles.some((image, index) => image !== retained.files[index])) {
        let next = retained.next;
        const additions = selectedFiles.filter(image => !retained.entries.some(entry => entry.file === image))
            .map(image => ({ file: image, key: next++ }));
        setRetained({ revision, files: selectedFiles, entries: [...retained.entries, ...additions], next });
    }
    const retire = useCallback(key => setRetained(current => ({ ...current,
        entries: current.entries.filter(entry => entry.key !== key || current.files.includes(entry.file)) })), []);
    const select = async event => {
        const selected = Array.from(event.target.files || []);
        event.target.value = '';
        if (!selected.length || disabled || selecting.current) return;
        if (files && selected.length + files.length > maxFiles) { setError(`사진은 ${maxFiles}장까지 첨부할 수 있어요.`); return; }
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
    if (!enabled) return renderContent ? renderContent(null, null) : null;
    const control = <>
        <input ref={input} type="file" accept={accept} multiple={Boolean(onFilesChange)}
            onChange={select} disabled={disabled} hidden aria-label="첨부할 사진 선택" />
        <button type="button" className="reserve-chat-tool" aria-label="사진 첨부"
            disabled={disabled || Boolean(files && files.length >= maxFiles)} onClick={() => input.current?.click()}><PaperClipOutlined /></button>
    </>;
    const previews = retained.entries.length || error ? <div className="reserve-chat-attachments" aria-label="첨부 사진">
        {retained.revision === revision && retained.entries.map(entry => <AnimatedAttachment key={`${revision}:${entry.key}`}
            itemKey={entry.key} onExited={retire} file={entry.file} active={selectedFiles.includes(entry.file)} disabled={disabled}
            label={files ? `첨부 사진 제거: ${entry.file.name}` : '첨부 사진 제거'}
            onRemove={() => { setError(''); if (onRemoveFile) onRemoveFile(entry.file); else onChange(null); }} />)}
        {error && <span role="alert" style={{ color: colors.error.main, fontSize: 12, flexBasis: '100%' }}>{error}</span>}
    </div> : null;
    if (renderContent) return renderContent(control, previews);
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        {control}{previews}
    </div>;
}
ChatImagePicker.propTypes = {
    file: PropTypes.object, onChange: PropTypes.func,
    disabled: PropTypes.bool, enabled: PropTypes.bool,
    onFilesChange: PropTypes.func, accept: PropTypes.string, maxBytes: PropTypes.number,
    files: PropTypes.arrayOf(PropTypes.object), onRemoveFile: PropTypes.func, maxFiles: PropTypes.number, renderContent: PropTypes.func,
};
