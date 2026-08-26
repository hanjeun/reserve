import React from 'react';
import PropTypes from 'prop-types';
import { Input, Typography } from 'antd';
import FilterSelect from './FilterSelect';
import RefreshButton from './RefreshButton';
import { SearchOutlined } from '@ant-design/icons';
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

    // 2026-07 추가 — 좁은 화면에서 셀렉트 2개(예: 가게+상태)가 각자 고정폭(140px등)을 고집해서
    // 둘이 합치면 한 줄에 안 들어가 위아래로 쉽게 쌓이던 문제 — 매우 좁은 화면에서만 선택들이
    // 고정폭 대신 균등 분할(flex:1)되게 해서 항상 한 줄에 나란히 들어가게 한다.
    const isNarrow = useWindowWidth() < 480;

    /* 쿨다운·스피너 정지는 RefreshButton 이 갖는다 — 예전엔 이 파일과 MailboxTab, ChatTab 이
       같은 3초 쿨다운을 각자 구현하고 있었고(정리 안 되는 setTimeout 포함),
       회전이 중간에서 끊겨 아이콘이 튀는 문제도 네 곳에 똑같이 있었다. */
    const reloadBtn = <RefreshButton onReload={onReload} loading={loading} />;

    if (selects.length > 0) {
        /* selects 있음 — 2줄 구조 */
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, ...style }}>
                {/* 2026-07 수정 — 필터 그룹(selects+count+extra)과 새로고침 버튼을 별도 flex 자식으로 분리.
                    예전에는 바깥 컨테이너 전체가 flexWrap:'wrap'이라, 모바일처럼 좁은 화면에서 새로고침 버튼만
                    단독으로 다음 줄로 떨어져 나가면서 애매한 위치에 띄는 문제가 있었다. 이제는 바깥 컨테이너는
                    flexWrap 없이(기본값 nowrap) 유지하고, 필터 그룹만 자체적으로(flex:1, minWidth:0) 줄바꿈하게 해서
                    새로고침은 항상 오른쪽 상단에 고정된다.
                    2026-07-30 재수정 — alignItems:center가 "wrap돼도 달라지지 않는다"고 적어뒀는데 사실이 아니었다.
                    center는 자식(필터 그룹) '전체'를 기준으로 하므로, extra 배지가 둘째 줄로 밀려 그룹이 2줄(76px)이
                    되면 버튼이 그 76px의 중앙으로 내려간다 — 셀렉트 중앙보다 10px 아래(브라우저 좌표 실측: 셀렉트
                    중앙 288 / 버튼 298). 그룹은 위쪽 정렬로 두고, 버튼만 첫 줄 높이(40px) 안에서 중앙에 맞춘다. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0, minHeight: 40 }}>
                    {/* 색 규칙은 index.css의 "필터용 Select" 블록에 있고, 클래스를 붙이는 일은
                        FilterSelect가 맡는다 — 여기서 className을 손으로 적지 않는다.
                        (예전에는 이 파일 안의 <style> 태그에 규칙이 있어서, 이 컴포넌트를 안 쓰는
                         화면에는 규칙이 아예 존재하지 않았다. 같은 실수를 반복하지 않기 위한 구조다) */}
                    {selects.map((s) => (
                        <FilterSelect
                            key={s.placeholder ?? s.options?.[0]?.label}
                            value={s.value}
                            onChange={s.onChange}
                            options={s.options}
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
                    {/* 셀렉트 한 줄(40px) 안에서 세로 중앙. 위 그룹이 몇 줄이 되든 버튼 위치는 고정된다. */}
                    <div style={{ display: 'flex', alignItems: 'center', height: 40, flexShrink: 0 }}>
                        {reloadBtn}
                    </div>
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
                <RefreshButton onReload={onReload} loading={loading} style={{ marginLeft: 'auto' }} />
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
