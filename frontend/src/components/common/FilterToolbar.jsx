import React from 'react';
import PropTypes from 'prop-types';
import { Input, Select, Typography } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { Button } from './index';
import { useWindowWidth } from '../../hooks';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 공통 필터 툴바 (rate limit 내장 — 3초 쿨다운)
 *
 * [selects 있음]
 *   행1: [Select…] [count?] [extra?]  →  [새로고침]
 *   행2: [Search──────────────────]
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
    extra,
    style,
}) => {
    const [cooldown, setCooldown] = React.useState(false);
    // 2026-07 추가 — 좁은 화면에서 셀렉트 2개(예: 가게+상태)가 각자 고정폭(140px등)을 고집해서
    // 둘이 합치면 한 줄에 안 들어가 위아래로 쉽게 쌓이던 문제 — 매우 좁은 화면에서만 선택들이
    // 고정폭 대신 균등 분할(flex:1)되게 해서 항상 한 줄에 나란히 들어가게 한다.
    const isNarrow = useWindowWidth() < 480;

    const handleReload = React.useCallback(() => {
        if (!onReload || cooldown || loading) return;
        setCooldown(true);
        onReload();
        setTimeout(() => setCooldown(false), 3000);
    }, [onReload, cooldown, loading]);

    const reloadDisabled = loading || cooldown;

    const reloadBtn = onReload && (
        <Button variant="ghost-sm" size="md" onClick={handleReload} disabled={reloadDisabled}
            style={{ flexShrink: 0 }}>
            <SyncOutlined spin={loading} /> 새로고침
        </Button>
    );

    if (selects.length > 0) {
        /* selects 있음 — 2줄 구조 */
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, ...style }}>
                {/* 2026-07 수정 — 필터 그룹(selects+count+extra)과 새로고침 버튼을 별도 flex 자식으로 분리.
                    예전에는 바깥 컨테이너 전체가 flexWrap:'wrap'이라, 모바일처럼 좁은 화면에서 새로고침 버튼만
                    단독으로 다음 줄로 떨어져 나가면서 애매한 위치에 띄는 문제가 있었다. 이제는 바깥 컨테이너는
                    flexWrap 없이(기본값 nowrap) 유지하고, 필터 그룹만 자체적으로(flex:1, minWidth:0) 줄바꿈하게 해서
                    새로고침은 항상 오른쪽 상단에 고정된다.
                    2026-07 수정 — alignItems를 flex-start→center로: 새로고침 버튼(높이 15px)이 셀렉트(높이 40px)보다
                    키가 작아서 flex-start에선 상단에 붙어 셀렉트 중앙보다 12px 위로 떠 보였다(브라우저 실측).
                    center로 두면 셀렉트가 wrap되어도 각 줄 기준 수직 중앙 정렬되어 달라지는 것도 없다. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    {/* 2026-07 수정 — 이 Select가 탭 재마운트(Tabs destroyOnHidden) 타이밍에 따라 AntD CSS-in-JS가
                        전역 테마 토큰(colorBorder/colorBgContainer)을 가끔 반영 못하고 AntD 기본값(#d9d9d9 테두리 +
                        회색 배경)로 떨어지는 현상이 있었다(브라우저 실측으로 확인 — 같은 페이지의 다른 Select와 계산된
                        스타일이 다름). FormSelect.jsx와 동일한 패턴(scoped style 태그 + !important)으로
                        배경/테두리를 명시적으로 고정해 이 문제와 무관하게 항상 일관된 모습이 나오게 한다. */}
                    <style>{`
                        .reserve-filter-select {
                            background-color: ${colors.background.paper} !important;
                            border-color: ${colors.border.light} !important;
                        }
                    `}</style>
                    {selects.map((s) => (
                        <Select
                            key={s.placeholder ?? s.options?.[0]?.label}
                            value={s.value}
                            onChange={s.onChange}
                            options={s.options}
                            size="large"
                            className="reserve-filter-select"
                            style={isNarrow
                                ? { flex: '1 1 0', minWidth: 90, maxWidth: 220 }
                                : { width: s.width ?? 140, flexShrink: 0 }}
                            disabled={loading || s.disabled}
                            placeholder={s.placeholder}
                        />
                    ))}
                    {count !== null && !loading && (
                        <Text type="secondary" style={{ fontSize: fontSize.sm, alignSelf: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {count}건
                        </Text>
                    )}
                    {extra}
                </div>
                    {reloadBtn}
                </div>
                {search && (
                    <Input
                        prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                        placeholder={search.placeholder ?? '검색'}
                        value={search.value}
                        onChange={search.onChange}
                        allowClear size="large"
                        disabled={loading || search.disabled}
                        style={{ width: '100%', maxWidth: 480 }}
                    />
                )}
            </div>
        );
    }

    /* selects 없음 — 1줄 구조 (검색 + 새로고침 같은 행) */
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, ...style }}>
            {/* height → minHeight: 모바일에서 wrap 시 잘리지 않도록.
                2026-07 수정 — reloadBtn에 marginLeft:'auto' 복원. extra/search/count가 모두 없을
                때(관리자 대시보드처럼 새로고침만 단독으로 있는 경우) 버튼이 왼쪽(기본값 flex-start)에
                붙어버려서 다른 탭과 정렬이 안 맞는 문제가 있었다. search가 있을 때는 search자체가
                flex:1로 이미 남는 공간을 다 차지해서 이 마진이 시각적으로 아무 영향이 없다. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
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
                {count !== null && !loading && (
                    <Text type="secondary" style={{ fontSize: fontSize.sm, alignSelf: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {count}건
                    </Text>
                )}
                {onReload && (
                    <Button variant="ghost-sm" size="md" onClick={handleReload} disabled={reloadDisabled}
                        style={{ flexShrink: 0, marginLeft: 'auto' }}>
                        <SyncOutlined spin={loading} /> 새로고침
                    </Button>
                )}
            </div>
        </div>
    );
};

FilterToolbar.propTypes = {
    selects: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.any,
        onChange: PropTypes.func,
        options: PropTypes.array,
        width: PropTypes.number,
        disabled: PropTypes.bool,
        placeholder: PropTypes.string,
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
    extra: PropTypes.node,
    style: PropTypes.object,
};

export default FilterToolbar;
