import LoadingStatus from '../../components/common/LoadingStatus';
import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import Pagination from '../../components/common/Pagination';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DataState, PageContainer, StoreCardSkeleton } from '../../components/common';
import { StoreCard } from '../../components/store';
import StoreListRow from '../../components/store/StoreListRow';
import StoreListRowSkeleton from '../../components/store/StoreListRowSkeleton';
import StoreListingToolbar from '../../components/store/StoreListingToolbar';
import RegionSheet from '../../components/discovery/RegionSheet';
import AdBanner from '../../components/advertisement/AdBanner';
import { useStoreList, useGeolocation, useMessage, useWindowWidth } from '../../hooks';
import { STORE_LIST_PAGE_SIZE } from '../../hooks/useStoreList';
import useAuthStore from '../../store/useAuthStore';
import useLocationStore from '../../store/useLocationStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useReducedMotion from '../../hooks/useReducedMotion';
import useViewModeParam from '../../hooks/useViewModeParam';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import adService from '../../services/adService';
import { adKeys } from '../../hooks/queryKeys';
import { SERVICE_DOMAIN_FILTER_OPTIONS, SORT_OPTIONS } from '../../constants';
import { formatRegionLabel } from '../../constants/regions';
import { distanceSortParams } from '../../utils/distanceSort';

// 같은 결과의 보기만 바꿔도 카드/행은 재마운트된다. 노출 집계는 안정적인 결과 관문에서 한다.
function StoreListResult({ children, isAdvertised, adId, onImpression }) {
    React.useEffect(() => {
        if (isAdvertised && adId) onImpression(adId);
    }, [isAdvertised, adId, onImpression]);
    return <div>{children}</div>;
}
StoreListResult.propTypes = {
    children: PropTypes.node.isRequired,
    isAdvertised: PropTypes.bool,
    adId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onImpression: PropTypes.func.isRequired,
};

