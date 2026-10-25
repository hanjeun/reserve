import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataState, FormSelect, FormTextArea } from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import FeedPostCard from './FeedPostCard';
import { useEditorDialog } from '../common/editorDialogContext';
import PhotoAttachControl from './PhotoAttachControl';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import { invalidateFeed } from '../../hooks/feedQueries';
import { storeKeys } from '../../hooks/queryKeys';
import storeService from '../../services/storeService';
import feedService from '../../services/feedService';
import { FEED_CONTENT_LIMIT } from '../../utils/feed';
import { prepareFeedPhoto, reorderFeedPhotos } from '../../utils/feedPhoto';
import { assertCurrentSession, currentSession } from '../../api/sessionScope';

export default function FeedComposer({ open, post, profile, config, onClose, onSaved }) {
    const [form] = Form.useForm();
    const user = useAuthStore(state => state.user);
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const [images, setImages] = useState([]);
    const [preview, setPreview] = useState(false);
    const [progress, setProgress] = useState('');
    const [preparingPhotos, setPreparingPhotos] = useState(false);
    const [preparingPreview, setPreparingPreview] = useState(false);
    const [preparingSave, setPreparingSave] = useState(false);
    const [persistedTarget, setPersistedTarget] = useState(null);
    const urls = useRef(new Set());
    const dirty = useRef(false);
    const initialized = useRef(false);
    const original = useRef(null);
    const requestId = useRef(null);
    const submitLock = useRef(false);
    const maxImages = config.maxImages || 6;
    const maxBytes = config.maxImageBytes || 7 * 1024 * 1024;
    const values = Form.useWatch([], form) || {};
    const stores = useQuery({ queryKey: storeKeys.my(), queryFn: storeService.getMyStores,
        enabled: open && user?.role === 'BUSINESS' });
    const owned = (Array.isArray(stores.data) ? stores.data : stores.data?.content || []).filter(store => !store.deletedAt && !store.closed);
    useLayoutEffect(() => {
        if (!open) { initialized.current = false; return; }
        if (initialized.current) return;
        initialized.current = true;
        original.current = post ? { id: post.id, revision: post.revision, state: post.state, createdAt: post.createdAt } : null;
        setPersistedTarget(original.current);
        requestId.current = post ? null : crypto.randomUUID();
        urls.current.forEach(url => URL.revokeObjectURL(url));
        urls.current.clear();
        form.setFieldsValue({ content: post?.content || '', region: post?.region || null,
            storeId: post?.store?.id || null });
        // 새 편집기에만 초기값을 적용해 진행 중인 수정을 덮지 않는다.
        setImages((post?.images || []).map(image => ({ ...image, uid: `saved:${image.id}` })));
        setPreview(false);
        dirty.current = false;
    }, [open, post, form]);
    useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

    const save = useMutation({
        mutationFn: async variables => {
            const { draft, fields, selected } = variables;
            assertCurrentSession(variables.session);
            const mediaIds = [];
            for (let index = 0; index < selected.length; index += 1) {
                const image = selected[index];
                if (image.id) { mediaIds.push(image.id); continue; }
                setProgress(`사진 ${index + 1}/${selected.length} 올리는 중`);
                const uploaded = await feedService.upload(image.file);
                assertCurrentSession(variables.session);
                mediaIds.push(uploaded.id);
                // 저장 실패 시 소유한 업로드를 재사용해 객체 중복을 방지한다.
                setImages(current => current.map(item => item.uid === image.uid ? { ...item, ...uploaded, file: undefined } : item));
            }
            setProgress(draft ? '임시저장 중' : '게시하는 중');
            assertCurrentSession(variables.session);
            const request = { content: fields.content?.trim() || '', region: fields.region || null,
                storeId: user?.role === 'BUSINESS' ? fields.storeId || null : null,
                mediaIds, draft };
            variables.mediaIds = mediaIds;
            return original.current ? feedService.update(original.current.id, { ...request, revision: original.current.revision })
                : feedService.create({ ...request, clientRequestId: requestId.current });
        },
        onSuccess: async (saved, variables) => {
            assertCurrentSession(variables.session);
            const expectedMedia = variables.mediaIds || [];
            const retryMatched = saved.content === (variables.fields.content?.trim() || '')
                && saved.state === (variables.draft ? 'DRAFT' : 'PUBLISHED')
                && (saved.region || null) === (variables.fields.region || null)
                && (saved.store?.id || null) === (variables.fields.storeId || null)
                && expectedMedia.join(',') === (saved.images || []).map(image => image.id).join(',');
            if (!original.current && !retryMatched) {
                original.current = { id: saved.id, revision: saved.revision, state: saved.state, createdAt: saved.createdAt };
                setPersistedTarget(original.current);
                requestId.current = null;
                await invalidateFeed(client);
                assertCurrentSession(variables.session);
                message.warning(['DRAFT', 'PUBLISHED'].includes(saved.state)
                    ? '이전 저장이 이미 완료됐어요. 지금 작성 중인 변경 내용은 아직 적용되지 않았어요. 다시 저장하면 수정으로 반영해요.'
                    : '이전에 저장된 글이 이미 삭제되거나 숨겨졌어요. 지금 작성 중인 내용은 남겨두지만 이 글에 다시 저장할 수 없어요.');
                return;
            }
            original.current = { id: saved.id, revision: saved.revision, state: saved.state, createdAt: saved.createdAt };
            setPersistedTarget(original.current);
            requestId.current = null;
            dirty.current = false;
            await invalidateFeed(client);
            assertCurrentSession(variables.session);
            message.success(variables.draft ? '임시저장했어요.' : '게시물을 저장했어요.');
            onSaved(saved, variables.draft);
        },
        onError: error => { if (!error.isStaleSession) message.error(error.status === 409 ? '다른 화면에서 게시물이 변경됐어요. 최신 글을 다시 열어주세요.' : error.message); },
        onSettled: () => setProgress(''),
    });

    const busy = save.isPending || preparingPhotos || preparingPreview || preparingSave;
    const blockedTarget = persistedTarget && !['DRAFT', 'PUBLISHED'].includes(persistedTarget.state);
    const togglePreview = async () => {
        if (busy || submitLock.current) return;
        if (preview) { setPreview(false); return; }
        setPreparingPreview(true);
        try { await form.validateFields(); setPreview(true); }
        catch { /* 필드 검증 오류는 편집기에 표시한다. */ }
        finally { setPreparingPreview(false); }
    };

    const submit = async draft => {
        if (busy || submitLock.current || blockedTarget) return;
        const session = currentSession().epoch;
        submitLock.current = true;
        setPreparingSave(true);
        try {
            const fields = await form.validateFields();
            if (!draft && !fields.content?.trim() && !images.length) {
                form.setFields([{ name: 'content', errors: ['글이나 사진을 하나 이상 넣어주세요.'] }]);
                setPreview(false);
                return;
            }
            assertCurrentSession(session);
            await save.mutateAsync({ draft, fields, selected: [...images], session });
        } catch { /* 필드·저장 오류는 기존 표시 위치를 유지한다. */ }
        finally { submitLock.current = false; setPreparingSave(false); }
    };
    const close = () => {
        if (busy || submitLock.current) return;
        if (!dirty.current) { onClose(); return; }
        confirm({ title: '작성을 닫을까요?', content: '임시저장하지 않은 내용은 사라져요. 계속 작성하거나 임시저장할 수 있어요.',
            okText: '저장하지 않고 닫기', cancelText: '계속 작성', onOk: onClose });
    };
    const addImages = async files => {
        if (!files.length || busy || submitLock.current) return;
        if (images.length + files.length > maxImages) { message.error(`사진은 ${maxImages}장까지 올릴 수 있어요.`); return; }
        if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxBytes || file.size === 0)) {
            message.error(`JPG·PNG·WebP 사진을 한 장당 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하로 선택해주세요.`);
            return;
        }
        const session = currentSession().epoch;
        setPreparingPhotos(true);
        try {
            const prepared = [];
            for (const file of files) prepared.push(await prepareFeedPhoto(file, maxBytes));
            assertCurrentSession(session);
            const added = prepared.map(file => {
                const url = URL.createObjectURL(file);
                urls.current.add(url);
                return { uid: crypto.randomUUID(), file, url };
            });
            dirty.current = true;
            setImages(current => [...current, ...added]);
        } catch (error) { if (!error.isStaleSession) message.error(error.message); }
        finally { setPreparingPhotos(false); }
    };
    const removeImage = uid => {
        if (busy || submitLock.current) return;
        dirty.current = true;
        setImages(current => current.filter(image => image.uid !== uid));
    };
    const reorderImages = order => {
        if (busy || submitLock.current) return;
        dirty.current = true;
        setImages(current => reorderFeedPhotos(current, order));
    };
    const rawStore = owned.find(store => store.id === values.storeId) || (post?.store && post.store.id === values.storeId ? post.store : null);
    const selectedStore = rawStore ? { id: rawStore.id, name: rawStore.name, reservationEnabled: rawStore.reservationEnabled === true,
        waitingEnabled: rawStore.waitingEnabled === true || Boolean(rawStore.waitingIntakeMode && rawStore.waitingIntakeMode !== 'OFF') } : null;
    const editingState = persistedTarget?.state;
    const previewPost = { id: persistedTarget?.id, state: 'PUBLISHED', content: values.content?.trim() || '', region: values.region,
        createdAt: editingState === 'PUBLISHED' ? persistedTarget.createdAt : new Date().toISOString(), author: profile,
        images, store: selectedStore };
    useEditorDialog({ title: preview ? '게시물 미리보기' : persistedTarget ? '게시물 수정' : '피드 글쓰기',
        onClose: close, scrollResetKey: preview, width: 680, footer: <ModalActionGroup>
            <Button variant="outline" size="sm" onClick={close} disabled={busy}>닫기</Button>
            <Button variant="secondary" size="sm" onClick={togglePreview} disabled={busy}>{preview ? '작성으로' : '미리보기'}</Button>
            {(!persistedTarget || editingState === 'DRAFT') && <Button variant="secondary" size="sm" onClick={() => submit(true)} disabled={busy}>임시저장</Button>}
            <Button size="sm" onClick={() => submit(false)} loading={save.isPending || preparingSave} disabled={preparingPhotos || preparingPreview || blockedTarget}>{editingState === 'PUBLISHED' ? '수정 저장' : '게시하기'}</Button>
        </ModalActionGroup> });
    return <>
        <div hidden={preview}>
            <Form form={form} layout="vertical" disabled={busy} onValuesChange={() => { dirty.current = true; }}>
                <PhotoAttachControl images={images} onSelect={addImages} onRemove={removeImage} onReorder={reorderImages}
                    maxImages={maxImages} maxBytes={maxBytes} busy={busy} enabled={config.imageEnabled} label="피드 사진" />
                <Form.Item name="content" label="글" rules={[{ max: FEED_CONTENT_LIMIT, message: `${FEED_CONTENT_LIMIT}자 이하로 입력해주세요.` }]}>
                    <FormTextArea rows={6} maxLength={FEED_CONTENT_LIMIT} showCount aria-label="게시물 글" placeholder="나누고 싶은 이야기를 적어주세요." />
                </Form.Item>
                <Form.Item name="region" hidden getValueProps={value => ({ value: value || '' })}><input type="hidden" /></Form.Item>
                {user?.role === 'BUSINESS' && <>
                    {stores.isError && <DataState state="error" title="내 가게를 불러오지 못했어요." error={stores.error} onRetry={stores.refetch} retrying={stores.isFetching} />}
                    <Form.Item name="storeId" label="내 가게 연결 (선택)"><FormSelect allowClear loading={stores.isPending}
                        options={[{ value: '', label: '가게 없이 게시' }, ...owned.map(store => ({ value: store.id, label: store.name }))]} aria-label="연결할 내 가게" placeholder="가게 없이 게시" /></Form.Item>
                </>}
            </Form>
            <p className="reserve-feed-note">글·사진과 공개 프로필이 전체 공개돼요.</p>
        </div>
        {preview && <FeedPostCard post={previewPost} preview detail />}
        {progress && <p className="reserve-feed-note" role="status">{progress}</p>}
        {preparingPhotos && <p className="reserve-feed-note" role="status">사진을 준비하고 있어요.</p>}
        {preparingPreview && <p className="reserve-feed-note" role="status">미리보기를 준비하고 있어요.</p>}
        {blockedTarget && <p className="reserve-field-error" role="status">삭제되거나 숨겨진 글에는 저장할 수 없어요. 작성 중인 내용은 닫기 전에 복사할 수 있어요.</p>}
    </>;
}
FeedComposer.propTypes = { open: PropTypes.bool.isRequired, post: PropTypes.object, profile: PropTypes.object.isRequired,
    config: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired };
