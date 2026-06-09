import React from 'react';
import { Input, Select, Typography } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { Button } from './index';
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

    const handleReload = React.useCallback(() => {
        if (!onReload || cooldown || loading) return;
        setCooldown(true);
        onReload();
        setTimeout(() => setCooldown(false), 3000);
    }, [onReload, cooldown, loading]);

    const reloadDisabled = loading || cooldown;

    const reloadBtn = onReload && (
        <Button variant="ghost-sm" size="md" onClick={handleReload} disabled={reloadDisabled}
            style={{ flexShrink: 0, marginLeft: 'auto' }}>
            <SyncOutlined spin={loading} /> 새로고침
        </Button>
    );

    if (selects.length > 0) {
        /* selects 있음 — 2줄 구조 */
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, ...style }}>
                {/* height → minHeight: 모바일에서 wrap 시 잘리지 않도록 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 40 }}>
                    {selects.map((s) => (
                        <Select
                            key={s.placeholder ?? s.options?.[0]?.label}
                            value={s.value}
                            onChange={s.onChange}
                            options={s.options}
                            size="large"
                            style={{ width: s.width ?? 140, flexShrink: 0 }}
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
            {/* height → minHeight: 모바일에서 wrap 시 잘리지 않도록 */}
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
                {reloadBtn}
            </div>
        </div>
    );
};

export default FilterToolbar;
