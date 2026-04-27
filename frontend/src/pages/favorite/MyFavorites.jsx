import React, { useState, useEffect } from 'react';
import { Empty, Typography } from 'antd';
import { PageContainer, StoreCardSkeleton } from '../../components/common';
import { StoreCard } from '../../components/store';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import favoriteService from '../../services/favoriteService';
import { fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

const MyFavorites = () => {
    const { message } = useMessage();
    useDocumentTitle('즐겨찾기');
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading]     = useState(true);
    const fetchedRef = React.useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        favoriteService.getMyFavorites()
            .then(data => setFavorites(data || []))
            .catch(() => message.error('즐겨찾기 목록을 불러오지 못했습니다.'))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

            {/* 컨텐츠 */}
            {loading ? (
                <div style={styles.grid}>
                    <StoreCardSkeleton count={6} />
                </div>
            ) : favorites.length === 0 ? (
                <Empty description="아직 즐겨찾기한 가게가 없습니다." style={{ marginTop: 100 }} />
            ) : (
                <div style={styles.grid}>
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
    header: { marginBottom: 40 },
    title:  { margin: '0 0 8px', fontWeight: fontWeight.extrabold },
    grid:   { columns: '4 240px', columnGap: 24 },
};

export default MyFavorites;
