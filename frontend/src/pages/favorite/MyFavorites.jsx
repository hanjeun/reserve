import React from 'react';
import { Empty, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, StoreCardSkeleton, FilterToolbar } from '../../components/common';
import { StoreCard } from '../../components/store';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { favoriteKeys } from '../../hooks/queryKeys';
import favoriteService from '../../services/favoriteService';
import { fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

// 2026-07 추가 — masonry(columns) 대신 고정 그리드로 전환.
// 예전엔 columns:'4 240px'라 브라우저가 컨테이너 폭에 따라 3열/4열을 오가는 방식이었고
// (최소폭 240px만 보장), PC에서는 거의 항상 4열이 가능한 폭인데도 3열로 나오는 경우가 있었다.
// PC에서는 항상 4열로 고정되도록 repeat(4, 1fr) 그리드로 바꾸고, 모바일은 미디어 쿼리로
// 2열/1열로 자연스럽게 줄어들게 했다.
// 2026-07-30 — 3열 단계 추가(경계 근거는 StoreList.jsx의 GRID_STYLE 주석 참고).
// CSS 는 index.css 로 이관했다(2026-08-05). JSX 안 <style> 은 인스턴스마다 렌더되고,
// 전역 규칙이 컴포넌트에 숨으면 그 컴포넌트를 안 쓰는 화면에는 규칙이 없다.
// 전역 정책은 index.css — CLAUDE.md "설계 원칙" 참고.

const MyFavorites = () => {
    const { message } = useMessage();
    useDocumentTitle('즐겨찾기');

    const { data: favorites = [], isLoading: loading, isFetching, error, refetch } = useQuery({
        queryKey: favoriteKeys.my(),
        queryFn: async () => {
            const data = await favoriteService.getMyFavorites();
            return data || [];
        },
    });
    // 2026-09: 하트를 끄면 목록이 무효화돼 다시 불린다(invalidateAfterWrite.js). 예전엔 그 재조회가
    // 화면에 안 보여서 카드가 아무 예고 없이 번쩍 빠졌다. '내 예약'·'가게 목록'과 같은 규칙으로
    // 백그라운드 재조회 동안에도 새로고침 버튼을 돌리고 스켈레톤을 보여준다.
    const refetching = isFetching && !loading;
    React.useEffect(() => {
        if (error) message.error('즐겨찾기 목록을 불러오지 못했습니다.');
    }, [error, message]);

    // FavoriteDto → StoreCard가 기대하는 store 형태로 변환
    const toStoreShape = (fav) => ({
        id:          fav.storeId,
        name:        fav.storeName,
        category:    fav.storeCategory,
        mainImageUrl: fav.storeMainImageUrl,
        rating:      fav.storeRating   ?? 0,
        reviewCount: fav.storeReviewCount ?? 0,
    });

    return (
        <PageContainer size="xl" paddingTop="40px">
            {/* 헤더 */}
            <div style={styles.header}>
                <Title level={2} style={styles.title}>즐겨찾기</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    {!loading && favorites.length > 0
                        ? `총 ${favorites.length}개의 가게를 즐겨찾기했습니다.`
                        : '마음에 드는 가게를 즐겨찾기에 추가해보세요.'}
                </Text>
            </div>

            <FilterToolbar onReload={refetch} loading={loading || refetching} />

            {/* 컨텐츠 — 고정 4열 그리드. 규칙은 index.css 의 "즐겨찾기 그리드" 블록에 있다.
                재조회 중 스켈레톤은 지금 보이는 카드 수만큼(최소 1개) 그린다 — 개수가 튀면 레이아웃이
                출렁인다. 개수를 모르는 첫 로딩만 8개로 그린다. */}
            {(loading || refetching) ? (
                <div className="rsv-fav-grid">
                    <StoreCardSkeleton count={loading ? 8 : Math.max(favorites.length, 1)} />
                </div>
            ) : favorites.length === 0 ? (
                <Empty description="아직 즐겨찾기한 가게가 없습니다." style={{ marginTop: 100 }} />
            ) : (
                <div className="rsv-fav-grid">
                    {favorites.map(fav => (
                        <div key={fav.id} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                            <StoreCard store={toStoreShape(fav)} />
                        </div>
                    ))}
                </div>
            )}
        </PageContainer>
    );
};

const styles = {
    // 아래 새로고침 툴바가 생겨 '내 예약' 화면과 같은 간격(32)으로 맞춘다.
    header: { marginBottom: 32 },
    title:  { margin: '0 0 8px', fontWeight: fontWeight.extrabold },
};

export default MyFavorites;
