import React from 'react';
import { Input, Select, Typography } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { Button } from './index';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 공통 필터 툴바 (rate limit 내장 — 3초 쿨다운)
 *
 * 행1: [Select1] [Select2?] [count] [extra?]   →  [새로고침]
 * 행2: [Search──────────────────────────────────────────────]
 *
 * - 새로고침은 항상 행1 오른쪽 끝 (PC/모바일 동일)
 * - 검색창은 항상 행2 전체 너비
 * - search 없으면 1행만
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, ...style }}>
            {selects.length > 0 ? (
                /* 롤러 있음: 행1(Select+count+새로고침) + 행2(검색창) */
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {selects.map((s, i) => (
                            <Select
                                key={i}
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
                        {onReload && (
                            <Button variant="ghost-sm" size="md" onClick={handleReload} disabled={reloadDisabled}
                                style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                <SyncOutlined spin={loading} /> 새로고침
                            </Button>
                        )}
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
                </>
            ) : (
                /* 롤러 없음: 단일 행(검색창 + 새로고침) */
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
                    {onReload && (
                        <Button variant="ghost-sm" size="md" onClick={handleReload} disabled={reloadDisabled}
                            style={{ flexShrink: 0, marginLeft: 'auto' }}>
                            <SyncOutlined spin={loading} /> 새로고침
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

export default FilterToolbar;
