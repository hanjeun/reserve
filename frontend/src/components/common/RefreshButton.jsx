/*
 * 요청 중 회전과 연타 방지 시간을 분리하며 언마운트 때 타이머를 해제한다.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { SyncOutlined } from './icons';
import Button from './Button';
import useRefreshCooldown from '../../hooks/useRefreshCooldown';

const RefreshButton = ({ onReload, loading = false, disabled = false, label = '새로고침', style, ...rest }) => {
    const { reload, blocked } = useRefreshCooldown(onReload, loading);
    const accessibleLabel = rest['aria-label'] || label || '새로고침';

    if (!onReload) return null;

    return (
        <Button
            variant="ghost-sm"
            size="md"
            onClick={reload}
            disabled={blocked || disabled}
            icon={<SyncOutlined spin={loading} style={{ fontSize: 'var(--reserve-icon-glyph-size, 20px)' }} aria-hidden="true" />}
            style={{ flexShrink: 0, ...style }}
            {...rest}
            aria-label={accessibleLabel}
            aria-busy={loading || undefined}
        />
    );
};

RefreshButton.propTypes = {
    /** 없으면 버튼 자체를 렌더하지 않는다(호출부의 `onReload && <...>` 를 대신한다). */
    onReload: PropTypes.func,
    loading: PropTypes.bool,
    disabled: PropTypes.bool,
    label: PropTypes.string,
    style: PropTypes.object,
};

export default RefreshButton;
