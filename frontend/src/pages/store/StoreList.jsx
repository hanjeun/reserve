import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { Pagination } from 'antd';
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

// 2026-07 추가 — MyFavorites/MyStores와 동일한 이유로 masonry(columns) 대신 고정 그리드로 전환.
// 예전엔 columns:'4 240px'라 컨테이너 폭에 따라 3열/4열을 오갔다(최소폭 240px만 보장하는 방식이라
// PC에서도 폭에 따라 3열로 나오는 경우가 있었음) — PC에서는 항상 4열 고정, 좁은 화면만 미디어
// 쿼리로 2열/1열로 줄어들게 통일.
// 2026-07-30 — 3열 단계 추가. 예전엔 4열(>900) / 2열(481~900) / 1열(≤480) 세 단계뿐이라
// 900 경계에서 카드 실폭이 195px → 414px로 2.1배 튀었다(컨테이너 maxWidth 1200, 패딩 24, gap 24 기준).
// 아이패드 가로(1024)가 4열 구간에 들어가 카드가 226px까지 눌리던 것도 같은 원인.
//
// 카드 최소 240px를 기준으로 역산한 경계:
//   4열: 4*240 + 3*24 + 48 = 1080
//   3열: 3*240 + 2*24 + 48 =  816
//   2열: 2*240 + 1*24 + 48 =  552
// 단계 내 폭 편차가 2.1배 → 1.4배로 줄어든다.
//
// ★ 폰·노트북 결과는 이전과 완전히 동일하다:
//   390px → 1열(전과 같음, 경계만 480→552로 올라갔고 폰은 그보다 훨씬 좁다)
//   1280·1440px → 4열(전과 같음)
//   바뀌는 건 481~1079px 구간뿐이다.
const StoreList = () => {
    const {
        stores, totalElements,
        loading, refetching, page, pageSize, setPage, refetch,
        searchParams, setSearchParams,
        error,
    } = useStoreList();
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();
    const location = useLocation();
    const reducedMotion = useReducedMotion();
    const [bannerEntry, setBannerEntry] = useState(() => location.state?.reserveDiscoveryEntry === 'featured-banner');
    const [pageMotion, setPageMotion] = useState(null);
    const [regionOpen, setRegionOpen] = useState(false);
    const [view, setView] = useViewModeParam(urlSearchParams, setUrlSearchParams, 'cards');
    const recordedAdIdsRef = React.useRef(new Set());
    const recordImpressionOnce = React.useCallback((adId) => {
        if (recordedAdIdsRef.current.has(adId)) return;
        recordedAdIdsRef.current.add(adId);
        adService.recordImpression(adId);
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

    useDocumentTitle('가게 목록', '원하는 조건으로 최고의 가게를 찾아보세요. RESERVE에서 다양한 업종을 간편하게 예약할 수 있습니다.');

    const { request: requestLocation, requesting: locating } = useGeolocation();
    const { user } = useAuthStore();
    const { message } = useMessage();
    const { liveLocation, setLiveLocation } = useLocationStore();
    
    /*
     * ★ 목록이 안 뜨는 이유를 말해준다(2026-08-29).
     *   `useStoreList` 는 예전부터 error 를 내보내고 있었는데 여기서 아무도 안 받았다.
     *   그래서 서버가 내려가면 이 화면은 **완전히 조용했다** — 토스트도 없고,
     *   빈 목록이 "조건에 맞는 가게가 없습니다" 로 보여서 검색 결과가 없는 것처럼 읽혔다.
     *   손님은 조건을 바꿔가며 계속 헛검색을 하게 된다. StoreDetail 과 같은 처리로 맞춘다.
     */
    // "우리동네" 배지용 위치 — 정렬 기준과 무관하게 항상 같은 우선순위로 나온다(이건 이전에는
    // searchParams.lat/lng에만 의존해서, 거리순이 아닌 다른 정렬로 바꾸면 배지가 사라지던 버그가 있었음).
    //
    // 2026-07 우선순위 수정: 예전엔 liveLocation(라이브 위치)이 있으면 무조건 그걸 먼저 썼는데,
    // 이러면 "우리동네"가 사용자가 설정한 안정적인 홈 개념이 아니라 "거리순 정렬 한 번 눌러서
    // 위치 권한을 허용한 순간의 GPS 위치"로 세션 내내 고정돼버린다. 예: 마이페이지엔 청와대로
    // 저장해뒀는데 지금 안산에 있어서 거리순 한 번 눌렀더니, 그 뒤로는 별점순으로 바꿔도 계속
    // 안산 근처 가게만 "우리동네"로 뜨고 청와대 근처 가게는 배지가 사라짐 — "우리동네"라는
    // 이름의 취지(내가 사는/자주 가는 동네라는 안정적인 정체성)와 맞지 않는 동작.
    // → 마이페이지에 저장된 위치를 최우선으로 하고, 저장된 위치가 아예 없는 사용자에게만
    // 라이브 위치를 폴백으로 사용한다. "거리순 정렬" 자체는 여전히 라이브 위치를 우선 써서
    // 실제 물리적 현재 위치 기준으로 정렬한다(이건 "우리동네"와 별개 개념 — searchParams.lat/lng로
    // 처리되고 이 값과는 무관함).
    const nearbyUserLocation = React.useMemo(() => {
        if (user?.latitude != null && user?.longitude != null) {
            return { latitude: user.latitude, longitude: user.longitude };
        }
        if (liveLocation) return liveLocation;
        return null;
    }, [liveLocation, user]);

    // 광고 데이터 — 이전에는 useEffect+useState로 매번 새로 불러오고 에러도 조용히 삼켜졌던 부분 —
    // TanStack Query로 전환해서 캐싱도 되고(staleTime 5분, 페이지 오가는 마다 재조회 안 함),
    // 만약 실패해도 조용히 빈 배열로 폴백되는 건 동일(광고는 장식적 요소라 따로 에러 토스트는 불필요).
    //
    // 2026-07 추가: Set<storeId> 대신 Map<storeId, adId>로 바꿈 — 배지 노출 지표를 기록하려면
    // 어느 storeId가 광고를 가지고 있는지뿐만 아니라 그 광고(Advertisement)의 adId도 필요하다.
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

    /**
     * 선택 즉시 반영되는 "낙관적" 정렬 값 (2026-07 추가).
     *
     * 정렬 값의 진실은 URL(searchParams.sort)인데, 거리순만은 좌표를 먼저 받아야 해서
     * requestLocation()이 끝난 뒤에나 setSearchParams가 불렸다. 그러니 권한 팝업/GPS를
     * 기다리는 동안 Select는 여전히 이전 값(예: "리뷰순")을 보여주면서 스피너만 돌고,
     * 좌표가 도착한 뒤에야 "거리순"으로 바뀜다 — 분명히 거리순을 눌렀는데 화면은
     * 리뷰순인 채 빙글빙글 돌아서 고장처럼 보였다.
     * → 선택 즉시 pendingSort로 라벨을 바꾸고(스피너는 그대로 돌림), 권한 거부 등으로 정렬을
     *   적용하지 못하면 원래 값으로 되돌린다.
     */
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
                    <div className={resultClassName} role="status" aria-label="가게 목록을 불러오는 중" aria-busy="true">
                        {view === 'list' ? <StoreListRowSkeleton count={STORE_LIST_PAGE_SIZE} /> : <StoreCardSkeleton count={STORE_LIST_PAGE_SIZE} />}
                    </div>
                    <div style={styles.fadeOut} />
                </div>
            );
        }
        if (error) {
            return (
                <DataState state="error" kind="store" subject="가게 목록" error={error}
                    onRetry={refetch} retrying={refetching} style={{ marginTop: 100 }} />
            );
        }
        if (stores.length === 0) {
            return (
                <DataState state="empty" kind="store"
                    title={searchParams.region ? '이 지역에 등록된 가게가 없습니다.' : '조건에 맞는 가게가 없습니다.'}
                    style={{ marginTop: 100 }} />
            );
        }
        return (
            <div
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
                count={!loading && !error ? totalElements : undefined}
                region={searchParams.region}
                regionOpen={regionOpen}
                onRegionOpen={() => setRegionOpen(true)}
                domain={searchParams.domain}
                onDomainChange={domain => setSearchParams({ domain })}
                sort={pendingSort ?? searchParams.sort}
                onSortChange={handleSortChange}
                sortOptions={SORT_OPTIONS}
                disabled={loading || refetching}
                sortDisabled={loading || locating || refetching}
                sortLoading={locating}
                onAnimationEnd={event => {
                    if (event.target === event.currentTarget && !loading && !refetching && (error || stores.length === 0)) setBannerEntry(false);
                }}
            />

            {/* 스켈레톤은 첫 조회나 쿼리 전환으로 이전 결과를 그대로 보여줄 수 없을 때만 쓴다.
                수동 새로고침은 현재 카드와 읽던 위치를 유지하고, 툴바 버튼만 진행 상태를 표시한다.
                grid는 고정 4열(rsv-store-grid)로 시작해 화면 폭에 따라 반응형으로 줄어든다. */}
            {renderResult()}
            {!error && totalElements > 0 && (
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
                        disabled={loading || refetching}
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
