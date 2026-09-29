import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { DataState, FilterToolbar, PageContainer, StoreCardSkeleton } from '../../components/common';
import { StoreCard } from '../../components/store';
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
// 전역 정책은 index.css — docs/technical/design-system.md 참고.

const MyFavorites = () => {
    useDocumentTitle('즐겨찾기');

    const { data: favorites = [], isLoading: loading, isFetching, error, refetch } = useQuery({
        queryKey: favoriteKeys.my(),
        queryFn: async () => {
            const data = await favoriteService.getMyFavorites();
            return data || [];
        },
    });
    // 2026-09: 하트를 끄거나 켜면 목록이 무효화돼 다시 불린다(invalidateAfterWrite.js).
    // 예전엔 그 재조회가 화면에 안 보여 카드가 아무 예고 없이 빠지거나 생겼다.
    // 재조회 동안 툴바의 새로고침 버튼을 돌리고 카드 자리에 스켈레톤을 띄운 뒤 새 목록을 보여준다.
    // ★ '내 예약'(재조회 때 목록 유지)과 일부러 다르다 — 즐겨찾기는 하트 한 번에 카드가
    //   나타나거나 사라지는 화면이라, 그 변화가 번쩍이지 않고 한 번 시작·끝이 보여야 한다(2026-09-26 사용자 결정).
    const refetching = isFetching && !loading;
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
        if (loading) return '즐겨찾기를 불러오는 중입니다.';
        if (error && favorites.length === 0) return '즐겨찾기 목록을 확인하지 못했습니다.';
        if (favorites.length > 0) return `총 ${favorites.length}개의 가게를 즐겨찾기했습니다.`;
        return '마음에 드는 가게를 즐겨찾기에 추가해보세요.';
    };

    // 컨텐츠 — 고정 4열 그리드. 규칙은 index.css 의 "즐겨찾기 그리드" 블록에 있다.
    // 재조회 스켈레톤은 지금 보이던 카드 수만큼(최소 1개) 그린다 — 개수가 튀면 레이아웃이 출렁인다.
    // 개수를 모르는 첫 로딩만 8개다. 목록이 비었는데 조회가 실패한 상태의 다시 시도는
    // DataState 가 자체 진행 표시(retrying)를 갖는다.
    // 로딩 영역은 <output>(암묵 role=status)이다. display 는 .rsv-fav-grid 가 grid 로 정한다.
    const renderContent = () => {
        if (loading) {
            return (
                <output className="rsv-fav-grid" aria-label="즐겨찾기를 불러오는 중">
                    <div style={{ display: 'contents' }} aria-hidden="true"><StoreCardSkeleton count={8} /></div>
                </output>
            );
        }
        if (error && favorites.length === 0) {
            return (
                <DataState state="error" kind="favorite" subject="즐겨찾기 목록" error={error}
                    onRetry={refetch} retrying={isFetching} style={{ marginTop: 100 }} />
            );
        }
        if (refetching) {
            return (
                <output className="rsv-fav-grid" aria-label="즐겨찾기를 새로 불러오는 중">
                    <div style={{ display: 'contents' }} aria-hidden="true">
                        <StoreCardSkeleton count={Math.max(favorites.length, 1)} />
                    </div>
                </output>
            );
        }
        if (favorites.length === 0) {
            return <DataState state="empty" kind="favorite" title="아직 즐겨찾기한 가게가 없습니다." style={{ marginTop: 100 }} />;
        }
        return (
            <>
                {error && (
                    <DataState state="error" kind="favorite" subject="즐겨찾기 목록" error={error}
                        title="최신 즐겨찾기를 확인하지 못해 이전 목록을 보여드리고 있습니다."
                        onRetry={refetch} retrying={isFetching} compact style={{ marginBottom: 16 }} />
                )}
                <div className="rsv-fav-grid">
                    {favorites.map(fav => (
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
            <div style={styles.header}>
                <Title level={2} style={styles.title}>즐겨찾기</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    {headerMessage()}
                </Text>
            </div>

            <FilterToolbar onReload={refetch} loading={loading || refetching} />

            {/* 컨텐츠 — 상태별 분기는 위 renderContent 주석 참고 */}
            {renderContent()}
        </PageContainer>
    );
};

const styles = {
    // 아래 새로고침 툴바가 생겨 '내 예약' 화면과 같은 간격(32)으로 맞춘다.
    header: { marginBottom: 32 },
    title:  { margin: '0 0 8px', fontWeight: fontWeight.extrabold },
};

export default MyFavorites;
