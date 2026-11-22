import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { DeleteOutlined, FileTextOutlined, PaperClipOutlined } from '../common/icons';
import { animation } from '../../styles/tokens';
import useExitAnimation from '../../hooks/useExitAnimation';
import useImagePreview from '../../hooks/useImagePreview';
import useReducedMotion from '../../hooks/useReducedMotion';
import useAuthStore from '../../store/useAuthStore';
import { chatAttachmentKind, formatChatFileSize, CHAT_DOCUMENT_ACCEPT, CHAT_PHOTO_ACCEPT } from '../../utils/chatAttachments';
import PhotoUploadThumbnail from '../common/PhotoUploadThumbnail';
import SortablePhotoList, { SortablePhotoItem } from '../common/SortablePhotoList';

const IMAGE_LABELS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF' };
const EMPTY_FILES = [];

function AnimatedAttachment({ file, active, disabled, onRemove, itemKey, onExited, label }) {
    const photo = chatAttachmentKind(file) === 'photo';
    const { previewOpen, handlePreview, handleCancel, previewNode } = useImagePreview();
    const reduced = useReducedMotion();
    const { shouldRender, isClosing } = useExitAnimation(active, reduced ? 0 : 200, !reduced);
    useEffect(() => {
        if (!shouldRender) onExited(itemKey);
    }, [shouldRender, itemKey, onExited]);
    if (!shouldRender) return null;
    if (photo) return <>
        <PhotoUploadThumbnail className="reserve-chat-attachment reserve-chat-draft-photo" file={file} alt="첨부 사진" active={active}
            animate={!reduced} onPreview={url => handlePreview({ url })} previewLabel="첨부 사진 크게 보기"
            onPreviewKeyDown={event => {
                if (event.key === 'Escape' && previewOpen) { event.stopPropagation(); handleCancel(); }
            }} onRemove={onRemove} removeLabel={label} removeDisabled={disabled} />
        {active && previewNode}
    </>;
    return <div className="reserve-chat-attachment reserve-chat-draft-file" inert={!active || undefined}
        style={{ animation: reduced ? undefined : isClosing || !active ? animation.slideUpOut : animation.slideUpIn }}>
        <FileTextOutlined aria-hidden="true" />
        <span className="reserve-chat-draft-file-copy">
            <span title={file.name}>{file.name}</span>
            <small>{formatChatFileSize(file.size)}</small>
        </span>
        <div className="reserve-chat-draft-tools" aria-hidden={!active || undefined}>
            <button type="button" className="reserve-chat-tool" aria-label={label}
                disabled={disabled || !active} onClick={onRemove}><DeleteOutlined aria-hidden="true" /></button>
        </div>
    </div>;
}
AnimatedAttachment.propTypes = { file: PropTypes.object.isRequired, active: PropTypes.bool.isRequired,
    disabled: PropTypes.bool, onRemove: PropTypes.func.isRequired, itemKey: PropTypes.number.isRequired,
    onExited: PropTypes.func.isRequired, label: PropTypes.string.isRequired };

