import React, { useEffect, useCallback, useState } from 'react';
import { Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, StoreCardSkeleton, Loading, FilterSelect } from '../../components/common';
import { StoreCard } from '../../components/store';
import AdBanner from '../../components/advertisement/AdBanner';
import { useStoreList, useGeolocation, useMessage } from '../../hooks';
import useAuthStore from '../../store/useAuthStore';
import useLocationStore from '../../store/useLocationStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import adService from '../../services/adService';
import { adKeys } from '../../hooks/queryKeys';
import { SORT_OPTIONS } from '../../constants';
import { fontWeight, fontSize, colors } from '../../styles/tokens';
import { Input, Typography } from 'antd';

const { Title, Text } = Typography;
const { Search } = Input;

const PAGE_SIZE = 12;

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
        loading, refetching, fetchingNext,
        hasNextPage, fetchNextPage,
        searchParams, setSearchParams,
        error,
    } = useStoreList();

    useDocumentTitle('가게 목록', '원하는 조건으로 최고의 가게를 찾아보세요. RESERVE에서 다양한 업종을 간편하게 예약할 수 있습니다.');

    const sentinelRef = React.useRef(null);
    const fetchNextRef = React.useRef(fetchNextPage);
    React.useEffect(() => { fetchNextRef.current = fetchNextPage; }, [fetchNextPage]);

    // observer는 마운트 1회만 생성. 트리거 시점에 ref로 최신 함수 참조.
    // deps에 fetchingNext/hasNextPage를 넣으면 상태 변경마다 observer가 재생성되어
    // sentinel이 viewport 안에 있을 때 무한 루프가 발생함.
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) fetchNextRef.current();
            },
            { rootMargin: '300px', threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    const handleSearch = useCallback((value) => {
        setSearchParams({ keyword: value });
    }, [setSearchParams]);

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
    React.useEffect(() => {
        if (error) message.error(error);
    }, [error, message]);
    
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

    // 거리순 선택 시 Geolocation 먼저 요청 — 실패/거부 시 마이페이지에 등록해둔 위치가 있으면 그것으로 폴백
    // (둘 다 없으면 useGeolocation이 이미 보여준 토스트로 이유 안내된 상태라 sort를 바꾸지 않음)
    const roundCoord = (n) => Math.round(n * 1000) / 1000;

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
            setSearchParams({ sort: 'distance', lat: roundCoord(position.latitude), lng: roundCoord(position.longitude) });
            setPendingSort(null);
            return;
        }
        if (user?.latitude != null && user?.longitude != null) {
            message.info('마이페이지에 등록된 위치 기준으로 정렬할게요.');
            setSearchParams({ sort: 'distance', lat: roundCoord(user.latitude), lng: roundCoord(user.longitude) });
            setPendingSort(null);
            return;
        }
        // 둘 다 없으면 sort를 바꾸지 않음 — useGeolocation이 이미 상황별 토스트를 보여줌.
        // 낙관적으로 바꿔둔 라벨도 원래 값으로 되돌린다.
        setPendingSort(null);
    }, [setSearchParams, requestLocation, user, message, setLiveLocation]);

    return (
        <PageContainer size="xl" paddingTop="40px">
            {/* 헤더 */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <Title level={2} style={styles.title}>가게 둘러보기</Title>
                    <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                        원하는 조건으로 최고의 가게를 찾아보세요
                    </Text>
                </div>
                <div style={styles.searchWrap}>
                    <Search
                        placeholder="가게 이름 또는 카테고리"
                        defaultValue={searchParams.keyword}
                        key={searchParams.keyword}
                        onSearch={handleSearch}
                        style={{ flex: 1, minWidth: 150 }}
                        size="large"
                        enterButton
                        allowClear
                        disabled={loading}
                    />
                    {/* FilterSelect — 목록 위의 조작 도구라 흰 면 + 테두리.
                        예전엔 순수 <Select>에 className을 손으로 붙여야 했고, 그걸 잊어서
                        여기가 회색으로 떨어져 있었다. 이제 컴포넌트가 강제한다. */}
                    <FilterSelect
                        value={pendingSort ?? searchParams.sort}
                        style={{ width: 120 }}
                        onChange={handleSortChange}
                        options={SORT_OPTIONS}
                        disabled={loading || locating || refetching}
                        loading={locating}
                    />
                </div>
            </div>

            {/* 스켈레톤 — 최초 로딩뿐 아니라 검색어/정렬 변경으로 인한 재조회(refetching) 때도 동일하게
                노출(2026-07 수정). keepPreviousData 덕에 재조회 중엔 원래 직전 카드가 그대로 남아있어서
                "조용히 있다가 휙 바뀌는" 문제가 있었는데, 처음엔 살짝 흐리게+스피너 오버레이로 시도했다가
                "가게 리스트는 원래 스켈레톤이 컨벤션이니 그걸 그대로 재사용하는 게 낫다"는 판단으로 변경 —
                정렬/검색 바꿀 때마다 카드가 스켈레톤으로 한 번 갈아입긴 하지만(실사용에서는 아주 짧은 순간),
                최초 로딩과 완전히 동일한 신호를 주는 쪽이 일관적임
                2026-07 추가: grid를 고정 4열(rsv-store-grid)로 전환 (위 GRID_STYLE 참고) —
                masonry(columns)는 PC 폭에서도 3열로 나올 때가 있어서 항상 4열이 보장되는 그리드로 바꿈. */}
            {(loading || refetching) ? (
                <div style={styles.skeletonWrap}>
                    <div className="rsv-store-grid">
                        <StoreCardSkeleton count={PAGE_SIZE} />
                    </div>
                    <div style={styles.fadeOut} />
                </div>
            ) : stores.length === 0 ? (
                <Empty description={error ?? '조건에 맞는 가게가 없습니다.'} style={{ marginTop: 100 }} />
            ) : (
                <>
                    <div className="rsv-store-grid">
                        {stores.map(store => (
                            <div key={store.id}>
                                <StoreCard store={store} userLocation={nearbyUserLocation} isAdvertised={adStoreMap.has(store.id)} adId={adStoreMap.get(store.id)} />
                            </div>
                        ))}
                    </div>

                    {/* 무한스크롤 센티넬 */}
                    {hasNextPage && <div ref={sentinelRef} style={styles.sentinel} />}

                    {/* 추가 페이지 로딩 스피너 */}
                    {fetchingNext && (
                        <div style={styles.spinnerWrap}>
                            <Loading minHeight="0" />
                        </div>
                    )}

                    {/* 마지막 페이지 도달 메시지 */}
                    {!hasNextPage && stores.length > 0 && (
                        <div style={styles.endMessage}>
                            <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                                총 {totalElements}개 가게를 모두 불러왔습니다
                            </Text>
                        </div>
                    )}
                </>
            )}
            <AdBanner ads={bannerAds} />
        </PageContainer>
    );
};

const styles = {
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 48,
        flexWrap: 'wrap',
        gap: 24,
    },
    headerLeft:   { flex: '1 1 auto', minWidth: 250 },
    title:        { margin: '0 0 8px', fontWeight: fontWeight.extrabold },
    searchWrap:   { display: 'flex', gap: 8, flex: '0 1 500px', width: '100%', alignItems: 'center' },
    skeletonWrap: { position: 'relative', overflow: 'hidden' },
    fadeOut: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '55%',
        background: 'linear-gradient(to bottom, transparent 0%, var(--c-bg-default, #ffffff) 100%)',
        pointerEvents: 'none',
    },
    sentinel:    { marginTop: 8 },
    spinnerWrap: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
    endMessage:  {
        textAlign: 'center',
        padding: '24px 0 8px',
        borderTop: `1px solid ${colors.border.light}`,
        marginTop: 8,
    },
};

export default StoreList;
