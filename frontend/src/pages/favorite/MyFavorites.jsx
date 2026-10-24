import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { DataState, FilterMenu, FilterToolbar, PageContainer, StoreCardSkeleton } from '../../components/common';
import ListingContent from '../../components/common/ListingContent';
import LikedContentList from '../../components/feed/LikedContentList';
import { useFeedInteractions } from '../../hooks/feedInteractionQueries';
import { StoreCard } from '../../components/store';
import StoreListViewToggle from '../../components/store/StoreListViewToggle';
import StoreListRow from '../../components/store/StoreListRow';
import StoreListRowSkeleton from '../../components/store/StoreListRowSkeleton';
import Bone from '../../components/common/Bone';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useViewModeParam from '../../hooks/useViewModeParam';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import { isBlockingListReadError, queryErrorStatus } from '../../hooks/liveUpdateQueries';
import { favoriteKeys } from '../../hooks/queryKeys';
import favoriteService from '../../services/favoriteService';



// 2026-07 추가 — masonry(columns) 대신 고정 그리드로 전환.
// 예전엔 columns:'4 240px'라 브라우저가 컨테이너 폭에 따라 3열/4열을 오가는 방식이었고
// (최소폭 240px만 보장), PC에서는 거의 항상 4열이 가능한 폭인데도 3열로 나오는 경우가 있었다.
// PC에서는 항상 4열로 고정되도록 repeat(4, 1fr) 그리드로 바꾸고, 모바일은 미디어 쿼리로
// 2열/1열로 자연스럽게 줄어들게 했다.
// 2026-07-30 — 3열 단계 추가(경계 근거는 StoreList.jsx의 GRID_STYLE 주석 참고).
// CSS 는 index.css 로 이관했다(2026-08-05). JSX 안 <style> 은 인스턴스마다 렌더되고,
// 전역 규칙이 컴포넌트에 숨으면 그 컴포넌트를 안 쓰는 화면에는 규칙이 없다.
// 전역 정책은 index.css — docs/technical/design-system.md 참고.

