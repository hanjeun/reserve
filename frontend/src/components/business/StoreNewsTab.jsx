import { useContext, useEffect, useRef, useState } from 'react';
import Pagination from '../common/Pagination';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, DataState, FilterMenu, FormModal, RefreshButton } from '../common';
import StateIllustration from '../common/StateIllustration';
import ListingCount from '../common/ListingCount';
import useStoreNewsEvents from '../../hooks/useStoreNewsEvents';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { useWindowWidth } from '../../hooks';
import StoreNewsSkeleton from '../store-news/StoreNewsSkeleton';
import StoreNewsEditor from '../store-news/StoreNewsEditor';
import { StoreNewsWriteAction } from '../store-news/StoreNewsActions';
import { BenefitDetailContent, StoreNewsMetadata } from '../store-news/StoreNewsPresentation';
import { STORE_NEWS_STATES, benefitReviewLabel } from '../../utils/storeNews';
import { feedPage, feedTotal } from '../../utils/feed';
import { storeNewsKeys, useStoreNewsConfig, invalidateStoreNews } from '../../hooks/storeNewsQueries';
import storeNewsService from '../../services/storeNewsService';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import useQueryParamsState from '../../hooks/useQueryParamState';
import AnimatedContent from '../common/AnimatedContent';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import { isBlockingListReadError, isReadAccessDenied } from '../../hooks/liveUpdateQueries';

const PAGE_SIZE = 12;
const QUERY_DEFAULTS = { newsStore: 'ALL', newsState: 'ALL', newsPage: '1' };

