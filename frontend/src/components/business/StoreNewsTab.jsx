import { useContext, useEffect, useRef, useState } from 'react';
import Pagination from '../common/Pagination';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Button, DataState, FilterMenu, FormModal, RefreshButton } from '../common';
import IconTool from '../common/IconTool';
import { DeleteOutlined, EditOutlined, EyeOutlined } from '../common/icons';
import InterfaceIcon from '../common/InterfaceIcon';
import StoreListViewToggle from '../store/StoreListViewToggle';
import ListingCount from '../common/ListingCount';
import useStoreNewsEvents from '../../hooks/useStoreNewsEvents';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { useWindowWidth } from '../../hooks';
import StoreNewsSkeleton from '../store-news/StoreNewsSkeleton';
import StoreNewsEditor from '../store-news/StoreNewsEditor';
import { StoreNewsWriteAction } from '../store-news/StoreNewsActions';
import { BenefitDetailContent } from '../store-news/StoreNewsPresentation';
import StoreNewsManagementItem from '../store-news/StoreNewsManagementItem';
import { STORE_NEWS_STATES, canManageStoreNews } from '../../utils/storeNews';
import { feedPage, feedTotal } from '../../utils/feed';
import { storeNewsKeys, useStoreNewsConfig, invalidateStoreNews } from '../../hooks/storeNewsQueries';
import storeNewsService from '../../services/storeNewsService';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import useQueryParamsState from '../../hooks/useQueryParamState';
import AnimatedContent from '../common/AnimatedContent';
import { isBlockingListReadError, isReadAccessDenied, refetchFailedReads } from '../../hooks/liveUpdateQueries';
import { assertCurrentSession, isCurrentSession } from '../../api/sessionScope';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';
import { colors } from '../../styles/tokens';
import { draftPath } from '../../pages/drafts/draftWorkspace';

const PAGE_SIZE = 12;
const QUERY_DEFAULTS = { newsStore: 'ALL', newsState: 'ALL', newsPage: '1', view: 'list' };

