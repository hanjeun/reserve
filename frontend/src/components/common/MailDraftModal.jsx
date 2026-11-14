import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Spin, Typography, Upload } from 'antd';
import FormModal, { FormField } from './FormModal';
import ImageUploadButton from './ImageUploadButton';
import MailPhotoStrip from './MailPhotoStrip';
import MailHtmlPreview from './MailHtmlPreview';
import useImagePreview from '../../hooks/useImagePreview';

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const { Paragraph } = Typography;

export default function MailDraftModal({
    title, open, onClose, validate, onSend, sending, sendText = '보내기', navigationDirty,
    previewFields, loadPreview, children,
}) {
    const [reviewing, setReviewing] = useState(false);
    const [photos, setPhotos] = useState([]);
    const [photoError, setPhotoError] = useState('');
    const [html, setHtml] = useState('');
    const [previewError, setPreviewError] = useState('');
    const [preparing, setPreparing] = useState(false);
    const previewRequest = useRef(null);
    const urls = useRef(new Set());
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    useEffect(() => {
        const activeUrls = urls.current;
        return () => { for (const url of activeUrls) URL.revokeObjectURL(url); };
    }, []);
    useEffect(() => {
        if (!open) previewRequest.current?.abort();
        return () => previewRequest.current?.abort();
    }, [open]);

    const afterClose = () => {
        for (const url of urls.current) URL.revokeObjectURL(url);
        urls.current.clear();
        setPhotos([]);
        setPhotoError('');
        setReviewing(false);
        setHtml('');
        setPreviewError('');
        setPreparing(false);
    };

    const edit = () => {
        previewRequest.current?.abort();
        setReviewing(false);
        setHtml('');
        setPreviewError('');
        setPreparing(false);
    };

    const selectPhotos = (file, batch) => {
        if (sending || batch[0] !== file) return Upload.LIST_IGNORE;
        if (photos.length + batch.length > MAX_PHOTOS) setPhotoError('사진은 최대 3장까지 첨부할 수 있어요.');
        else if (batch.some(photo => !PHOTO_TYPES.includes(photo.type) || !photo.size)) setPhotoError('JPG, PNG, WebP 사진을 첨부해주세요.');
        else if (batch.some(photo => photo.size > MAX_PHOTO_BYTES)) setPhotoError('사진은 한 장당 2MB 이하로 첨부해주세요.');
        else {
            setPhotoError('');
            const selected = batch.map(photo => {
                const url = URL.createObjectURL(photo);
                urls.current.add(url);
                return { uid: photo.uid, name: photo.name, status: 'done', url, thumbUrl: url, originFileObj: photo };
            });
            setPhotos(current => [...current, ...selected]);
        }
        return Upload.LIST_IGNORE;
    };

    const removePhoto = photo => {
        URL.revokeObjectURL(photo.url);
        urls.current.delete(photo.url);
        setPhotos(current => current.filter(item => item.uid !== photo.uid));
        setPhotoError('');
        return false;
    };

    const submit = async () => {
        if (sending || preparing) return;
        if (reviewing && html) {
            onSend(photos.map(photo => photo.originFileObj));
            return;
        }
        if (!validate()) return;
        const controller = new AbortController();
        previewRequest.current?.abort();
        previewRequest.current = controller;
        setReviewing(true);
        setPreparing(true);
        setPreviewError('');
        try {
            const result = await loadPreview(controller.signal);
            if (!controller.signal.aborted) setHtml(result);
        } catch (error) {
            if (!controller.signal.aborted) setPreviewError(error?.response?.data?.message || '메일 미리보기를 불러오지 못했어요. 다시 시도해주세요.');
        } finally {
            if (!controller.signal.aborted) setPreparing(false);
        }
    };

    return <FormModal title={reviewing ? title + ' 미리보기' : title} open={open} onClose={onClose}
        afterClose={afterClose} onSubmit={submit} submitting={sending} submitDisabled={preparing}
        submitText={reviewing ? (previewError ? '다시 불러오기' : sendText) : '미리보기'} cancelText={reviewing ? '수정하기' : '취소'}
        onCancelAction={reviewing ? edit : undefined} scrollResetKey={reviewing ? 1 : 0}
        navigationDirty={navigationDirty || photos.length > 0}>
        {reviewing ? <>
            {previewFields.map(({ label, value }) => <FormField key={label} label={label}>
                <Paragraph style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</Paragraph>
            </FormField>)}
            {preparing && <div role="status" aria-label="메일 미리보기 불러오는 중"><Spin /></div>}
            {previewError && <Paragraph type="danger" role="alert">{previewError}</Paragraph>}
            {html && <MailHtmlPreview html={html} />}
            <MailPhotoStrip photos={photos} />
        </> : <>
            {children}
            <FormField label="사진 · 최대 3장, 한 장당 2MB" error={photoError}>
                <Upload listType="picture-card" fileList={photos} maxCount={MAX_PHOTOS} multiple
                    accept={PHOTO_TYPES.join(',')} beforeUpload={selectPhotos} disabled={sending}
                    aria-label="첨부 사진 선택" onClickCapture={suppressLinkNavigation}
                    onPreview={file => handlePreview(file, photos)} onRemove={removePhoto}
                    showUploadList={{ showPreviewIcon: true, showRemoveIcon: true, showDownloadIcon: false }}>
                    {photos.length < MAX_PHOTOS && <ImageUploadButton />}
                </Upload>
            </FormField>
            {previewNode}
        </>}
    </FormModal>;
}

MailDraftModal.propTypes = {
    title: PropTypes.string.isRequired,
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    validate: PropTypes.func.isRequired,
    onSend: PropTypes.func.isRequired,
    sending: PropTypes.bool,
    sendText: PropTypes.string,
    navigationDirty: PropTypes.bool,
    previewFields: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string.isRequired, value: PropTypes.node })).isRequired,
    loadPreview: PropTypes.func.isRequired,
    children: PropTypes.node,
};
