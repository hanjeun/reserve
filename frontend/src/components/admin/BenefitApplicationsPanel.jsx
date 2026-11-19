import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Form} from 'antd';
import Pagination from '../common/Pagination';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DataState, FilterMenu, FormModal, FormTextArea, RefreshButton } from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import { AuditOutlined } from '../common/icons';
import { BenefitDetailContent } from '../store-news/StoreNewsPresentation';
import BenefitDetailSkeleton from '../common/BenefitDetailSkeleton';
import AnimatedContent from '../common/AnimatedContent';
import LoadingImage from '../common/LoadingImage';
import { StoreCardLayout } from '../store/StoreCard';
import { StoreListRowLayout } from '../store/StoreListRow';
import StoreListViewToggle from '../store/StoreListViewToggle';
import { storeNewsKeys, useStoreNewsConfig, invalidateStoreNews } from '../../hooks/storeNewsQueries';
import storeNewsService from '../../services/storeNewsService';
import useMessage from '../../hooks/useMessage';
import { benefitReviewLabel } from '../../utils/storeNews';
import { BENEFIT_IMAGE_FALLBACK, getBenefitImageUrl } from '../../pages/discovery/benefitPresentation';
import { feedDate, feedMediaUrl, feedTotal } from '../../utils/feed';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { useQueryParamsState } from '../../hooks/useQueryParamState';
import useStoreNewsEvents from '../../hooks/useStoreNewsEvents';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { isBlockingListReadError, isReadAccessDenied } from '../../hooks/liveUpdateQueries';
import { useWindowWidth } from '../../hooks';
import ManagementListToolbar from '../common/ManagementListToolbar';
import { BenefitApplicationsSkeleton } from './ManagementReviewSkeletons';
import { BENEFIT_QUERY_DEFAULTS, BENEFIT_STATE_OPTIONS, reviewOption, reviewPage } from './managementReviewQuery';
import { isMissingRequestError } from '../../utils/listErrorMessage';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';

