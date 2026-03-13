import React, { useState, useEffect, useCallback } from 'react';
import { Empty } from 'antd';
import { PageContainer, StoreCardSkeleton } from '../../components/common';
import { StoreCard } from '../../components/store';
import { useStoreList } from '../../hooks';
import { SORT_OPTIONS } from '../../constants';
import { fontWeight, fontSize, colors } from '../../styles/tokens';
import { Input, Select, Typography } from 'antd';

const { Title, Text } = Typography;
const { Search } = Input;

const PAGE_SIZE = 12;

const StoreList = () => {
    const { stores, loading, fetching, searchParams, setSearchParams } = useStoreList();

    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
    const sentinelRef = React.useRef(null);

    useEffect(() => {
        setDisplayCount(PAGE_SIZE); // eslint-disable-line react-hooks/set-state-in-effect
    }, [searchParams.keyword, searchParams.sort]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) setDisplayCount(prev => prev + PAGE_SIZE); },
            { rootMargin: '200px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [stores.length]);

    const displayedStores = stores.slice(0, displayCount);
    const hasMore = displayCount < stores.length;

    const handleSearch = useCallback((value) => {
        setSearchParams({ keyword: value });
    }, [setSearchParams]);

    return (
        <PageContainer size="xl" paddingTop="40px">
            {/* 헤더 — 항상 표시 */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <Title level={2} style={styles.title}>맛집 둘러보기</Title>
                    <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                        원하는 조건으로 최고의 식당을 찾아보세요
                    </Text>
                </div>
                <div style={styles.searchWrap}>
                    <Search
                        placeholder="식당 이름 또는 카테고리"
                        defaultValue={searchParams.keyword}
                        key={searchParams.keyword}
                        onSearch={handleSearch}
                        style={{ flex: 1, minWidth: 150 }}
                        size="large"
                        enterButton
                        allowClear
                        disabled={loading}
                    />
                    <Select
                        value={searchParams.sort}
                        style={{ width: 120 }}
                        size="large"
                        onChange={(value) => setSearchParams({ sort: value })}
                        options={SORT_OPTIONS}
                        disabled={loading}
                    />
                </div>
            </div>

            {/* 컨텐츠 — 최초 로드 & 재조회 모두 스켈레톤 */}
            {loading || fetching ? (
                <div style={styles.skeletonWrap}>
                    <div style={styles.grid}>
                        <StoreCardSkeleton count={6} />
                    </div>
                    {/* 아래로 갈수록 페이드아웃 */}
                    <div style={styles.fadeOut} />
                </div>
            ) : stores.length === 0 ? (
                <Empty description="조건에 맞는 식당이 없습니다." style={{ marginTop: 100 }} />
            ) : (
                <>
                    <div style={styles.grid}>
                        {displayedStores.map(store => (
                            <div key={store.id} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                                <StoreCard store={store} />
                            </div>
                        ))}
                    </div>
                    {hasMore && <div ref={sentinelRef} style={styles.sentinel} />}
                    {!hasMore && stores.length > PAGE_SIZE && (
                        <div style={styles.endMessage}>
                            <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                                총 {stores.length}개 가게를 모두 불러왔습니다
                            </Text>
                        </div>
                    )}
                </>
            )}
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
    headerLeft:  { flex: '1 1 auto', minWidth: 250 },
    title:       { margin: '0 0 8px', fontWeight: fontWeight.extrabold },
    searchWrap:  { display: 'flex', gap: 8, flex: '0 1 500px', width: '100%', alignItems: 'center' },
    skeletonWrap: { position: 'relative', overflow: 'hidden' },
    fadeOut: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '55%',
        background: 'linear-gradient(to bottom, transparent 0%, #ffffff 100%)',
        pointerEvents: 'none',
    },
    grid:        { columns: '4 240px', columnGap: 24 },
    sentinel:    { marginTop: 8 },
    endMessage:  {
        textAlign: 'center',
        padding: '24px 0 8px',
        borderTop: `1px solid ${colors.border.light}`,
        marginTop: 8,
    },
};

export default StoreList;
