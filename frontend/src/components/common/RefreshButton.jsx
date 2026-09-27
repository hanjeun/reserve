/**
 * 공용 새로고침 버튼. 요청 중 표시와 3초 연타 방지 쿨다운을 분리한다.
 * 회전은 loading만 따르며, 완료된 요청을 시각 효과 때문에 지연하지 않는다.
 * 타이머는 언마운트 시 정리한다. 선택 이유: docs/technical/ui-decisions.md.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { SyncOutlined } from '@ant-design/icons';
import Button from './Button';
import useRefreshCooldown from '../../hooks/useRefreshCooldown';

const RefreshButton = ({ onReload, loading = false, label = '새로고침', style, ...rest }) => {
    const { reload, blocked } = useRefreshCooldown(onReload, loading);

    if (!onReload) return null;

    return (
        <Button
            variant="ghost-sm"
            size="md"
            onClick={reload}
            disabled={blocked}
            style={{ flexShrink: 0, ...style }}
            {...rest}
        >
            <SyncOutlined spin={loading} aria-hidden="true" />
            {label ? ` ${label}` : null}
        </Button>
    );
};

RefreshButton.propTypes = {
    /** 없으면 버튼 자체를 렌더하지 않는다(호출부의 `onReload && <...>` 를 대신한다). */
    onReload: PropTypes.func,
    loading: PropTypes.bool,
    label: PropTypes.string,
    style: PropTypes.object,
};

export default RefreshButton;
