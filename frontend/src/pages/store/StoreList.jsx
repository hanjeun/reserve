import React, { useEffect, useCallback } from 'react';
import { Empty, Spin } from 'antd';
import { PageContainer, StoreCardSkeleton } from '../../components/common';
import { StoreCard } from '../../components/store';
import { useStoreList } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { SORT_OPTIONS } from '../../constants';
import { fontWeight, fontSize, colors } from '../../styles/tokens';
import { Input, Select, Typography } from 'antd';

const { Title, Text } = Typography;
const { Search } = Input;

const PAGE_SIZE = 12;

const StoreList = () => {
    const {
        stores, totalElements,
        loading, fetchingNext,
        hasNextPage, fetchNextPage,
        searchParams, setSearchParams,
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

            {/* 최초 로딩 스켈레톤 */}
            {loading ? (
                <div style={styles.skeletonWrap}>
                    <div style={styles.grid}>
                        <StoreCardSkeleton count={PAGE_SIZE} />
                    </div>
                    <div style={styles.fadeOut} />
                </div>
            ) : stores.length === 0 ? (
                <Empty description="조건에 맞는 가게가 없습니다." style={{ marginTop: 100 }} />
            ) : (
                <>
                    <div style={styles.grid}>
                        {stores.map(store => (
                            <div key={store.id} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                                <StoreCard store={store} />
                            </div>
                        ))}
                    </div>

                    {/* 무한스크롤 센티넬 */}
                    {hasNextPage && <div ref={sentinelRef} style={styles.sentinel} />}

                    {/* 추가 페이지 로딩 스피너 */}
                    {fetchingNext && (
                        <div style={styles.spinnerWrap}>
                            <Spin size="default" />
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
        background: 'linear-gradient(to bottom, transparent 0%, #ffffff 100%)',
        pointerEvents: 'none',
    },
    grid:        { columns: '4 240px', columnGap: 24 },
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
