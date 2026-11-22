import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Rate, Upload } from 'antd';
import { Avatar, Card, FormField, FormInput, FormTextArea } from '../common';
import ImageUploadButton from '../common/ImageUploadButton';
import LoadingUpload from '../common/LoadingUpload';
import { CheckOutlined, CloseOutlined, StarFilled } from '../common/icons';
import useFormErrors from '../../hooks/useFormErrors';
import useImagePreview from '../../hooks/useImagePreview';
import useMediaStripDrag from '../../hooks/useMediaStripDrag';
import { radius } from '../../styles/tokens';

const MAX_PHOTOS = 5;
const MAX_BYTES = 7 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const RATING_LABELS = { 1: '별로였어요', 2: '아쉬웠어요', 3: '괜찮았어요', 4: '좋았어요', 5: '최고였어요!' };

export default function ReviewEditor({ review, profile, reservationDate, submitting, onSubmit, onCancel, editorRef }) {
    const [fields, setFields] = useState(() => ({ rating: review?.rating ?? 0, title: review?.title ?? '', content: review?.content ?? '' }));
    const alias = review?.authorAlias;
    const visibleProfile = !alias && profile?.nickname ? profile : null;
    const [photos, setPhotos] = useState(() => (review?.photos ?? []).map((photo, index) => ({
        uid: `saved-${photo.id}`, photoId: photo.id, name: `사진 ${index + 1}`, status: 'done', url: photo.url,
        thumbUrl: photo.thumbnailUrl ?? photo.url,
    })));
    const [hover, setHover] = useState(0);
    const [photoError, setPhotoError] = useState('');
    const { errors, validate, clearError } = useFormErrors();
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview({ showImageLoading: true });
    const attachmentDrag = useMediaStripDrag(':scope > *', '.ant-upload-list-picture-card');
    const objectUrls = useRef(new Set());
    useEffect(() => {
        const urls = objectUrls.current;
        return () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
    }, []);

    const selectPhotos = (file, batch) => {
        if (file !== batch[0] || submitting) return Upload.LIST_IGNORE;
        if (photos.length + batch.length > MAX_PHOTOS) setPhotoError('사진은 최대 5장까지 첨부할 수 있어요.');
        else if (batch.some(item => !PHOTO_TYPES.includes(item.type) || item.size === 0)) setPhotoError('JPG 또는 PNG 사진을 선택해주세요.');
        else if ([...photos.map(item => item.originFileObj).filter(Boolean), ...batch]
            .reduce((bytes, item) => bytes + item.size, 0) > MAX_BYTES) setPhotoError('추가할 사진을 합계 7MB 이하로 선택해주세요.');
        else {
            const added = batch.map(item => {
                const url = URL.createObjectURL(item);
                objectUrls.current.add(url);
                return { uid: item.uid, name: item.name, status: 'done', url, thumbUrl: url, originFileObj: item };
            });
            setPhotos(current => [...current, ...added]);
            setPhotoError('');
        }
        return Upload.LIST_IGNORE;
    };

    const removePhoto = file => {
        if (submitting) return false;
        if (objectUrls.current.delete(file.url)) URL.revokeObjectURL(file.url);
        setPhotos(current => current.filter(item => item.uid !== file.uid));
        setPhotoError('');
        return false;
    };

    const setField = (name, value) => {
        setFields(current => ({ ...current, [name]: value }));
        clearError(name);
    };
    const submit = event => {
        event.preventDefault();
        if (submitting) return;
        const title = fields.title.trim();
        const content = fields.content.trim();
        if (!validate(error => {
            if (!fields.rating) error.rating = '별점을 선택해주세요.';
            if (!title) error.title = '제목을 입력해주세요.';
            if (content.length < 10) error.content = '내용을 10자 이상 입력해주세요.';
        })) return;
        const savedIds = new Set(photos.map(photo => photo.photoId));
        const removedPhotoIds = (review?.photos ?? []).filter(photo => !savedIds.has(photo.id)).map(photo => photo.id);
        onSubmit({ rating: fields.rating, title, content }, photos.map(photo => photo.originFileObj).filter(Boolean), removedPhotoIds);
    };

    return <form className="reserve-review-editor reserve-review-scroll-target reserve-store-section-target" ref={editorRef}
        tabIndex={-1} aria-label={review ? '리뷰 수정' : '리뷰 작성'} aria-busy={submitting} onSubmit={submit}>
        <Card style={{ borderRadius: radius.xl }} actions={[
            <button key="cancel" type="button" className="reserve-card-action reserve-review-card-action" disabled={submitting} onClick={onCancel}>
                <CloseOutlined aria-hidden="true" />취소
            </button>,
            <button key="submit" type="submit" className="reserve-card-action reserve-review-card-action is-primary" disabled={submitting}>
                <CheckOutlined aria-hidden="true" />{submitting ? '저장 중…' : review ? '저장' : '리뷰 등록'}
            </button>,
        ]}>
            <Card.Body>
                <div className="reserve-review-header">
                    <div className="reserve-review-author">
                        <Avatar src={visibleProfile?.avatarUrl} size={36} referrerPolicy="no-referrer" />
                        <div>
                            <strong>{alias || visibleProfile?.nickname || '리저브 이용자'}</strong>
                            <Rate aria-label="별점" character={<StarFilled aria-hidden="true" />} value={fields.rating}
                                className="reserve-review-stars" onChange={value => setField('rating', value)}
                                onHoverChange={setHover} allowClear={false} disabled={submitting} />
                            {errors.rating && <span className="reserve-field-error" role="alert">{errors.rating}</span>}
                        </div>
                    </div>
                    <div className="reserve-review-editor-meta reserve-review-muted">
                        {reservationDate && <time dateTime={reservationDate}>예약일 {reservationDate}</time>}
                        {RATING_LABELS[hover || fields.rating]}
                    </div>
                </div>
                <div className="reserve-review-editor-fields">
                    <FormField error={errors.title}>
                        <FormInput aria-label="리뷰 제목" value={fields.title} onChange={event => setField('title', event.target.value)}
                            placeholder="리뷰 제목을 입력해주세요" maxLength={100} showCount disabled={submitting} />
                    </FormField>
                    <FormField error={errors.content}>
                        <FormTextArea aria-label="리뷰 내용" value={fields.content} onChange={event => setField('content', event.target.value)}
                            placeholder="서비스, 분위기 등 솔직한 경험을 공유해주세요 (10자 이상)"
                            rows={3} maxLength={1000} showCount disabled={submitting} />
                    </FormField>
                    <FormField label="사진 · 최대 5장, 추가할 사진 합계 7MB" error={photoError}>
                        <div {...attachmentDrag} className="reserve-review-attachments" data-discovery-swipe-ignore="true"
                            role="group" aria-label="첨부한 리뷰 사진" tabIndex={photos.length ? 0 : undefined} onClickCapture={event => {
                                attachmentDrag.onClickCapture(event);
                                if (!event.defaultPrevented) suppressLinkNavigation(event);
                            }}>
                            <LoadingUpload listType="picture-card" fileList={photos} multiple showTrigger={photos.length < MAX_PHOTOS} accept={PHOTO_TYPES.join(',')} hasControlInside={false}
                                aria-label="리뷰 사진 선택" beforeUpload={selectPhotos} disabled={submitting}
                                onPreview={file => handlePreview(file, photos)} onRemove={removePhoto}
                                showUploadList={{ showPreviewIcon: true, showRemoveIcon: !submitting, showDownloadIcon: false }}>
                                <ImageUploadButton />
                            </LoadingUpload>
                        </div>
                    </FormField>
                </div>
            </Card.Body>
        </Card>
        {previewNode}
    </form>;
}

ReviewEditor.propTypes = { review: PropTypes.object, profile: PropTypes.object, reservationDate: PropTypes.string, submitting: PropTypes.bool,
    onSubmit: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired, editorRef: PropTypes.object };