const PAGE_SIZE = 20;
export default function BenefitApplicationsPanel() {
    const client = useQueryClient();
    const { message } = useMessage();
    const config = useStoreNewsConfig(true);
    const enabled = config.data?.benefitApprovalEnabled === true;
    const active = useContext(WorkspaceActivityContext);
    const mobile = useWindowWidth() < 576;
    const listRef = useRef(null);
    useStoreNewsEvents(active && enabled && config.data?.benefitEventsEnabled === true, true);
    const [query, setQuery] = useQueryParamsState(BENEFIT_QUERY_DEFAULTS);
    const state = reviewOption(BENEFIT_STATE_OPTIONS, query.benefitState, 'PENDING');
    const page = reviewPage(query.benefitPage);
    const view = query.view === 'cards' ? 'cards' : 'list';
    const setPage = value => setQuery({ benefitPage: String(value) });
    const session = currentSession().epoch;
    const [selection, setSelection] = useState({ open: false, id: null, news: null, session: null });
    const currentSelection = selection.session === session;
    const [photoState, setPhotoState] = useState(() => new Map());
    const [photoAttempt, setPhotoAttempt] = useState(0);
    const [conflict, setConflict] = useState(null);
    const submitLock = useRef(false);
    const previewRef = useRef(null);
    const [form] = Form.useForm();
    const note = Form.useWatch('note', { form, preserve: true });
    const [validating, setValidating] = useState(false);
    const params = { page: page - 1, size: PAGE_SIZE, state };
    const list = useQuery({ queryKey: storeNewsKeys.applications(params), queryFn: ({ signal }) => storeNewsService.applications(params, signal),
        enabled: active && enabled, placeholderData: keepPreviousData });
    const blockingError = isBlockingListReadError(list.error, list.data?.content);
    const detail = useQuery({ queryKey: storeNewsKeys.application(selection.id), queryFn: ({ signal }) => storeNewsService.application(selection.id, signal),
        enabled: active && enabled && currentSelection && selection.open && Boolean(selection.id), staleTime: 0, retry: false });
    useListRefreshAnchor(listRef, `${state}:${page}`, list.isFetching, list.data);
    const unavailable = detail.isError && isMissingRequestError(detail.error) || detail.data?.state === 'DELETED';
    const latestReady = currentSelection && selection.open && detail.isSuccess && !detail.isFetching && detail.data?.id === selection.id && !unavailable;
    const changedRevision = latestReady && selection.news && selection.news.revision !== detail.data.revision;
    if (latestReady && selection.news?.revision !== detail.data.revision) {
        if (selection.news) setConflict('revision');
        setPhotoState(new Map());
        setPhotoAttempt(0);
        setSelection({ ...selection, news: detail.data });
    }
    const news = unavailable || !currentSelection ? null : selection.news;
    useEffect(() => {
        if (selection.open && unavailable) void client.invalidateQueries({ queryKey: ['store-news', 'applications'] });
    }, [selection.open, unavailable, client]);
    const total = feedTotal(list.data);
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    useEffect(() => { if (list.isSuccess && !list.isFetching && !list.isPlaceholderData && page > lastPage) setQuery({ benefitPage: String(lastPage) }); },
        [list.isSuccess, list.isFetching, list.isPlaceholderData, page, lastPage, setQuery]);
    const recordPhoto = useCallback((image, failed = false) => {
        if (!failed && (!image?.complete || !image.naturalWidth)) return;
        const src = image?.getAttribute?.('src');
        if (!src || !(news?.images || []).some(item => feedMediaUrl(item.url) === src)) return;
        const result = failed ? 'failed' : 'loaded';
        setPhotoState(current => current.get(src) === 'loaded' || current.get(src) === result ? current : new Map(current).set(src, result));
    }, [news]);
    useEffect(() => {
        previewRef.current?.querySelectorAll('img').forEach(image => recordPhoto(image, image.complete && !image.naturalWidth));
    }, [recordPhoto, selection.open, photoAttempt]);
    const photosReady = news?.images?.length > 0 && news.images.every(item => photoState.get(feedMediaUrl(item.url)) === 'loaded');
    const photosFailed = [...photoState.values()].includes('failed');
    const retryPhotos = () => {
        setPhotoState(current => new Map([...current].filter(([, result]) => result === 'loaded')));
        setPhotoAttempt(value => value + 1);
    };
    const review = useMutation({ mutationFn: async ({ id, revision, approved, note, session }) => {
        assertCurrentSession(session); const saved = await storeNewsService.review(id, { revision, approved, note }); assertCurrentSession(session); return saved;
    },
        onSuccess: async (_data, values) => {
            if (!isCurrentSession(values.session)) return;
            setSelection(current => ({ ...current, open: false }));
            await invalidateStoreNews(client);
            if (isCurrentSession(values.session)) message.success(values.approved ? '혜택을 승인했어요.' : '혜택 신청을 반려했어요.');
        },
        onError: (error, { session }) => {
            if (!isCurrentSession(session) || error?.isStaleSession || error?.isSessionExpired) return;
            if (isResponseUnconfirmed(error)) {
                setConflict('unconfirmed');
                message.warning('심사 결과를 확인하지 못했어요. 최신 신청 상태를 확인해주세요.');
                void invalidateStoreNews(client);
                return;
            }
            if (error?.status === 409) { setConflict('revision'); void detail.refetch(); }
            handleApiError(error, message, '혜택 심사를 저장하지 못했어요.');
        },
        onSettled: () => { submitLock.current = false; },
    });
    const openReview = item => {
        if (!isCurrentSession(session)) return;
        form.resetFields(); setPhotoState(new Map()); setPhotoAttempt(0); setConflict(null);
        setSelection({ open: true, id: item.id, news: null, session });
    };
    const reload = async () => {
        if (submitLock.current || review.isPending) return;
        await Promise.allSettled([list.refetch(), ...(selection.open ? [detail.refetch()] : [])]);
    };
    const decide = async approved => {
        if (submitLock.current || review.isPending || conflict || changedRevision || detail.isFetching || detail.isError || !news || news.benefitState !== 'PENDING' || news.state !== 'PUBLISHED'
            || approved && !photosReady) return;
        if (!isCurrentSession(selection.session)) return;
        const target = { id: news.id, revision: news.revision, session: selection.session };
        submitLock.current = true; setValidating(true);
        try { const values = await form.validateFields(); assertCurrentSession(target.session); await review.mutateAsync({ ...target, approved, note: values.note.trim() }); }
        catch { /* 입력 칸과 공통 오류 안내를 유지한다. */ }
        finally { submitLock.current = false; setValidating(false); }
    };
    const busy = validating || review.isPending;
    const renderList = () => {
        if (config.isError && !config.data) return <DataState state="error" title="혜택 심사 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
        if (!enabled) return <DataState state="empty" kind="news" title="혜택 신청·심사를 준비하고 있어요." />;
        if (blockingError) return <DataState state="error" title="혜택 신청을 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
        if (!list.data?.content?.length) return <DataState state="empty" kind="news" title="해당 상태의 혜택 신청이 없어요." />;
        return <div className={view === 'cards' ? 'rsv-mystore-grid' : 'reserve-store-list-rows'} aria-busy={list.isFetching}>
            {list.data.content.map(item => {
                const itemKey = 'benefit:' + item.id;
                const title = item.title || '제목 없는 신청';
                const reviewLabel = BENEFIT_STATE_OPTIONS.find(option => option.value === item.benefitState)?.label ?? benefitReviewLabel(item.benefitState);
                const facts = [item.storeName, view === 'cards' && reviewLabel];
                const summary = [...facts, feedDate(item.benefitRequestedAt, { dateOnly: true })].filter(Boolean).join(' · ');
                const fullSummary = [...facts, feedDate(item.benefitRequestedAt)].filter(Boolean).join(' · ');
                const metadata = <span className="reserve-store-list-row-description" title={fullSummary}>{summary}</span>;
                const onOpenDetail = () => openReview(item);
                const detail = { onOpenDetail, detailLabel: title + ' 검토', detailDisabled: busy };
                const action = <Button key="review" variant="ghost-sm" disabled={busy} onClick={onOpenDetail}><AuditOutlined aria-hidden="true" /> 검토</Button>;
                const photoUrl = getBenefitImageUrl(item.mainImageUrl);
                return view === 'cards'
                    ? <StoreCardLayout key={item.id} itemKey={itemKey} title={<span title={title}>{title}</span>} actions={[action]} {...detail}
                        cover={<Card.Cover src={photoUrl} alt="" imageClassName="reserve-benefit-application-photo"
                            referrerPolicy="no-referrer" fallbackSrc={BENEFIT_IMAGE_FALLBACK} />}>{metadata}</StoreCardLayout>
                    : <StoreListRowLayout key={item.id} itemKey={itemKey} className="reserve-mystore-list-row" title={title} status={reviewLabel} actions={action} {...detail}
                        cover={<LoadingImage src={photoUrl} alt="" width={160} height={160} loading="lazy" decoding="async"
                            className="reserve-benefit-application-photo" referrerPolicy="no-referrer"
                            onError={event => {
                                if (event.currentTarget.getAttribute('src') !== BENEFIT_IMAGE_FALLBACK) event.currentTarget.src = BENEFIT_IMAGE_FALLBACK;
                            }} />}>
                        {metadata}
                    </StoreListRowLayout>;
            })}
        </div>;
    };
    const canReview = news?.benefitState === 'PENDING' && news?.state === 'PUBLISHED' && !conflict && !changedRevision && !detail.isFetching && !detail.isError;
    if (config.isPending || enabled && list.isPending) return <BenefitApplicationsSkeleton state={state} view={view} />;
    return <section ref={listRef} className="reserve-benefit-applications" aria-label="혜택 신청 심사">
        <ManagementListToolbar leading={<div className="reserve-benefit-application-tools">
            <StoreListViewToggle view={view} onChange={value => setQuery({ view: value })} disabled={busy} cardsLabel="카드형 보기로 전환" />
            <span className="reserve-management-count">{blockingError ? '목록 확인 필요' : `${total.toLocaleString('ko-KR')}건`}</span>
        </div>}
            trailing={<FilterMenu appearance="plain" value={state} options={BENEFIT_STATE_OPTIONS}
                aria-label="혜택 승인 상태" onChange={value => setQuery({ benefitState: value, benefitPage: '1' })} />}
            refresh={<RefreshButton onReload={reload} loading={list.isFetching || selection.open && detail.isFetching}
                disabled={!enabled || busy} label={mobile ? '' : '새로고침'} aria-label="혜택 신청 새로고침" />} />
        {list.isRefetchError && !blockingError && <DataState compact state="error" title="목록을 갱신하지 못했어요. 현재 내용은 유지했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />}
        <AnimatedContent motionKey={view} ready={!list.isPending && !list.isPlaceholderData}>{renderList()}</AnimatedContent>
        {!blockingError && list.data && total > PAGE_SIZE && <Pagination current={page} total={total} pageSize={PAGE_SIZE} showSizeChanger={false}
            disabled={busy} onChange={setPage} />}
        <FormModal open={selection.open} title="혜택 신청 검토" width={680} rootClassName="reserve-feed-modal reserve-store-news-modal"
            submitting={busy} navigationDirty={Boolean(selection.open && note)}
            onClose={() => { if (!review.isPending && !submitLock.current) setSelection(current => ({ ...current, open: false })); }}
            footer={<ModalActionGroup>
                <Button variant="outline" size="sm" onClick={() => decide(false)} disabled={!canReview || busy}>반려</Button>
                <Button size="sm" onClick={() => decide(true)} loading={review.isPending} disabled={!canReview || !photosReady || busy}>승인</Button></ModalActionGroup>}>
            {unavailable ? <DataState state="empty" kind="news" title="삭제되거나 철회된 소식이에요." />
                : !news && detail.isPending || !news && detail.isFetching ? <BenefitDetailSkeleton role="status" aria-label="혜택 신청 내용을 불러오는 중" aria-busy="true" />
                : !news && detail.isError ? <DataState state="error" title="신청 내용을 불러오지 못했어요." error={detail.error} onRetry={reload} retrying={detail.isFetching} />
                    : detail.isError && isReadAccessDenied(detail.error) ? <DataState state="error" title="신청 내용을 더 이상 볼 수 없어요." error={detail.error} onRetry={reload} retrying={detail.isFetching} /> : news && <>
                        <div ref={previewRef} onLoadCapture={event => recordPhoto(event.target)} onErrorCapture={event => recordPhoto(event.target, true)}>
                            <BenefitDetailContent item={news} preview status={benefitReviewLabel(news.benefitState)} photoAttempt={photoAttempt} />
                        </div>
                        {photosFailed && <DataState compact state="error" title="신청 사진을 불러오지 못했어요."
                            description="첨부 사진을 모두 확인한 뒤 승인할 수 있어요." onRetry={retryPhotos} />}
                        {news.benefitReviewNote && <p className="reserve-feed-note">이전 심사 사유: {news.benefitReviewNote}</p>}
                        {news.benefitState === 'PENDING' && <Form form={form} layout="vertical" disabled={busy}>
                            <Form.Item name="note" label="승인·반려 사유" rules={[{ required: true, whitespace: true, message: '심사 사유를 입력해주세요.' }, { max: 1000, message: '1000자 이하로 입력해주세요.' }]}>
                                <FormTextArea rows={3} maxLength={1000} aria-label="혜택 심사 사유" /></Form.Item></Form>}
                        {!photosReady && !photosFailed && canReview && <p className="reserve-feed-note" role="status">첨부 사진을 차례로 확인한 뒤 승인할 수 있어요.</p>}
                        {detail.isError ? <DataState compact state="error" title="최신 신청 상태를 확인하지 못했어요." error={detail.error} onRetry={reload} retrying={detail.isFetching} />
                            : (conflict || changedRevision) && <div className="reserve-benefit-review-change" role="status">
                                <p>{conflict === 'unconfirmed' ? '입력한 사유는 유지했어요. 다시 심사하기 전에 최신 신청 상태를 확인해주세요.'
                                    : '신청 내용이 변경됐어요. 입력한 사유는 유지했어요. 변경된 글·사진을 확인해주세요.'}</p>
                                <Button variant="outline" size="sm" disabled={detail.isFetching || changedRevision || busy}
                                    onClick={() => setConflict(null)}>{conflict === 'unconfirmed' ? '신청 상태 확인' : '변경 내용 확인'}</Button></div>}
                        </>}
        </FormModal>
    </section>;
}
