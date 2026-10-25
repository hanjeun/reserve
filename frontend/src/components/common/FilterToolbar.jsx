import React from 'react';
import PropTypes from 'prop-types';
import { Input, Typography } from 'antd';
import FilterMenu from './FilterMenu';
import RefreshButton from './RefreshButton';
import FilterToolbarSkeleton from './FilterToolbarSkeleton';
import { SearchOutlined } from './icons';
import { colors, fontSize } from '../../styles/tokens';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';

const { Text } = Typography;

/*
 * 검색·선택·새로고침은 같은 목록 도구줄 배치를 공유한다.
 */
const FilterToolbar = ({
    selects = [],
    count = null,
    search,
    onReload,
    loading = false,
    initialLoading = false,
    autoRefreshDomain,
    extra,
    extraSkeleton,
    spread = false,
    style,
}) => {
    const live = useLiveUpdatesStatus();
    const showRefresh = Boolean(onReload) && !live.domains.includes(autoRefreshDomain);
    if (initialLoading) return <FilterToolbarSkeleton selects={selects} count={count} search={search} extra={extra} extraSkeleton={extraSkeleton} spread={spread} style={style} showRefresh={showRefresh} />;
    /*
     * 새로고침 대기·스피너 수명은 RefreshButton에서 관리한다.
     */
    const reloadBtn = showRefresh ? <RefreshButton onReload={onReload} loading={loading} /> : null;

    if (selects.length > 0) {
        // 건수는 선택값·꺾쇠 바로 옆에 두고 선택 도구는 내용 너비로 맞춘다.

        // 지정 너비는 긴 선택값을 제한하는 최대 폭으로만 사용한다.
        const keepCountAdjacent = count != null;
        const menuRow = (
            <div className="reserve-explore-filters reserve-filter-toolbar-primary" aria-label="목록 필터">
                <div className="reserve-explore-filter-controls reserve-filter-toolbar-controls">
                    {selects.map((select, index) => (
                        <FilterMenu
                            key={select.key ?? select.placeholder ?? select.ariaLabel ?? index}
                            appearance="plain"
                            value={select.value}
                            onChange={select.onChange}
                            options={select.options}
                            disabled={select.disabled}
                            loading={Boolean(select.loading)}
                            aria-label={select.ariaLabel ?? select.placeholder ?? '목록 필터'}
                            className={select.className}
                            style={{
                                width: keepCountAdjacent ? 'fit-content' : `min(${select.width ?? 168}px, ${select.mobileWidth ?? 128}px + 10vw)`,
                                maxWidth: `min(${select.width ?? 168}px, ${select.mobileWidth ?? 128}px + 10vw)`,
                                flex: keepCountAdjacent ? '0 1 auto' : undefined,
                                flexShrink: keepCountAdjacent ? undefined : 1,
                            }}
                        />
                    ))}
                    {count != null && (
                        <Text className="reserve-filter-toolbar-count" type="secondary">
                            {count.toLocaleString('ko-KR')}건
                        </Text>
                    )}
                    {extra && <div className="reserve-filter-toolbar-extra">{extra}</div>}
                </div>
                {!search && showRefresh && <div className="reserve-filter-toolbar-refresh">{reloadBtn}</div>}
            </div>
        );

        return (
            <div className="reserve-filter-toolbar" style={style}>
                {menuRow}
                {search && (
                    <div className="reserve-filter-toolbar-secondary">
                        <Input
                            prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                            placeholder={search.placeholder ?? '검색'}
                            value={search.value}
                            onChange={search.onChange}
                            allowClear size="large"
                            disabled={search.disabled}
                            style={{ width: '100%', maxWidth: 480 }}
                        />
                        {showRefresh && <div className="reserve-filter-toolbar-refresh">{reloadBtn}</div>}
                    </div>
                )}
            </div>
        );
    }

    /* 선택 메뉴가 없으면 검색·새로고침을 한 줄에 둔다. */
    return (
        <div className="reserve-filter-toolbar" style={style}>
            {/*
             * 목록 검색과 건수·새로고침의 배치를 같은 관문에서 유지한다.
             */}
            <div className={`reserve-filter-toolbar-secondary${spread ? ' reserve-filter-toolbar-secondary--spread' : ''}${!search && !extra ? ' reserve-filter-toolbar-secondary--refresh-only' : ''}`}>
                {extra}
                {search && (
                    <Input
                        prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                        placeholder={search.placeholder ?? '검색'}
                        value={search.value}
                        onChange={search.onChange}
                        allowClear size="large"
                        disabled={search.disabled}
                        style={{ flex: 1, maxWidth: 480 }}
                    />
                )}
                {count != null && (
                    <Text type="secondary" style={{ fontSize: fontSize.sm, alignSelf: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {count}건
                    </Text>
                )}
                {showRefresh && <div className="reserve-filter-toolbar-refresh">{reloadBtn}</div>}
            </div>
        </div>
    );
};

FilterToolbar.propTypes = {
    selects: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.any,
        onChange: PropTypes.func,
        options: PropTypes.array,
        key: PropTypes.string,
        width: PropTypes.number,
        mobileWidth: PropTypes.number,
        disabled: PropTypes.bool,
        loading: PropTypes.bool,
        placeholder: PropTypes.string,
        ariaLabel: PropTypes.string,
        className: PropTypes.string,
    })),
    count: PropTypes.number,
    search: PropTypes.shape({
        placeholder: PropTypes.string,
        value: PropTypes.string,
        onChange: PropTypes.func,
        disabled: PropTypes.bool,
    }),
    onReload: PropTypes.func,
    loading: PropTypes.bool,
    initialLoading: PropTypes.bool,
    autoRefreshDomain: PropTypes.string,
    extra: PropTypes.node,
    extraSkeleton: PropTypes.node,
    spread: PropTypes.bool,
    style: PropTypes.object,
};

export default FilterToolbar;
