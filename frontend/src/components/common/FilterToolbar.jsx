import React from 'react';
import PropTypes from 'prop-types';
import { Input, Typography } from 'antd';
import FilterMenu from './FilterMenu';
import RefreshButton from './RefreshButton';
import FilterToolbarSkeleton from './FilterToolbarSkeleton';
import { SearchOutlined } from '@ant-design/icons';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 공통 목록 툴바 (rate limit 내장 — 3초 쿨다운)
 *
 * 예약·가게 목록에서 쓰는 입력 없는 FilterMenu를 관리자·사업자 목록에도 공유한다.
 * 검색이 있으면 필터 행 아래에 검색+새로고침 행을 두고, 검색이 없으면 한 줄에 끝낸다.
 *
 * [selects 없음]
 *   행1: [Search──────────────] → [새로고침]
 *        (search 없으면 새로고침만 오른쪽)
 */
const FilterToolbar = ({
    selects = [],
    count = null,
    search,
    onReload,
    loading = false,
    initialLoading = false,
    extra,
    extraSkeleton,
    spread = false,
    style,
}) => {
    if (initialLoading) return <FilterToolbarSkeleton selects={selects} count={count} search={search} extra={extra} extraSkeleton={extraSkeleton} spread={spread} style={style} />;
    /* 쿨다운·스피너 정지는 RefreshButton 이 갖는다 — 예전엔 이 파일과 MailboxTab, ChatTab 이
       같은 3초 쿨다운을 각자 구현하고 있었고(정리 안 되는 setTimeout 포함),
       회전이 중간에서 끊겨 아이콘이 튀는 문제도 네 곳에 똑같이 있었다. */
    const reloadBtn = <RefreshButton onReload={onReload} loading={loading} />;

    if (selects.length > 0) {
        // 건수가 있는 목록은 선택값·꺾쇠 바로 다음에 건수를 둔다. 고정 폭 버튼은 실제 글자보다
        // 넓은 투명 클릭 영역을 만들어 "전체 상태    25건"처럼 보이므로, 내용 폭으로 줄인다.
        // select.width는 긴 선택값이 화면을 밀지 않도록 하는 최대 폭으로만 계속 사용한다.
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
                            disabled={loading || select.disabled}
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
                    {count != null && !loading && (
                        <Text className="reserve-filter-toolbar-count" type="secondary">
                            {count.toLocaleString('ko-KR')}건
                        </Text>
                    )}
                    {extra && <div className="reserve-filter-toolbar-extra">{extra}</div>}
                </div>
                {!search && <div className="reserve-filter-toolbar-refresh">{reloadBtn}</div>}
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
                            disabled={loading || search.disabled}
                            style={{ width: '100%', maxWidth: 480 }}
                        />
                        <div className="reserve-filter-toolbar-refresh">{reloadBtn}</div>
                    </div>
                )}
            </div>
        );
    }

    /* selects 없음 — 1줄 구조 (검색 + 새로고침 같은 행) */
    return (
        <div className="reserve-filter-toolbar" style={style}>
            {/* 목록 제어는 왼쪽에, 건수와 새로고침은 오른쪽 끝에 둔다. 검색창과 새로고침이
                붙지 않도록 이 컴포넌트를 쓰는 모든 관리자·사업자 목록에서 한 번에 강제한다. */}
            <div className={`reserve-filter-toolbar-secondary${spread ? ' reserve-filter-toolbar-secondary--spread' : ''}${!search && !extra ? ' reserve-filter-toolbar-secondary--refresh-only' : ''}`}>
                {extra}
                {search && (
                    <Input
                        prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                        placeholder={search.placeholder ?? '검색'}
                        value={search.value}
                        onChange={search.onChange}
                        allowClear size="large"
                        disabled={loading || search.disabled}
                        style={{ flex: 1, maxWidth: 480 }}
                    />
                )}
                {count != null && !loading && (
                    <Text type="secondary" style={{ fontSize: fontSize.sm, alignSelf: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {count}건
                    </Text>
                )}
                <div className="reserve-filter-toolbar-refresh">{reloadBtn}</div>
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
    extra: PropTypes.node,
    extraSkeleton: PropTypes.node,
    spread: PropTypes.bool,
    style: PropTypes.object,
};

export default FilterToolbar;