const StoreList = () => {
    const {
        stores, totalElements,
        loading, initialLoading = loading, refetching, page, pageSize, setPage, refetch,
        searchParams, setSearchParams,
        error, hasData = stores.length > 0 || !loading && !error,
    } = useStoreList();
    const [urlSearchParams] = useSearchParams();
    const blockingError = isBlockingListReadError(error, stores);
    const location = useLocation();
    const reducedMotion = useReducedMotion();
    const [bannerEntry, setBannerEntry] = useState(() => location.state?.reserveDiscoveryEntry === 'featured-banner');
    const [pageMotion, setPageMotion] = useState(null);
    const [regionOpen, setRegionOpen] = useState(false);
    const [view, setView] = useViewModeParam(urlSearchParams, 'cards');
    const listRef = React.useRef(null);
    useListRefreshAnchor(listRef, JSON.stringify([view, page, searchParams]), refetching, hasData ? stores : null);
    const recordedAdIdsRef = React.useRef(new Set());
    const recordImpressionOnce = React.useCallback((adId) => {
        if (recordedAdIdsRef.current.has(adId)) return;
        recordedAdIdsRef.current.add(adId);
        void adService.recordImpression(adId);
    }, []);
    const resultClassName = view === 'list' ? 'reserve-store-list-rows' : 'rsv-store-grid';
    let resultMotionClassName = '';
    if (!reducedMotion && bannerEntry) {
        resultMotionClassName = ' reserve-explore-result--banner-entry';
    } else if (!reducedMotion && pageMotion?.page === page) {
        resultMotionClassName = ` reserve-explore-result--page-${pageMotion.direction}`;
    }
    const ResultItem = view === 'list' ? StoreListRow : StoreCard;
    const viewportWidth = useWindowWidth();
    const isMobile = viewportWidth < 576;
    const domainLabel = SERVICE_DOMAIN_FILTER_OPTIONS.find(option => option.value === searchParams.domain)?.label;
    let pageTitle = '가게 둘러보기';
    if (searchParams.keyword.trim()) {
        pageTitle = '검색 결과';
    } else if (searchParams.region) {
        pageTitle = `${formatRegionLabel(searchParams.region)} 가게`;
    } else if (searchParams.domain && domainLabel) {
        pageTitle = domainLabel;
    }

    useDocumentTitle('가게 목록', '원하는 조건으로 최고의 가게를 찾아보세요. RESERVE에서 다양한 업종을 간편하게 예약할 수 있어요.');

    const { request: requestLocation, requesting: locating } = useGeolocation();
    const { user } = useAuthStore();
    const { message } = useMessage();
    const { liveLocation, setLiveLocation } = useLocationStore();
    

    // 우리동네 배지는 저장된 위치를 우선하고 없을 때만 라이브 위치를 사용한다. 거리순 정렬과 구분한다.
    const nearbyUserLocation = React.useMemo(() => {
        if (user?.latitude != null && user?.longitude != null) {
            return { latitude: user.latitude, longitude: user.longitude };
        }
        if (liveLocation) return liveLocation;
        return null;
    }, [liveLocation, user]);

    // 배지 노출을 집계할 수 있도록 가게 ID와 광고 ID를 함께 캐시한다.
    const { data: adStoreMap = new Map() } = useQuery({
        queryKey: adKeys.active('BADGE'),
        queryFn: async () => {
            const list = await adService.getActiveAds('BADGE');
            return new Map((list || []).map((a) => [a.storeId, a.id]));
        },
        staleTime: 1000 * 60 * 5,
    });
    const { data: bannerAds = [] } = useQuery({
        queryKey: adKeys.active('BANNER'),
        queryFn: async () => {
            const list = await adService.getActiveAds('BANNER');
            return Array.isArray(list) ? list : [];
        },
        staleTime: 1000 * 60 * 5,
    });

    /** 거리순 좌표를 기다리는 동안 선택 라벨을 먼저 반영하고 적용 실패 시 URL의 정렬로 되돌린다. */
    const [pendingSort, setPendingSort] = useState(null);

    const handleSortChange = useCallback(async (value) => {
        if (value !== 'distance') {
            setPendingSort(null);
            setSearchParams({ sort: value, lat: null, lng: null });
            return;
        }

        // 라벨을 먼저 "거리순"으로 — 좌표를 기다리는 동안에도 선택이 유지된다
        setPendingSort('distance');

        const position = await requestLocation();
        if (position) {
            setLiveLocation(position);
            const distanceParams = distanceSortParams(position);
            if (distanceParams) setSearchParams(distanceParams);
            setPendingSort(null);
            return;
        }
        if (user?.latitude != null && user?.longitude != null) {
            message.info('마이페이지에 등록된 위치 기준으로 정렬할게요.');
            const distanceParams = distanceSortParams({ latitude: user.latitude, longitude: user.longitude });
            if (distanceParams) setSearchParams(distanceParams);
            setPendingSort(null);
            return;
        }
        // 둘 다 없으면 sort를 바꾸지 않음 — useGeolocation이 이미 상황별 토스트를 보여줌.
        // 낙관적으로 바꿔둔 라벨도 원래 값으로 되돌린다.
        setPendingSort(null);
    }, [setSearchParams, requestLocation, user, message, setLiveLocation]);

    // 결과 영역: 로딩 → 오류 → 빈 목록 → 목록 순으로 하나만 그린다.
    const renderResult = () => {
        if (loading) {
            return (
                <div style={styles.skeletonWrap}>
                    <LoadingStatus className={resultClassName} aria-label="가게 목록을 불러오는 중" aria-busy="true">
                        {view === 'list' ? <StoreListRowSkeleton count={STORE_LIST_PAGE_SIZE} /> : <StoreCardSkeleton count={STORE_LIST_PAGE_SIZE} />}
                    </LoadingStatus>
                    <div style={styles.fadeOut} />
                </div>
            );
        }
        if (blockingError) {
            return (
                <DataState state="error" kind="store" subject="가게 목록" error={error}
                    onRetry={refetch} retrying={refetching} style={{ marginTop: 100 }} />
            );
        }
        if (stores.length === 0) {
            return (
                <DataState state="empty" kind="store"
                    title={searchParams.region ? '이 지역에 등록된 가게가 없어요.' : '조건에 맞는 가게가 없어요.'}
                    style={{ marginTop: 100 }} />
            );
        }
        return (
            <div
                ref={listRef}
                className={resultClassName + resultMotionClassName}
                onAnimationEnd={event => {
                    if (event.target !== event.currentTarget) return;
                    setBannerEntry(false);
                    setPageMotion(null);
                }}
            >
                {stores.map(store => (
                    <StoreListResult key={store.id} isAdvertised={adStoreMap.has(store.id)} adId={adStoreMap.get(store.id)}
                        onImpression={recordImpressionOnce}>
                        <ResultItem store={store} userLocation={nearbyUserLocation} isAdvertised={adStoreMap.has(store.id)} />
                    </StoreListResult>
                ))}
            </div>
        );
    };

    return (
        <PageContainer
            size="xl"
            paddingTop="16px"
            className={'reserve-explore-page' + (!reducedMotion && bannerEntry ? ' reserve-explore-page--banner-entry' : '')}
        >
            <h1 className="reserve-discovery-visually-hidden">{pageTitle}</h1>

            <StoreListingToolbar
                view={view}
                onViewChange={setView}
                count={!loading && hasData && !blockingError ? totalElements : undefined}
                region={searchParams.region}
                regionOpen={regionOpen}
                onRegionOpen={() => setRegionOpen(true)}
                domain={searchParams.domain}
                onDomainChange={domain => setSearchParams({ domain })}
                sort={pendingSort ?? searchParams.sort}
                onSortChange={handleSortChange}
                sortOptions={SORT_OPTIONS}
                disabled={loading}
                initialLoading={initialLoading}
                sortDisabled={loading || locating}
                sortLoading={locating}
                onAnimationEnd={event => {
                    if (event.target === event.currentTarget && !loading && !refetching && (error || stores.length === 0)) setBannerEntry(false);
                }}
            />

            {/* 스켈레톤은 첫 조회나 쿼리 전환으로 이전 결과를 그대로 보여줄 수 없을 때만 쓴다.
                수동 새로고침은 현재 카드와 읽던 위치를 유지하고, 툴바 버튼만 진행 상태를 표시한다.
                grid는 고정 4열(rsv-store-grid)로 시작해 화면 폭에 따라 반응형으로 줄어든다. */}
            {error && !blockingError && <DataState state="error" kind="store" subject="가게 목록" error={error}
                title="최신 가게 정보를 확인하지 못해 이전 목록을 보여드리고 있어요."
                onRetry={refetch} retrying={refetching} compact style={{ marginBottom: 16 }} />}
            {renderResult()}
            {hasData && !blockingError && totalElements > 0 && (
                <nav aria-label="가게 목록 페이지" style={{ marginTop: 24 }}>
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={totalElements}
                        onChange={value => {
                            if (value === page) return;
                            setBannerEntry(false);
                            setPageMotion({ page: value, direction: value > page ? 'next' : 'previous' });
                            setPage(value);
                            window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
                        }}
                        showSizeChanger={false}
                        showLessItems={isMobile}
                        size={isMobile ? 'small' : 'default'}
                        disabled={loading}
                    />
                </nav>
            )}
            <AdBanner ads={bannerAds} />
            <RegionSheet open={regionOpen} value={searchParams.region}
                onClose={() => setRegionOpen(false)}
                onApply={nextRegion => {
                    setSearchParams({ region: nextRegion });
                    setRegionOpen(false);
                }} />
        </PageContainer>
    );
};

const styles = {
    skeletonWrap: { position: 'relative', overflow: 'hidden' },
    fadeOut: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '55%',
        background: 'linear-gradient(to bottom, transparent 0%, var(--c-bg-default, #ffffff) 100%)',
        pointerEvents: 'none',
    },
};

export default StoreList;