export default function StoreNewsTab() {
    const user = useAuthStore(state => state.user);
    const business = user?.role === 'BUSINESS';
    const active = useContext(WorkspaceActivityContext);
    const mobile = useWindowWidth() < 576;
    const automatic = useLiveUpdatesStatus().domains.includes('NEWS');
    const listRef = useRef(null);
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const [params, setParams] = useQueryParamsState(QUERY_DEFAULTS);
    const page = feedPage(params.newsPage);
    const selectedState = STORE_NEWS_STATES.some(item => item.value === params.newsState) ? params.newsState : 'ALL';
    const requestedStore = Number(params.newsStore);
    const storeId = Number.isSafeInteger(requestedStore) && requestedStore > 0 ? requestedStore : undefined;
    const config = useStoreNewsConfig(business);
    const enabled = business && config.data?.enabled === true;
    useStoreNewsEvents(active && enabled && config.data?.benefitEventsEnabled === true, true);
    const stores = useQuery({ queryKey: storeNewsKeys.stores(), queryFn: ({ signal }) => storeNewsService.stores(signal), enabled: active && enabled });
    const owned = Array.isArray(stores.data) ? stores.data : stores.data?.content || [];
    const queryParams = { page: page - 1, size: PAGE_SIZE, state: selectedState, storeId };
    const list = useQuery({ queryKey: storeNewsKeys.mine(queryParams), queryFn: ({ signal }) => storeNewsService.mine(queryParams, signal), enabled: active && enabled, placeholderData: keepPreviousData });
    const total = feedTotal(list.data), lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    useListRefreshAnchor(listRef, `${storeId}:${selectedState}:${page}`, list.isFetching, list.data);
    const visibleNews = (list.data?.content || []).filter(item => item.state !== 'DELETED');
    const blockingError = isBlockingListReadError(list.error, visibleNews);
    const [editor, setEditor] = useState({ open: false, id: undefined });
    const [preview, setPreview] = useState({ open: false, news: null });
    const previewQuery = useQuery({ queryKey: storeNewsKeys.detail(preview.news?.id),
        queryFn: ({ signal }) => storeNewsService.detail(preview.news.id, signal),
        enabled: active && enabled && preview.open && Boolean(preview.news?.id), staleTime: 0, retry: false });
    const previewNews = previewQuery.data?.id === preview.news?.id ? previewQuery.data : preview.news;
    const change = patch => setParams({ newsPage: '1', ...patch });
    useEffect(() => {
        if (params.newsState !== selectedState) setParams({ newsState: selectedState, newsPage: '1' });
    }, [params.newsState, selectedState, setParams]);
    useEffect(() => {
        if (!list.isSuccess || list.isFetching || list.isPlaceholderData || page <= lastPage) return;
        setParams({ newsPage: String(lastPage) });
    }, [list.isSuccess, list.isFetching, list.isPlaceholderData, page, lastPage, setParams]);
    const remove = useMutation({ mutationFn: id => storeNewsService.remove(id),
        onSuccess: async () => { await invalidateStoreNews(client); message.success('가게 소식을 삭제했어요.'); } });
    const onDelete = item => confirm({ title: '가게 소식을 삭제할까요?',
        content: '가게 소식과 사진이 공개 혜택에서 삭제돼요. 삭제한 소식은 복원할 수 없어요.',
        okText: '삭제', okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(item.id).catch(error => { if (!error.isStaleSession) message.error(error.message); throw error; }) });
    if (!business) return <DataState state="empty" title="가게 소식 관리는 사업자 계정에서 이용할 수 있어요." />;
    if (config.isPending) return <StoreNewsSkeleton showRefresh={!automatic} />;
    if (config.isError && !config.data) return <DataState state="error" title="가게 소식 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
    if (!enabled) return <DataState state="empty" kind="news" title="가게 소식 작성을 준비하고 있어요." description="작성 기능이 준비되면 이 화면에서 소식을 작성하고 관리할 수 있어요." />;
    const writeUnavailable = stores.isPending ? '내 가게를 불러오고 있어요.'
        : stores.isError ? '내 가게를 불러오지 못했어요. 다시 불러온 뒤 작성해주세요.'
            : !owned.length ? '소식을 게시할 수 있는 내 가게가 있어야 작성할 수 있어요.' : '';
    return <section ref={listRef} className="reserve-store-news-management" aria-label="내 가게 소식 관리">
        <div className="reserve-explore-filters reserve-store-news-manage-toolbar"><StoreNewsWriteAction unavailableReason={writeUnavailable} onWrite={() => setEditor({ open: true, mounted: true })} /><ListingCount>{blockingError ? '소식 확인 필요' : `${total.toLocaleString('ko-KR')}개 소식`}</ListingCount>
            <div className="reserve-explore-filter-controls"><FilterMenu appearance="plain" value={storeId || 'ALL'} aria-label="내 소식 가게 필터" options={[{ value: 'ALL', label: '전체 가게' }, ...owned.map(store => ({ value: store.id, label: store.name }))]}
                loading={stores.isPending} disabled={stores.isPending || stores.isError && !stores.data} onChange={value => change({ newsStore: value })} />
                <FilterMenu appearance="plain" value={selectedState} options={STORE_NEWS_STATES} aria-label="내 소식 상태 필터" onChange={value => change({ newsState: value })} />
                {!automatic && <RefreshButton onReload={() => Promise.allSettled([list.refetch(), stores.refetch(), ...(preview.open ? [previewQuery.refetch()] : [])])} loading={list.isFetching || stores.isFetching || preview.open && previewQuery.isFetching} label={mobile ? '' : '새로고침'} aria-label="내 가게 소식 새로고침" />}</div></div>
        {stores.isError && <DataState state="error" compact title="내 가게를 불러오지 못했어요." error={stores.error} onRetry={stores.refetch} retrying={stores.isFetching} />}
        {stores.isSuccess && !owned.length && <p className="reserve-feed-note" role="status">소식을 게시할 수 있는 내 가게가 없어요. <Link to="/my-stores">내 가게 확인</Link></p>}
        <AnimatedContent motionKey={`${storeId || 'ALL'}:${selectedState}:${page}`} ready={!list.isPending && !list.isPlaceholderData}>
        {list.isRefetchError && !blockingError && <DataState compact state="error" title="목록을 갱신하지 못했어요. 현재 내용은 유지했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />}
        {list.isPending ? <StoreNewsSkeleton contentOnly /> : blockingError ? <DataState state="error" title="내 소식을 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />
            : !visibleNews.length ? <DataState state="empty" kind="news" title="조건에 맞는 가게 소식이 없어요." />
                : <div className="reserve-store-news-manage-list" aria-busy={list.isFetching}>{visibleNews.map(item => <article className="reserve-store-news-manage-row" key={item.id} data-list-item-id={item.id}>
                    <h3>{item.title || '제목 없는 소식'}</h3>
                    <div className="reserve-store-news-review-summary">
                        {item.state !== 'DRAFT' && item.state !== 'HIDDEN' && ['PENDING', 'REJECTED'].includes(item.benefitState)
                            && <StateIllustration name={item.benefitState === 'PENDING' ? 'benefit-review-pending' : 'benefit-review-rejected'} size="sm" />}
                        <div><p className="reserve-feed-note">{item.storeName} · {item.state === 'DRAFT' ? '임시저장' : item.state === 'HIDDEN' ? '관리자 숨김' : benefitReviewLabel(item.benefitState)}</p>
                            {item.benefitReviewNote && <p className="reserve-feed-note">심사 사유: {item.benefitReviewNote}</p>}</div>
                    </div>
                    <StoreNewsMetadata item={item} />
                    <div className="reserve-store-news-manage-actions"><Button variant="secondary" size="sm" onClick={() => setPreview({ open: true, news: item })}>미리보기</Button>
                            {['DRAFT', 'PUBLISHED', 'ENDED'].includes(item.state) && <Button variant="outline" size="sm" onClick={() => setEditor({ open: true, id: item.id, mounted: true })}>수정</Button>}
                            {item.state === 'PUBLISHED' && item.benefitState === 'APPROVED' && <Link className="reserve-store-news-write-link reserve-btn reserve-btn--secondary" to={`/benefits/${item.id}`}>공개 혜택</Link>}
                            <Button variant="danger" size="sm" onClick={() => onDelete(item)} disabled={remove.isPending}
                                loading={remove.isPending && remove.variables === item.id}>삭제</Button></div>
                </article>)}</div>}
        </AnimatedContent>
        {list.data && total > PAGE_SIZE && <nav className="reserve-feed-pagination" aria-label="내 가게 소식 페이지"><Pagination current={page} total={total} pageSize={PAGE_SIZE} showSizeChanger={false}
            onChange={value => change({ newsPage: String(value) })} /></nav>}
        {editor.mounted && <StoreNewsEditor open={editor.open} newsId={editor.id} initialStoreId={storeId}
            onClose={() => setEditor(current => ({ ...current, open: false }))} onSaved={() => setEditor(current => ({ ...current, open: false }))} />}
        <FormModal open={preview.open} title="가게 소식 미리보기" onClose={() => setPreview(current => ({ ...current, open: false }))} footer={null} width={740} rootClassName="reserve-store-news-modal">
            {previewQuery.isError && <DataState state="error" compact title="소식 상태를 확인하지 못했어요." error={previewQuery.error} onRetry={previewQuery.refetch} retrying={previewQuery.isFetching} />}
            {previewNews && !isReadAccessDenied(previewQuery.error) && <BenefitDetailContent item={previewNews} preview />}
        </FormModal>
    </section>;
}