export default function StoreNewsTab() {
    const user = useAuthStore(state => state.user);
    const revision = useAuthStore(state => state.sessionRevision);
    const business = canManageStoreNews(user);
    const active = useContext(WorkspaceActivityContext);
    const navigate = useNavigate();
    const mobile = useWindowWidth() < 576;
    const listRef = useRef(null);
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const [params, setParams] = useQueryParamsState(QUERY_DEFAULTS);
    const page = feedPage(params.newsPage);
    const view = params.view === 'cards' ? 'cards' : 'list';
    const legacyDraftView = params.newsState === 'DRAFT';
    const selectedState = STORE_NEWS_STATES.some(item => item.value === params.newsState) ? params.newsState : 'ALL';
    const requestedStore = Number(params.newsStore);
    const storeId = Number.isSafeInteger(requestedStore) && requestedStore > 0 ? requestedStore : undefined;
    const config = useStoreNewsConfig(business);
    const enabled = business && config.data?.enabled === true;
    useStoreNewsEvents(active && enabled && config.data?.benefitEventsEnabled === true, true);
    const stores = useQuery({ queryKey: storeNewsKeys.stores(), queryFn: ({ signal }) => storeNewsService.stores(signal), enabled: active && enabled });
    const owned = Array.isArray(stores.data) ? stores.data : stores.data?.content || [];
    const queryParams = { page: page - 1, size: PAGE_SIZE, state: selectedState === 'ALL' ? 'MANAGED' : selectedState, storeId };
    const list = useQuery({ queryKey: storeNewsKeys.mine(queryParams), queryFn: ({ signal }) => storeNewsService.mine(queryParams, signal),
        enabled: active && enabled && !legacyDraftView, placeholderData: keepPreviousData });
    const total = feedTotal(list.data), lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    useListRefreshAnchor(listRef, `${storeId}:${selectedState}:${page}`, list.isFetching, list.data);
    const visibleNews = (list.data?.content || []).filter(item => item.state !== 'DELETED');
    const reads = [config, ...(active && enabled ? [list, stores] : [])];
    const blockingError = active && enabled && isBlockingListReadError(list.error, visibleNews);
    const backgroundFailure = !blockingError && [...(active && enabled ? [list] : []), config, ...(active && enabled ? [stores] : [])].find(query => query.isError);
    const retryReads = () => refetchFailedReads(reads);
    const retrying = reads.some(query => query.isFetching);
    const [editor, setEditor] = useState({ open: false, id: undefined });
    const [preview, setPreview] = useState({ open: false, news: null });
    const previewQuery = useQuery({ queryKey: storeNewsKeys.detail(preview.news?.id),
        queryFn: ({ signal }) => storeNewsService.detail(preview.news.id, signal),
        enabled: active && enabled && preview.open && Boolean(preview.news?.id), staleTime: 0, retry: false });
    const previewNews = previewQuery.data?.id === preview.news?.id ? previewQuery.data : preview.news;
    const change = patch => setParams({ newsPage: '1', ...patch });
    useEffect(() => {
        if (!active) return;
        if (legacyDraftView && business) { navigate(draftPath('news', page, view), { replace: true }); return; }
        if (params.newsState !== selectedState) setParams({ newsState: selectedState, newsPage: '1' });
    }, [active, business, legacyDraftView, navigate, page, view, params.newsState, selectedState, setParams]);
    useEffect(() => {
        if (!list.isSuccess || list.isFetching || list.isPlaceholderData || page <= lastPage) return;
        setParams({ newsPage: String(lastPage) });
    }, [list.isSuccess, list.isFetching, list.isPlaceholderData, page, lastPage, setParams]);
    const deleteDialog = useRef(null);
    useEffect(() => () => deleteDialog.current?.destroy(), [active, revision]);
    const remove = useMutation({
        mutationFn: async ({ id, session }) => {
            assertCurrentSession(session);
            await storeNewsService.remove(id);
            assertCurrentSession(session);
        },
        onSuccess: async (_, { session }) => {
            if (!isCurrentSession(session)) return;
            await invalidateStoreNews(client);
            if (isCurrentSession(session)) message.success('가게 소식을 삭제했어요.');
        },
    });
    const onDelete = item => {
        if (!active || deleteDialog.current || remove.isPending || !isCurrentSession(revision)) return;
        const session = revision;
        deleteDialog.current = confirm({
            title: '가게 소식을 삭제할까요?',
            content: '가게 소식과 사진이 공개 혜택에서 삭제돼요. 삭제한 소식은 복원할 수 없어요.',
            okText: '삭제', okButtonProps: { danger: true },
            afterClose: () => { deleteDialog.current = null; },
            onOk: async () => {
                if (!isCurrentSession(session)) return;
                try { await remove.mutateAsync({ id: item.id, session }); }
                catch (error) {
                    if (!isCurrentSession(session) || error?.isStaleSession || error?.isSessionExpired) return;
                    if (isResponseUnconfirmed(error)) {
                        message.warning('삭제 결과를 확인하지 못했어요. 목록에서 다시 확인해주세요.');
                        void invalidateStoreNews(client);
                        return;
                    }
                    handleApiError(error, message, '가게 소식을 삭제하지 못했어요.');
                    throw error;
                }
            },
        });
    };
    const itemActions = (item, openPreview) => {
        const edit = () => setEditor({ open: true, id: item.id, mounted: true });
        const deletable = { disabled: remove.isPending, loading: remove.isPending && remove.variables?.id === item.id };
        const editable = ['DRAFT', 'PUBLISHED', 'ENDED'].includes(item.state);
        return (view === 'list' && mobile ? [
            <IconTool key="preview" label="미리보기" icon={<EyeOutlined aria-hidden="true" />} onClick={openPreview} />,
            editable && <IconTool key="edit" label="수정" icon={<EditOutlined aria-hidden="true" />} onClick={edit} />,
            <IconTool key="delete" label="삭제" icon={<DeleteOutlined aria-hidden="true" style={{ color: colors.error.main }} />}
                onClick={() => onDelete(item)} {...deletable} />,
        ] : [
            <Button key="preview" variant="ghost-sm" onClick={openPreview}><EyeOutlined aria-hidden="true" /> 미리보기</Button>,
            editable && <Button key="edit" variant="ghost-sm" onClick={edit}><EditOutlined aria-hidden="true" /> 수정</Button>,
            <Button key="delete" variant="ghost-sm-danger" onClick={() => onDelete(item)} {...deletable}><DeleteOutlined aria-hidden="true" /> 삭제</Button>,
        ]).filter(Boolean);
    };
    if (!business) return <DataState state="empty" title="가게 소식 관리는 사업자·관리자 계정에서 이용할 수 있어요." />;
    if (legacyDraftView || config.isPending) return <StoreNewsSkeleton view={view} />;
    if (config.isError && (!config.data || isReadAccessDenied(config.error))) return <DataState state="error" title="가게 소식 상태를 불러오지 못했어요." error={config.error} onRetry={retryReads} retrying={retrying} />;
    if (!enabled) return <>
        {config.isError && <DataState state="error" compact title="가게 소식 상태를 갱신하지 못했어요." error={config.error} onRetry={retryReads} retrying={retrying} />}
        <DataState state="empty" kind="news" title="가게 소식 작성을 준비하고 있어요." description="작성 기능이 준비되면 이 화면에서 소식을 작성하고 관리할 수 있어요." />
    </>;
    const writeUnavailable = stores.isPending ? '내 가게를 불러오고 있어요.'
        : stores.isError ? '내 가게를 불러오지 못했어요. 다시 불러온 뒤 작성해주세요.'
            : !owned.length ? '소식을 게시할 수 있는 내 가게가 있어야 작성할 수 있어요.' : '';
    return <section ref={listRef} className="reserve-store-news-management" aria-label="내 가게 소식 관리">
        <div className="reserve-explore-filters reserve-store-news-manage-toolbar">
            <StoreListViewToggle view={view} onChange={value => setParams({ view: value })} disabled={list.isPending} />
            <StoreNewsWriteAction unavailableReason={writeUnavailable} onWrite={() => setEditor({ open: true, mounted: true })} />
            <IconTool label="가게 소식 임시보관함" icon={<InterfaceIcon name="folder" />} to={draftPath('news', 1, view)} />
            <ListingCount>{blockingError ? '소식 확인 필요' : `${total.toLocaleString('ko-KR')}개 소식`}</ListingCount>
            <div className="reserve-explore-filter-controls"><FilterMenu appearance="plain" value={storeId || 'ALL'} aria-label="내 소식 가게 필터" options={[{ value: 'ALL', label: '전체 가게' }, ...owned.map(store => ({ value: store.id, label: store.name }))]}
                loading={stores.isPending} disabled={stores.isPending || stores.isError && !stores.data} onChange={value => change({ newsStore: value })} />
                <FilterMenu appearance="plain" value={selectedState} options={STORE_NEWS_STATES} aria-label="내 소식 상태 필터" onChange={value => change({ newsState: value })} />
                <RefreshButton onReload={() => Promise.allSettled([list.refetch(), stores.refetch(), ...(preview.open ? [previewQuery.refetch()] : [])])}
                    loading={list.isFetching || stores.isFetching || preview.open && previewQuery.isFetching}
                    label={mobile ? '' : '새로고침'} aria-label="내 가게 소식 새로고침" /></div></div>
        {backgroundFailure && <DataState state="error" compact title={backgroundFailure === stores ? '내 가게를 불러오지 못했어요.' : '가게 소식을 갱신하지 못했어요.'}
            error={backgroundFailure.error} onRetry={retryReads} retrying={retrying} />}
        {stores.isSuccess && !owned.length && <p className="reserve-feed-note" role="status">소식을 게시할 수 있는 내 가게가 없어요. <Link to="/my-stores">내 가게 확인</Link></p>}
        <AnimatedContent motionKey={`${storeId || 'ALL'}:${selectedState}:${page}:${view}`} ready={!list.isPending && !list.isPlaceholderData}>
        {list.isPending ? <StoreNewsSkeleton contentOnly view={view} /> : blockingError ? <DataState state="error" title="내 소식을 불러오지 못했어요." error={list.error} onRetry={retryReads} retrying={retrying} />
            : !visibleNews.length ? <DataState state="empty" kind="news" title="조건에 맞는 가게 소식이 없어요." />
                : <div className={view === 'cards' ? 'rsv-mystore-grid' : 'reserve-store-list-rows'} aria-busy={list.isFetching}>
                    {visibleNews.map(item => {
                        const openPreview = () => setPreview({ open: true, news: item });
                        return <StoreNewsManagementItem key={item.id} item={item} view={view}
                            onPreview={openPreview} actions={itemActions(item, openPreview)} />;
                    })}
                </div>}
        </AnimatedContent>
        {list.data && total > PAGE_SIZE && <nav className="reserve-feed-pagination" aria-label="내 가게 소식 페이지"><Pagination current={page} total={total} pageSize={PAGE_SIZE} showSizeChanger={false}
            onChange={value => change({ newsPage: String(value) })} /></nav>}
        {editor.mounted && <StoreNewsEditor open={editor.open} newsId={editor.id} initialStoreId={storeId}
            onClose={() => setEditor(current => ({ ...current, open: false }))} onSaved={saved => {
                setEditor(current => ({ ...current, open: false }));
                if (saved?.state === 'DRAFT') navigate(draftPath('news', 1, view));
            }} />}
        <FormModal open={preview.open} title="가게 소식 미리보기" onClose={() => setPreview(current => ({ ...current, open: false }))}
            footer={null} width={740} mobileSize="content" rootClassName="reserve-store-news-modal">
            {previewQuery.isError && <DataState state="error" compact title="소식 상태를 확인하지 못했어요." error={previewQuery.error} onRetry={previewQuery.refetch} retrying={previewQuery.isFetching} />}
            {previewNews && !isReadAccessDenied(previewQuery.error) && <BenefitDetailContent item={previewNews} preview
                notice={previewNews.benefitReviewNote && <p className="reserve-feed-note">심사 사유: {previewNews.benefitReviewNote}</p>} />}
        </FormModal>
    </section>;
}