const MyFavorites = () => {
    useDocumentTitle('좋아요');
    const [searchParams, setSearchParams] = useSearchParams();
    const [view, setView] = useViewModeParam(searchParams, 'cards');
    const interactions = useFeedInteractions();
    const kinds = [{ value: 'all', label: '전체 좋아요' }, { value: 'stores', label: '가게' }, { value: 'posts', label: '게시물' }, { value: 'news', label: '가게 소식' }, { value: 'comments', label: '댓글' }];
    const kind = kinds.some(item => item.value === searchParams.get('kind')) ? searchParams.get('kind') : 'all';
    const hasContentLikes = interactions.data?.enabled === true || interactions.data?.newsEnabled === true;
    const showStores = !hasContentLikes || kind === 'all' || kind === 'stores';
    const client = useQueryClient();
    const resultClassName = view === 'list' ? 'reserve-store-list-rows' : 'rsv-fav-grid';
    const ResultSkeleton = view === 'list' ? StoreListRowSkeleton : StoreCardSkeleton;

    const { data, isLoading: loading, isFetching, error, refetch } = useQuery({
        queryKey: favoriteKeys.my(),
        queryFn: async () => {
            const items = await favoriteService.getMyFavorites();
            return items || [];
        },
    });
    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    const hasData = data !== undefined && !accessDenied;
    const favorites = accessDenied ? [] : data || [];
    const blockingError = isBlockingListReadError(error, favorites);
    // 자동 재조회는 기존 카드와 도구줄을 유지한다. 첫 조회에만 골격을 사용한다.
    const refetching = isFetching && !loading;
    const listRef = useRef(null);
    useListRefreshAnchor(listRef, JSON.stringify([kind, view]), showStores && isFetching, hasData ? favorites : null);
    const live = useLiveUpdatesStatus();
    const requiredDomains = ['FAVORITE', ...(showStores ? ['STORE', 'REVIEW'] : [])];
    if (hasContentLikes && kind !== 'stores') {
        requiredDomains.push('LIKE');
        if (kind === 'all' || kind === 'posts') requiredDomains.push('FEED');
        if (kind === 'all' || kind === 'news') requiredDomains.push('NEWS');
        if (kind === 'all' || kind === 'comments') requiredDomains.push('COMMENT');
    }
    const autoRefreshDomain = requiredDomains.every(domain => live.domains.includes(domain)) ? 'FAVORITE' : undefined;
    // FavoriteDto → StoreCard가 기대하는 store 형태로 변환
    const toStoreShape = (fav) => ({
        id:          fav.storeId,
        name:        fav.storeName,
        category:    fav.storeCategory,
        mainImageUrl: fav.storeMainImageUrl,
        rating:      fav.storeRating   ?? 0,
        reviewCount: fav.storeReviewCount ?? 0,
    });

    // 헤더 안내 문구 — 로딩 → 실패(빈 목록) → 목록 있음 → 빈 목록 순으로 판정한다.
    const headerMessage = () => {
        if (loading) return '즐겨찾기를 불러오는 중이에요.';
        if (blockingError) return '즐겨찾기 목록을 확인하지 못했어요.';
        if (favorites.length > 0) return `총 ${favorites.length}개의 가게를 즐겨찾기했어요.`;
        return '마음에 드는 가게를 즐겨찾기에 추가해보세요.';
    };

    // 컨텐츠 — 고정 4열 그리드. 규칙은 index.css 의 "즐겨찾기 그리드" 블록에 있다.
    // 개수를 모르는 첫 로딩만 8개다. 조회 실패 시 DataState가 재시도 진행 상태를 표시한다.
    // 로딩 영역은 <output>(암묵 role=status)이다. display 는 .rsv-fav-grid 가 grid 로 정한다.
    const renderContent = () => {
        if (loading) {
            return (
                <output className={resultClassName} aria-label="즐겨찾기를 불러오는 중">
                    <div style={{ display: 'contents' }} aria-hidden="true"><ResultSkeleton count={8} /></div>
                </output>
            );
        }
        if (blockingError) {
            return (
                <DataState state="error" kind="favorite" subject="즐겨찾기 목록" error={error}
                    onRetry={refetch} retrying={isFetching} />
            );
        }
        if (favorites.length === 0) {
            return <DataState state="empty" kind="favorite" title="아직 즐겨찾기한 가게가 없어요." />;
        }
        return (
            <>
                <div className={resultClassName}>
                    {favorites.map(fav => view === 'list' ? (
                        <StoreListRow key={fav.id} store={toStoreShape(fav)} />
                    ) : (
                        <div key={fav.id} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                            <StoreCard store={toStoreShape(fav)} />
                        </div>
                    ))}
                </div>
            </>
        );
    };

    return (
        <PageContainer size="xl" paddingTop="40px" aria-busy={isFetching}>
            {/* 헤더 */}
            <div className="reserve-listing-heading">
                <PageTitle loading={loading} style={styles.title}>좋아요</PageTitle>
                <PageDescription loading={loading}>
                    {hasContentLikes ? '좋아요한 가게·게시물·소식·댓글을 한곳에서 볼 수 있어요.' : headerMessage()}
                </PageDescription>
            </div>

            <FilterToolbar onReload={() => Promise.all([refetch(), client.invalidateQueries({ queryKey: ['feed', 'interactions', 'mine'] })])}
                autoRefreshDomain={autoRefreshDomain}
                loading={showStores && (loading || refetching)} initialLoading={showStores && loading}
                extraSkeleton={<Bone width={44} height={44} borderRadius={10} />}
                extra={showStores || hasContentLikes ? <div className="reserve-favorites-toolbar">
                    {showStores && <StoreListViewToggle view={view} onChange={setView} disabled={loading} />}
                    {hasContentLikes && <FilterMenu appearance="plain" value={kind} options={kinds} aria-label="좋아요 종류"
                        onChange={value => setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('kind', value); return next; })} />}
                </div> : undefined} />

            {/* 컨텐츠 — 상태별 분기는 위 renderContent 주석 참고 */}
            {showStores && <section ref={listRef} className="reserve-liked-section reserve-liked-section--listing" aria-label="좋아요한 가게">{hasContentLikes && <h2>가게</h2>}
                <ListingContent notice={error && !blockingError && <DataState state="error" kind="favorite" subject="즐겨찾기 목록" error={error}
                    title="최신 즐겨찾기를 확인하지 못해 이전 목록을 보여드리고 있어요."
                    onRetry={refetch} retrying={isFetching} compact />}>{renderContent()}</ListingContent></section>}
            {hasContentLikes && kind !== 'stores' && <section className="reserve-liked-section" aria-label="좋아요한 게시물과 소식">
                {kind === 'all' && <h2>게시물 · 가게 소식 · 댓글</h2>}<LikedContentList type={kind === 'posts' ? 'POST' : kind === 'news' ? 'NEWS' : kind === 'comments' ? 'COMMENT' : 'ALL'} />
            </section>}
        </PageContainer>
    );
};

const styles = {
    title:  { margin: '0 0 8px', },
};

export default MyFavorites;