export default function ChatImagePicker({ file, onChange, disabled, enabled, onFilesChange,
    files, onRemoveFile, onMovePhoto, maxFiles = 3, renderContent,
    accept = CHAT_PHOTO_ACCEPT, maxBytes = 8 * 1024 * 1024,
    allowDocuments = false, onStageFiles, draftScope }) {
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const revision = draftScope ?? sessionRevision;
    const input = useRef(null);
    const attach = useRef(null);
    const restoreAttachFocus = useRef(false);
    const selecting = useRef(false);
    const [error, setError] = useState('');
    const selectedFiles = files ?? (file ? [file] : EMPTY_FILES);
    const limitReached = Boolean(files && files.length >= maxFiles);
    useLayoutEffect(() => {
        if (!restoreAttachFocus.current || disabled || limitReached) return;
        restoreAttachFocus.current = false;
        attach.current?.focus({ preventScroll: true });
    }, [disabled, limitReached, selectedFiles.length]);
    const [retained, setRetained] = useState(() => ({ revision, files: selectedFiles,
        entries: selectedFiles.map((image, key) => ({ file: image, key })), next: selectedFiles.length }));
    if (revision !== retained.revision) {
        setRetained({ revision, files: selectedFiles, entries: selectedFiles.map((image, key) => ({ file: image, key })), next: selectedFiles.length });
    } else if (selectedFiles.length !== retained.files.length || selectedFiles.some((image, index) => image !== retained.files[index])) {
        let next = retained.next;
        const ordered = selectedFiles.map(image => retained.entries.find(entry => entry.file === image) ?? { file: image, key: next++ });
        let index = 0;
        // 퇴장 중인 칸은 그 자리에 두고 활성 사진의 키와 로컬 미리보기를 유지한다.
        const entries = retained.entries.map(entry => selectedFiles.includes(entry.file) ? ordered[index++] : entry);
        setRetained({ revision, files: selectedFiles, entries: entries.concat(ordered.slice(index)), next });
    }
    const retire = useCallback(key => setRetained(current => ({ ...current,
        entries: current.entries.filter(entry => entry.key !== key || current.files.includes(entry.file)) })), []);
    const select = async event => {
        const selected = Array.from(event.target.files || []);
        event.target.value = '';
        if (!selected.length || disabled || limitReached || selecting.current) return;
        if (onStageFiles) { onStageFiles(selected); return; }
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
    const attachmentLabel = allowDocuments ? '파일' : '사진';
    const control = <>
        <input ref={input} type="file" accept={allowDocuments ? accept + ',' + CHAT_DOCUMENT_ACCEPT : accept}
            multiple={Boolean(onStageFiles || onFilesChange)} onChange={select} disabled={disabled || limitReached}
            hidden aria-label={`첨부할 ${attachmentLabel} 선택`} />
        <button ref={attach} type="button" className="reserve-chat-tool" aria-label={`${attachmentLabel} 첨부`}
            disabled={disabled || limitReached}
            onClick={() => input.current?.click()}><PaperClipOutlined aria-hidden="true" /></button>
    </>;
    const entries = retained.entries.map(entry => ({ ...entry, id: `${revision}:${entry.key}`,
        active: selectedFiles.includes(entry.file), photo: chatAttachmentKind(entry.file) === 'photo' }));
    const photos = entries.filter(entry => entry.active && entry.photo);
    const canSort = Boolean(onMovePhoto) && !disabled && photos.length > 1;
    const previews = retained.entries.length || error ? <>
        <SortablePhotoList ids={photos.map(entry => entry.id)} disabled={!canSort} onMove={(from, to) => {
            const source = photos.find(entry => entry.id === from);
            const target = photos.find(entry => entry.id === to);
            if (source && target) onMovePhoto?.(source.file, target.file);
        }}>
            <div className="reserve-chat-attachments" aria-label={`첨부 ${attachmentLabel}`} data-discovery-swipe-ignore="true">
                {entries.map(entry => {
                    const attachment = <AnimatedAttachment key={entry.id} itemKey={entry.key} onExited={retire}
                        file={entry.file} active={entry.active} disabled={disabled}
                        label={files ? `${entry.photo ? '첨부 사진' : '첨부 파일'} 제거: ${entry.file.name}` : '첨부 사진 제거'}
                        onRemove={event => {
                            if (event.currentTarget === document.activeElement) restoreAttachFocus.current = true;
                            setError('');
                            if (onRemoveFile) onRemoveFile(entry.file);
                            else onChange(null);
                        }} />;
                    return entry.photo ? <SortablePhotoItem key={entry.id} id={entry.id}
                        className="reserve-chat-sortable-photo" disabled={!canSort || !entry.active}>{attachment}</SortablePhotoItem> : attachment;
                })}
            </div>
        </SortablePhotoList>
        {error && <span role="alert" className="reserve-chat-attachment-error">{error}</span>}
    </> : null;
    if (renderContent) return renderContent(control, previews, Boolean(selectedFiles.length || error));
    return <div className="reserve-chat-picker">
        {control}{previews}
    </div>;
}
ChatImagePicker.propTypes = {
    file: PropTypes.object, onChange: PropTypes.func,
    disabled: PropTypes.bool, enabled: PropTypes.bool,
    allowDocuments: PropTypes.bool, onStageFiles: PropTypes.func, draftScope: PropTypes.string,
    onFilesChange: PropTypes.func, accept: PropTypes.string, maxBytes: PropTypes.number,
    files: PropTypes.arrayOf(PropTypes.object), onRemoveFile: PropTypes.func, onMovePhoto: PropTypes.func,
    maxFiles: PropTypes.number, renderContent: PropTypes.func,
};
