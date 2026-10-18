import { useEffect, useRef, useState } from 'react';
import Pagination from '../../components/common/Pagination';
import { ArrowRightOutlined } from '../../components/common/icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { DataState, FilterMenu, RefreshButton } from '../../components/common';
import useStoreNewsEvents from '../../hooks/useStoreNewsEvents';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import BenefitListSkeleton from '../../components/common/BenefitListSkeleton';
import { BenefitRow } from '../../components/store-news/StoreNewsPresentation';
import { StoreNewsPublicToolbarSkeleton } from '../../components/store-news/StoreNewsSkeleton';
import StoreNewsEditor from '../../components/store-news/StoreNewsEditor';
import { StoreNewsManageAction, StoreNewsWriteAction } from '../../components/store-news/StoreNewsActions';
import { useStoreNewsConfig } from '../../hooks/storeNewsQueries';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { benefitKeys } from '../../hooks/queryKeys';
import benefitService from '../../services/benefitService';
import useAuthStore from '../../store/useAuthStore';
import { STORE_NEWS_TYPES } from '../../utils/storeNews';
import useListQueryNormalization from '../../hooks/useListQueryNormalization';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';

export const BENEFIT_PAGE_SIZE = 12;

export const BenefitsSkeleton = BenefitListSkeleton;

export { BenefitRow };


