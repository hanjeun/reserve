import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, FormInput, FormSelect, FormTextArea, SegmentedControl } from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import { useEditorDialog } from '../common/editorDialogContext';
import PhotoAttachControl from '../feed/PhotoAttachControl';
import { BenefitRow, BenefitDetailContent } from './StoreNewsPresentation';
import useMessage from '../../hooks/useMessage';
import { invalidateStoreNews } from '../../hooks/storeNewsQueries';
import storeNewsService from '../../services/storeNewsService';
import { STORE_NEWS_TYPES, timedStoreNews, toKstInput, fromKstInput, previewStoreNewsPeriod, storeNewsExcerpt } from '../../utils/storeNews';
import { prepareFeedPhoto, reorderFeedPhotos } from '../../utils/feedPhoto';
import { assertCurrentSession, currentSession } from '../../api/sessionScope';
import useWorkspaceDraftGuard from '../../hooks/useWorkspaceDraftGuard';

const previewViews = [{ value: 'list', label: '혜택 목록' }, { value: 'detail', label: '혜택 상세' }];
const designOptions = [{ value: 'STANDARD', label: '기본' }, { value: 'PHOTO', label: '사진 강조' }, { value: 'COMPACT', label: '간결형' }];

export default function StoreNewsComposer({ open, news, initialStoreId, stores, config, onClose, onSaved }) {
    const [form] = Form.useForm();
    const values = Form.useWatch([], form) || {};
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const [images, setImages] = useState([]);
    const [preview, setPreview] = useState(false);
    const [previewView, setPreviewView] = useState('list');
    const [preparing, setPreparing] = useState(false);
    const [progress, setProgress] = useState('');
    const [target, setTarget] = useState(null);
    const initialized = useRef(false);
    const original = useRef(null);
    const nonce = useRef(null);
    const dirty = useRef(false);
    const lock = useRef(false);
    const urls = useRef(new Set());
    const maxImages = Math.min(6, config.maxImages || 6);
    const maxBytes = config.maxImageBytes || 7 * 1024 * 1024;

    useLayoutEffect(() => {
        if (!open) { initialized.current = false; return; }
        if (initialized.current) return;
        initialized.current = true;
        original.current = news ? { id: news.id, revision: news.revision ?? 0, state: news.state || 'PUBLISHED', createdAt: news.createdAt } : null;
        setTarget(original.current);
        nonce.current = news ? null : crypto.randomUUID();
        urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear();
        form.setFieldsValue({ storeId: news?.storeId || initialStoreId || stores[0]?.id, title: news?.title || '',
            content: news?.content || '', newsType: news?.newsType || 'NEWS', conditions: news?.conditions || '', design: news?.design || 'STANDARD',
            startsAt: timedStoreNews(news?.newsType) ? toKstInput(news?.startsAt) : '',
            endsAt: timedStoreNews(news?.newsType) ? toKstInput(news?.endsAt) : '' });
        setImages((news?.images || []).map(image => ({ ...image, uid: `saved:${image.id}` })));
        setPreview(false); setPreviewView('list'); dirty.current = false;
    }, [open, news, initialStoreId, stores, form]);
    useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
    useEffect(() => {
        if (!open) return;
        const warn = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [open]);

    const save = useMutation({
        mutationFn: async variables => {
            const session = variables.session;
            assertCurrentSession(session);
            const ids = [];
            for (let index = 0; index < variables.images.length; index += 1) {
                const image = variables.images[index];
                if (image.id) { ids.push(image.id); continue; }
                setProgress(`사진 ${index + 1}/${variables.images.length} 올리는 중`);
                const uploaded = await storeNewsService.upload(image.file); assertCurrentSession(session);
                ids.push(uploaded.id);
                setImages(current => current.map(item => item.uid === image.uid ? { ...item, ...uploaded, file: undefined } : item));
            }
            assertCurrentSession(session);
            variables.request.mediaIds = ids;
            setProgress(variables.request.draft ? '임시저장 중' : '게시하는 중');
            return original.current ? storeNewsService.update(original.current.id, { ...variables.request, revision: original.current.revision })
                : storeNewsService.create({ ...variables.request, clientRequestId: nonce.current });
        },
        onSuccess: async (saved, variables) => {
            assertCurrentSession(variables.session);
            const request = variables.request;
            const same = saved.title === request.title && saved.content === request.content && saved.storeId === request.storeId
                && (saved.benefitState !== 'NONE' && Boolean(saved.benefitState)) === request.benefitRequested
                && saved.newsType === request.newsType
                && (saved.design || 'STANDARD') === (request.design || 'STANDARD')
                && (saved.conditions || '') === request.conditions && saved.state === (request.draft ? 'DRAFT' : 'PUBLISHED')
                && (saved.images || []).map(image => image.id).join(',') === request.mediaIds.join(',')
                && (request.startsAt ? new Date(saved.startsAt).getTime() === new Date(request.startsAt).getTime() : !saved.startsAt)
                && (request.endsAt ? new Date(saved.endsAt).getTime() === new Date(request.endsAt).getTime() : !saved.endsAt);
            if (!original.current && !same) {
                original.current = { id: saved.id, revision: saved.revision ?? 0, state: saved.state, createdAt: saved.createdAt };
                setTarget(original.current); nonce.current = null;
                await invalidateStoreNews(client);
                assertCurrentSession(variables.session);
                message.warning('이전 저장이 이미 완료됐어요. 작성 중인 변경 내용은 남겨두며 다시 저장하면 수정으로 반영해요.');
                return;
            }
            original.current = { id: saved.id, revision: saved.revision ?? 0, state: saved.state, createdAt: saved.createdAt };
            setTarget(original.current);
            nonce.current = null;
            dirty.current = false;
            await invalidateStoreNews(client);
            assertCurrentSession(variables.session);
            message.success(request.draft ? '가게 소식을 임시저장했어요.' : saved.benefitState === 'PENDING' ? '혜택을 신청했어요. 관리자 승인 후 혜택 탭에 표시돼요.' : '가게 소식을 저장했어요.');
            onSaved(saved);
        },
        onError: error => { if (!error.isStaleSession) message.error(error.status === 409 ? '다른 화면에서 소식이 변경됐어요. 최신 소식을 다시 열어주세요.' : error.message); },
        onSettled: () => setProgress(''),
    });
    const busy = preparing || save.isPending;
    useWorkspaceDraftGuard({ dirty: () => open && dirty.current, busy: () => open && (busy || lock.current),
        onDiscard: () => { dirty.current = false; onClose(); } });
    const blocked = target && !['DRAFT', 'PUBLISHED', 'ENDED'].includes(target.state);
    const buildRequest = (fields, draft) => {
        const type = fields.newsType || 'NEWS';
        const readTime = name => {
            try { return timedStoreNews(type) ? fromKstInput(fields[name]) : null; }
            catch (error) { form.setFields([{ name, errors: ['한국 시간으로 올바른 날짜·시각을 입력해주세요.'] }]); throw error; }
        };
        const start = readTime('startsAt');
        const end = readTime('endsAt');
        if (!draft && timedStoreNews(type) && (!start || !end)) {
            form.setFields([{ name: !start ? 'startsAt' : 'endsAt', errors: ['행사·혜택의 시작과 종료 시각을 입력해주세요.'] }]);
            throw new Error('기간이 필요해요.');
        }
        if (start && end && new Date(start).getTime() >= new Date(end).getTime()) {
            form.setFields([{ name: 'endsAt', errors: ['종료 시각은 시작 시각보다 뒤여야 해요.'] }]);
            throw new Error('기간 순서를 확인해주세요.');
        }
        if (!draft && !fields.title?.trim()) {
            form.setFields([{ name: 'title', errors: ['제목을 입력해주세요.'] }]);
            throw new Error('제목이 필요해요.');
        }
        if (!draft && !fields.content?.trim()) {
            form.setFields([{ name: 'content', errors: ['소식 본문을 입력해주세요.'] }]);
            throw new Error('소식 내용이 필요해요.');
        }
        if (!draft && config.benefitApprovalEnabled !== true) {
            message.error('혜택 신청 기능이 준비된 서버에서 다시 작성해주세요.');
            throw new Error('혜택 신청 기능을 확인해주세요.');
        }
        if (!draft && !images.length) {
            message.error('혜택 신청에는 사진을 1장 이상 첨부해주세요.');
            throw new Error('혜택 사진이 필요해요.');
        }
        return { storeId: fields.storeId, title: fields.title?.trim() || '', content: fields.content?.trim() || '', newsType: type,
            startsAt: start, endsAt: end, conditions: fields.conditions?.trim() || '', feedEnabled: false,
            mediaIds: [], draft, benefitRequested: true, ...(config.benefitDesignEnabled ? { design: fields.design || 'STANDARD' } : {}) };
    };
    const submit = async draft => {
        const session = currentSession().epoch;
        if (busy || lock.current || blocked) return;
        lock.current = true; setPreparing(true);
        try {
            const fields = await form.validateFields();
            const request = buildRequest(fields, draft);
            assertCurrentSession(session);
            await save.mutateAsync({ request, images: [...images], session });
        } catch { setPreview(false); }
        finally { lock.current = false; setPreparing(false); }
    };
    const togglePreview = async () => {
        if (busy || lock.current) return;
        if (preview) { setPreview(false); return; }
        try { const fields = await form.validateFields(); buildRequest(fields, false); setPreview(true); }
        catch { /* 필드 오류는 입력 옆에 표시한다. */ }
    };
    const close = () => {
        if (busy || lock.current) return;
        if (!dirty.current) { onClose(); return; }
        confirm({ title: '소식 작성을 닫을까요?', content: '임시저장하지 않은 내용은 사라져요. 계속 작성하거나 임시저장할 수 있어요.',
            okText: '저장하지 않고 닫기', cancelText: '계속 작성', onOk: onClose });
    };
    const addPhotos = async files => {
        if (!files.length || busy || lock.current) return;
        if (images.length + files.length > maxImages || files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > maxBytes)) {
            message.error(`JPG·PNG·WebP 사진을 최대 ${maxImages}장, 한 장당 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하로 선택해주세요.`); return;
        }
        lock.current = true; setPreparing(true);
        const session = currentSession().epoch;
        try {
            const prepared = []; for (const file of files) prepared.push(await prepareFeedPhoto(file, maxBytes));
            assertCurrentSession(session);
            const added = prepared.map(file => { const url = URL.createObjectURL(file); urls.current.add(url); return { uid: crypto.randomUUID(), file, url }; });
            dirty.current = true; setImages(current => [...current, ...added]);
        } catch (error) { if (!error.isStaleSession) message.error(error.message); }
        finally { lock.current = false; setPreparing(false); }
    };
    const removePhoto = uid => {
        if (busy || lock.current) return;
        dirty.current = true;
        setImages(current => current.filter(image => image.uid !== uid));
    };
    const reorderPhotos = order => {
        if (busy || lock.current) return;
        dirty.current = true;
        setImages(current => reorderFeedPhotos(current, order));
    };
    const store = stores.find(item => item.id === values.storeId) || (news && news.storeId === values.storeId ? {
        id: news.storeId, name: news.storeName, address: news.storeAddress, category: news.storeCategory, mainImageUrl: news.mainImageUrl,
    } : null);
    let start = null, end = null;
    try { if (timedStoreNews(values.newsType)) { start = fromKstInput(values.startsAt); end = fromKstInput(values.endsAt); } } catch { /* 검증을 통과한 뒤 미리보기를 연다. */ }
    const previewNews = { id: target?.id, storeId: values.storeId, storeName: store?.name || '선택한 가게', mainImageUrl: store?.mainImageUrl,
        title: values.title?.trim() || '', content: values.content?.trim() || '', excerpt: storeNewsExcerpt(values.content), newsType: values.newsType || 'NEWS',
        startsAt: start, endsAt: end, conditions: values.conditions?.trim() || '', periodStatus: previewStoreNewsPeriod(values.newsType, start, end),
        images, design: values.design || 'STANDARD', createdAt: target?.state === 'PUBLISHED' ? target.createdAt : new Date().toISOString() };
    useEditorDialog({ title: preview ? '가게 소식 미리보기' : target ? '가게 소식 수정' : '새 가게 소식',
        onClose: close, scrollResetKey: `${preview}:${previewView}`, width: 680, footer: <ModalActionGroup><Button variant="outline" size="sm" onClick={close} disabled={busy}>닫기</Button>
            <Button variant="secondary" size="sm" onClick={togglePreview} disabled={busy}>{preview ? '작성으로' : '미리보기'}</Button>
            {(!target || target.state === 'DRAFT') && <Button variant="secondary" size="sm" onClick={() => submit(true)} disabled={busy}>임시저장</Button>}
            <Button size="sm" onClick={() => submit(false)} loading={save.isPending} disabled={busy || blocked}>혜택 신청</Button></ModalActionGroup> });
    return <>
        <div hidden={preview}><Form form={form} layout="vertical" disabled={busy} onValuesChange={changed => {
            dirty.current = true;
            if ('newsType' in changed && !timedStoreNews(changed.newsType)) form.setFieldsValue({ startsAt: '', endsAt: '' });
        }}>
            <div className="reserve-store-news-selectors">
            <Form.Item name="storeId" label="소식을 올릴 가게" rules={[{ required: true, message: '가게를 선택해주세요.' }]}>
                <FormSelect options={stores.map(item => ({ value: item.id, label: item.name }))} disabled={Boolean(target) || busy} aria-label="소식을 올릴 내 가게" />
            </Form.Item>
            <Form.Item name="newsType" label="소식 종류"><FormSelect options={STORE_NEWS_TYPES} aria-label="가게 소식 종류" /></Form.Item>
            </div>
            {config.benefitDesignEnabled && <Form.Item name="design" label="디자인"><SegmentedControl options={designOptions} disabled={busy} aria-label="혜택 디자인" /></Form.Item>}
            <PhotoAttachControl images={images} onSelect={addPhotos} onRemove={removePhoto} onReorder={reorderPhotos}
                maxImages={maxImages} maxBytes={maxBytes} busy={busy} enabled={config.imageEnabled}
                required label="혜택 사진" />
            <Form.Item name="title" label="제목" rules={[{ max: 200, message: '제목은 200자 이하로 입력해주세요.' }]}>
                <FormInput maxLength={200} aria-label="가게 소식 제목" />
            </Form.Item>
            <Form.Item name="content" label="본문" rules={[{ max: 2000, message: '본문은 2000자 이하로 입력해주세요.' }]}>
                <FormTextArea rows={6} maxLength={2000} showCount aria-label="가게 소식 본문" />
            </Form.Item>
            {timedStoreNews(values.newsType) && <div className="reserve-store-news-dates">
                <Form.Item name="startsAt" label="시작 (한국 시간)"><FormInput type="datetime-local" aria-label="행사 혜택 시작 한국 시각" /></Form.Item>
                <Form.Item name="endsAt" label="종료 (한국 시간)"><FormInput type="datetime-local" aria-label="행사 혜택 종료 한국 시각" /></Form.Item>
            </div>}
            <Form.Item name="conditions" label="이용 조건 (선택)" rules={[{ max: 1000, message: '조건은 1000자 이하로 입력해주세요.' }]}>
                <FormTextArea rows={3} maxLength={1000} aria-label="소식 이용 조건" />
            </Form.Item>
            <p className="reserve-feed-note">혜택은 승인 후 공개돼요. 내용을 바꾸면 공개를 중단하고 다시 심사해요.</p>
        </Form></div>
        {preview && <><SegmentedControl value={previewView} options={previewViews} onChange={setPreviewView} />
            {previewView === 'list' && <div className="reserve-benefits-page reserve-store-news-preview"><BenefitRow item={previewNews} preview /></div>}
            {previewView === 'detail' && <BenefitDetailContent item={previewNews} preview />}
            </>}
        {progress && <p className="reserve-feed-note" role="status">{progress}</p>}
        {blocked && <p className="reserve-field-error">삭제되거나 숨겨진 소식은 수정할 수 없어요. 작성 중인 내용은 닫기 전에 복사할 수 있어요.</p>}
    </>;
}
StoreNewsComposer.propTypes = { open: PropTypes.bool.isRequired, news: PropTypes.object, initialStoreId: PropTypes.number,
    stores: PropTypes.array.isRequired, config: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired };
