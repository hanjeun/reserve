import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Form} from 'antd';
import Pagination from '../common/Pagination';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataState, FilterMenu, FormModal, FormTextArea, RefreshButton } from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import { BenefitDetailContent } from '../store-news/StoreNewsPresentation';
import StoreNewsSkeleton from '../store-news/StoreNewsSkeleton';
import { FeedReportListSkeleton } from '../feed/FeedSkeleton';
import { storeNewsKeys, useStoreNewsConfig, invalidateStoreNews } from '../../hooks/storeNewsQueries';
import storeNewsService from '../../services/storeNewsService';
import useMessage from '../../hooks/useMessage';
import { benefitReviewLabel } from '../../utils/storeNews';
import { feedDate, feedMediaUrl, feedTotal } from '../../utils/feed';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { useQueryParamsState } from '../../hooks/useQueryParamState';
import useStoreNewsEvents from '../../hooks/useStoreNewsEvents';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import { isBlockingListReadError, isReadAccessDenied } from '../../hooks/liveUpdateQueries';
import { useWindowWidth } from '../../hooks';
import ManagementListToolbar from '../common/ManagementListToolbar';
import { BenefitApplicationsSkeleton } from './ManagementReviewSkeletons';
import { BENEFIT_QUERY_DEFAULTS, BENEFIT_STATE_OPTIONS, reviewOption, reviewPage } from './managementReviewQuery';
import { isMissingRequestError } from '../../utils/listErrorMessage';

const PAGE_SIZE = 20;
export default function BenefitApplicationsPanel() {
    const client = useQueryClient();
    const { message } = useMessage();
    const config = useStoreNewsConfig(true);
    const enabled = config.data?.benefitApprovalEnabled === true;
    const active = useContext(WorkspaceActivityContext);
    const mobile = useWindowWidth() < 576;
    const automatic = useLiveUpdatesStatus().domains.includes('NEWS');
    const listRef = useRef(null);
    useStoreNewsEvents(active && enabled && config.data?.benefitEventsEnabled === true, true);
    const [query, setQuery] = useQueryParamsState(BENEFIT_QUERY_DEFAULTS);
    const state = reviewOption(BENEFIT_STATE_OPTIONS, query.benefitState, 'PENDING');
    const page = reviewPage(query.benefitPage);
    const setPage = value => setQuery({ benefitPage: String(value) });
    const [selection, setSelection] = useState({ open: false, id: null, news: null });
    const [loaded, setLoaded] = useState(new Set());
    const [conflict, setConflict] = useState(false);
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
        enabled: active && enabled && selection.open && Boolean(selection.id), staleTime: 0, retry: false });
    useListRefreshAnchor(listRef, `${state}:${page}`, list.isFetching, list.data);
    const unavailable = detail.isError && isMissingRequestError(detail.error) || detail.data?.state === 'DELETED';
    const latestReady = selection.open && detail.isSuccess && !detail.isFetching && detail.data?.id === selection.id && !unavailable;
    const changedRevision = latestReady && selection.news && selection.news.revision !== detail.data.revision;
    if (latestReady && selection.news?.revision !== detail.data.revision) {
        if (selection.news) setConflict(true);
        setLoaded(new Set());
        setSelection({ ...selection, news: detail.data });
    }
    const news = unavailable ? null : selection.news;
    useEffect(() => {
        if (selection.open && unavailable) void client.invalidateQueries({ queryKey: ['store-news', 'applications'] });
    }, [selection.open, unavailable, client]);
    const total = feedTotal(list.data);
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    useEffect(() => { if (list.isSuccess && !list.isFetching && !list.isPlaceholderData && page > lastPage) setQuery({ benefitPage: String(lastPage) }); },
        [list.isSuccess, list.isFetching, list.isPlaceholderData, page, lastPage, setQuery]);
    const recordPhoto = useCallback(image => {
        if (!image?.complete || !image.naturalWidth) return;
        const src = image.getAttribute('src');
        if (!(news?.images || []).some(item => feedMediaUrl(item.url) === src)) return;
        setLoaded(current => current.has(src) ? current : new Set([...current, src]));
    }, [news, setLoaded]);
    useEffect(() => {
        // 이미 브라우저에서 읽은 동일 사진도 인식한다. URL만 확인하고 승인하지 않는다.
        previewRef.current?.querySelectorAll('img').forEach(recordPhoto);
    }, [recordPhoto, selection.open]);
    const photosReady = news?.images?.length > 0 && news.images.every(item => loaded.has(feedMediaUrl(item.url)));
    const review = useMutation({ mutationFn: async ({ id, revision, approved, note, session }) => {
        assertCurrentSession(session); const saved = await storeNewsService.review(id, { revision, approved, note }); assertCurrentSession(session); return saved;
    },
        onSuccess: async (_data, values) => {
            if (!isCurrentSession(values.session)) return;
            setSelection(current => ({ ...current, open: false }));
            await invalidateStoreNews(client);
            if (isCurrentSession(values.session)) message.success(values.approved ? '혜택을 승인했어요.' : '혜택 신청을 반려했어요.');
        },
        onError: error => {
            if (error.isStaleSession) return;
            if (error.status === 409) { setConflict(true); void detail.refetch(); }
            message.error(error.message);
        },
        onSettled: () => { submitLock.current = false; },
    });
    const openReview = item => {
        form.resetFields(); setLoaded(new Set()); setConflict(false);
        setSelection({ open: true, id: item.id, news: null });
    };
    const reload = async () => {
        if (submitLock.current || review.isPending) return;
        await Promise.allSettled([list.refetch(), ...(selection.open ? [detail.refetch()] : [])]);
    };
    const decide = async approved => {
        if (submitLock.current || review.isPending || conflict || changedRevision || detail.isFetching || detail.isError || !news || news.benefitState !== 'PENDING' || news.state !== 'PUBLISHED'
            || approved && !photosReady) return;
        const target = { id: news.id, revision: news.revision, session: currentSession().epoch };
        submitLock.current = true; setValidating(true);
        try { const values = await form.validateFields(); assertCurrentSession(target.session); await review.mutateAsync({ ...target, approved, note: values.note.trim() }); }
        catch { /* 입력 칸과 공통 오류 안내를 유지한다. */ }
        finally { submitLock.current = false; setValidating(false); }
    };
    const renderList = () => {
        if (config.isPending || enabled && list.isPending) return <FeedReportListSkeleton />;
        if (config.isError && !config.data) return <DataState state="error" title="혜택 심사 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
        if (!enabled) return <DataState state="empty" kind="news" title="혜택 신청·심사를 준비하고 있어요." />;
        if (blockingError) return <DataState state="error" title="혜택 신청을 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
        if (!list.data?.content?.length) return <DataState state="empty" kind="news" title="해당 상태의 혜택 신청이 없어요." />;
        return <ul className="reserve-feed-report-list reserve-benefit-review-list" aria-busy={list.isFetching}>{list.data.content.map(item => <li key={item.id} data-list-item-id={item.id}>
            <div><strong>{item.title}</strong><p>{item.storeName} · {benefitReviewLabel(item.benefitState)} · {feedDate(item.benefitRequestedAt)}</p></div>
            <Button variant="outline" size="sm" disabled={review.isPending || validating} onClick={() => openReview(item)}>검토</Button></li>)}</ul>;
    };
    const canReview = news?.benefitState === 'PENDING' && news?.state === 'PUBLISHED' && !conflict && !changedRevision && !detail.isFetching && !detail.isError;
    const busy = validating || review.isPending;
    if (config.isPending || enabled && list.isPending) return <BenefitApplicationsSkeleton state={state} showRefresh={!automatic} />;
    return <section ref={listRef} aria-label="혜택 신청 심사">
        <ManagementListToolbar leading={<span className="reserve-management-count">{blockingError ? '목록 확인 필요' : `${total.toLocaleString('ko-KR')}건`}</span>}
            trailing={<FilterMenu appearance="plain" value={state} options={BENEFIT_STATE_OPTIONS}
                aria-label="혜택 승인 상태" onChange={value => setQuery({ benefitState: value, benefitPage: '1' })} />}
            refresh={!automatic && <RefreshButton onReload={reload} loading={list.isFetching || selection.open && detail.isFetching} disabled={busy} label={mobile ? '' : '새로고침'} aria-label="혜택 신청 새로고침" />} />
        {list.isRefetchError && !blockingError && <DataState compact state="error" title="목록을 갱신하지 못했어요. 현재 내용은 유지했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />}
        {renderList()}
        {!blockingError && list.data && total > PAGE_SIZE && <Pagination current={page} total={total} pageSize={PAGE_SIZE} showSizeChanger={false}
            disabled={busy} onChange={setPage} />}
        <FormModal open={selection.open} title="혜택 신청 검토" width={680} rootClassName="reserve-feed-modal reserve-store-news-modal"
            submitting={busy} navigationDirty={Boolean(selection.open && note)}
            onClose={() => { if (!review.isPending && !submitLock.current) setSelection(current => ({ ...current, open: false })); }}
            footer={<ModalActionGroup>
                <Button variant="outline" size="sm" onClick={() => decide(false)} disabled={!canReview || busy}>반려</Button>
                <Button size="sm" onClick={() => decide(true)} loading={review.isPending} disabled={!canReview || !photosReady || busy}>승인</Button></ModalActionGroup>}>
            {unavailable ? <DataState state="empty" kind="news" title="삭제되거나 철회된 소식이에요." />
                : !news && detail.isPending || !news && detail.isFetching ? <StoreNewsSkeleton contentOnly />
                : !news && detail.isError ? <DataState state="error" title="신청 내용을 불러오지 못했어요." error={detail.error} onRetry={reload} retrying={detail.isFetching} />
                    : detail.isError && isReadAccessDenied(detail.error) ? <DataState state="error" title="신청 내용을 더 이상 볼 수 없어요." error={detail.error} onRetry={reload} retrying={detail.isFetching} /> : news && <>
                        <div ref={previewRef} onLoadCapture={event => recordPhoto(event.target)}><BenefitDetailContent item={news} preview status={benefitReviewLabel(news.benefitState)} /></div>
                        {news.benefitReviewNote && <p className="reserve-feed-note">이전 심사 사유: {news.benefitReviewNote}</p>}
                        {news.benefitState === 'PENDING' && <Form form={form} layout="vertical" disabled={busy}>
                            <Form.Item name="note" label="승인·반려 사유" rules={[{ required: true, whitespace: true, message: '심사 사유를 입력해주세요.' }, { max: 1000, message: '1000자 이하로 입력해주세요.' }]}>
                                <FormTextArea rows={3} maxLength={1000} aria-label="혜택 심사 사유" /></Form.Item></Form>}
                        {!photosReady && canReview && <p className="reserve-feed-note" role="status">사진을 모두 불러온 뒤 승인할 수 있어요.</p>}
                        {detail.isError ? <DataState compact state="error" title="최신 신청 상태를 확인하지 못했어요." error={detail.error} onRetry={reload} retrying={detail.isFetching} />
                            : (conflict || changedRevision) && <div className="reserve-benefit-review-change" role="status"><p>신청 내용이 변경됐어요. 입력한 사유는 유지했어요. 변경된 글·사진을 확인해주세요.</p>
                                <Button variant="outline" size="sm" disabled={detail.isFetching || changedRevision || busy} onClick={() => setConflict(false)}>변경 내용 확인</Button></div>}
                        </>}
        </FormModal>
    </section>;
}