export default function Benefits() {
    useDocumentTitle('혜택 · 가게 소식');
    const isMobile = useWindowWidth() < 576;
    const automatic = useLiveUpdatesStatus().domains.includes('NEWS');
    const user = useAuthStore(state => state.user);
    const business = user?.role === 'BUSINESS';
    const config = useStoreNewsConfig(true);
    const approvalReady = config.data?.benefitApprovalEnabled === true;
    const listRef = useRef(null);
    useStoreNewsEvents(approvalReady && config.data?.benefitEventsEnabled === true);
    const [editor, setEditor] = useState({ mounted: false, open: false });
    const writeUnavailable = config.isPending ? '작성 가능 여부를 확인하고 있어요.'
        : config.isError ? '작성 상태를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'
            : config.data?.enabled !== true ? '가게 소식 작성을 준비하고 있어요.'
                : config.data?.benefitApprovalEnabled !== true ? '관리자 승인형 혜택 신청을 준비하고 있어요.' : '';
    const [params, setParams] = useSearchParams();
    useListQueryNormalization(params);
    const requested = Number(params.get('page') ?? 1);
    const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 10000 ? requested : 1;
    const type = STORE_NEWS_TYPES.some(option => option.value === params.get('newsType')) ? params.get('newsType') : 'ALL';
    const period = params.get('period') === 'ALL' ? 'ALL' : 'ONGOING';
    const queryParams = { page: page - 1, size: BENEFIT_PAGE_SIZE, newsType: type === 'ALL' ? undefined : type, period };
    const changeFilter = (key, value) => {
        const updated = new URLSearchParams(params);
        updated.set('page', '1');
        updated.set(key, value);
        setParams(updated);
    };
    const { data, isPending, isFetching, isError, isSuccess, isPlaceholderData, error, refetch } = useQuery({
        queryKey: [...benefitKeys.list(queryParams), 'approved-only'],
        queryFn: ({ signal }) => benefitService.getList(queryParams, signal),
        enabled: approvalReady,
        staleTime: 60000,
        placeholderData: keepPreviousData,
    });
    const items = Array.isArray(data?.content) ? data.content : [];
    const blockingError = isBlockingListReadError(error, items);
    useListRefreshAnchor(listRef, `${page}:${type}:${period}`, isFetching, data);
    const rawTotal = data?.page?.totalElements ?? data?.totalElements ?? 0;
    const total = Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal : 0;
    const totalPages = Math.max(1, Math.ceil(total / BENEFIT_PAGE_SIZE));
    const coldLoading = config.isPending || approvalReady && isPending;
    const firstPageParams = new URLSearchParams(params);
    firstPageParams.set('page', '1');
    const firstPageTo = { pathname: '/benefits', search: firstPageParams.toString() };
    useEffect(() => {
        if (isPlaceholderData || requested === page && (!isSuccess || isFetching || page <= totalPages)) return;
        const next = isSuccess ? Math.min(page, totalPages) : page;
        setParams(previous => {
            if (previous.get('page') !== params.get('page')) return previous;
            const updated = new URLSearchParams(previous);
            updated.set('page', String(next));
            return updated;
        }, { replace: true });
    }, [requested, page, isSuccess, isFetching, isPlaceholderData, totalPages, params, setParams]);
    // 소식 본문 — 첫 로딩 → 실패 → 빈 페이지 → 목록 순으로 판정한다.
    const renderNews = () => {
        if (config.isPending) return <BenefitsSkeleton />;
        if (config.isError && !config.data) return <DataState state="error" title="혜택 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
        if (config.data?.benefitApprovalEnabled !== true) return <DataState state="empty" kind="news" title="관리자 승인형 혜택을 준비하고 있어요."
            description="혜택은 사진과 이용 조건을 확인하고 승인 후 공개해요." />;
        if (isPending) return <BenefitsSkeleton />;
        if (blockingError) {
            return (
                <DataState state="error" kind="news" subject="가게 소식" error={error}
                    title="가게 소식을 불러오지 못했어요." onRetry={refetch} retrying={isFetching} />
            );
        }
        if (items.length === 0) {
            return <DataState state="empty" kind="news"
                title={total > 0 ? '이 페이지에는 소식이 없어요.' : '아직 등록된 가게 소식이 없어요.'}
                action={<Link to={total > 0 ? firstPageTo : '/stores'} className="reserve-benefits-text-link">{total > 0 ? '첫 페이지로' : '가게 둘러보기'} <ArrowRightOutlined aria-hidden="true" /></Link>} />;
        }
        return <div className="reserve-benefit-list" aria-busy={isFetching}>{items.map(item => <BenefitRow key={item.id} item={item} />)}</div>;
    };
    return (
        <section className="reserve-benefits-page" aria-labelledby="benefits-title">
            <h1 id="benefits-title" className="reserve-discovery-visually-hidden">혜택</h1>
            {coldLoading ? <StoreNewsPublicToolbarSkeleton business={business} type={type} period={period} showRefresh={!automatic} /> : <div className="reserve-explore-filters reserve-store-news-toolbar" data-discovery-swipe-ignore="true">
                {business && <div className="reserve-store-news-actions">
                    <StoreNewsWriteAction unavailableReason={writeUnavailable} onWrite={() => setEditor({ mounted: true, open: true })} />
                    <StoreNewsManageAction />
                </div>}
                <span className="reserve-explore-count">{approvalReady && data && !blockingError ? `${total.toLocaleString('ko-KR')}개 소식` : approvalReady ? '소식 확인 필요' : '혜택 상태 확인 필요'}</span>
                <div className="reserve-explore-filter-controls">
                    <FilterMenu appearance="plain" aria-label="가게 소식 종류" value={type} options={[{ value: 'ALL', label: '모든 소식' }, ...STORE_NEWS_TYPES]} onChange={value => changeFilter('newsType', value)} />
                    <FilterMenu appearance="plain" aria-label="가게 소식 기간" value={period} options={[{ value: 'ONGOING', label: '진행 소식' }, { value: 'ALL', label: '전체 기간' }]} onChange={value => changeFilter('period', value)} />
                    {!automatic && <RefreshButton onReload={refetch} loading={isFetching} disabled={!approvalReady} label={isMobile ? '' : '새로고침'} aria-label="혜택 새로고침" />}
                </div>
            </div>}
            <section ref={listRef} id="benefit-news" className="reserve-benefits-news" aria-label="가게 소식">
                <div className="reserve-benefits-news-content">
                    {isError && !blockingError && <DataState compact state="error" title="목록을 갱신하지 못했어요. 현재 내용은 유지했어요." error={error} onRetry={refetch} retrying={isFetching} />}
                    {renderNews()}
                </div>
                {isFetching && !isPending && !isError && <p className="reserve-discovery-visually-hidden"><output>소식을 새로 불러오는 중</output></p>}
                {!isPending && !blockingError && data && total > BENEFIT_PAGE_SIZE && (
                    <nav aria-label="가게 소식 페이지" className="reserve-benefits-pagination"><Pagination current={page} pageSize={BENEFIT_PAGE_SIZE} total={total} showSizeChanger={false} showLessItems={isMobile} size={isMobile ? 'small' : 'default'} onChange={next => { const updated = new URLSearchParams(params); updated.set('page', String(next)); setParams(updated); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }} /></nav>
                )}
            </section>
            {business && editor.mounted && <StoreNewsEditor open={editor.open}
                onClose={() => setEditor(current => ({ ...current, open: false }))}
                onSaved={() => setEditor(current => ({ ...current, open: false }))} />}
        </section>
    );
}
