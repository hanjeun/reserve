/**
 * 공용 새로고침 버튼. 요청 중 표시와 3초 연타 방지 쿨다운을 분리한다.
 * 회전은 loading만 따르며, 각도를 맞추려고 완료된 요청이나 데이터를 지연하지 않는다.
 * 타이머는 언마운트 시 정리한다. 선택 이유: docs/technical/ui-decisions.md.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { SyncOutlined } from '@ant-design/icons';
import Button from './Button';

/** 연타 방지. 한 번 더 눌러볼까 하는 손은 막되, 기다린다는 느낌은 안 드는 선. */
const COOLDOWN_MS = 3000;

const RefreshButton = ({ onReload, loading = false, label = '새로고침', style, ...rest }) => {
    const [cooling, setCooling] = useState(false);
    const coolTimer = useRef(null);

    useEffect(() => () => clearTimeout(coolTimer.current), []);

    const handleClick = useCallback(() => {
        if (!onReload || loading || cooling) return;
        setCooling(true);
        coolTimer.current = setTimeout(() => setCooling(false), COOLDOWN_MS);
        onReload();
    }, [onReload, loading, cooling]);

    if (!onReload) return null;

    return (
        <Button
            variant="ghost-sm"
            size="md"
            onClick={handleClick}
            disabled={loading || cooling}
            style={{ flexShrink: 0, ...style }}
            {...rest}
        >
            <SyncOutlined spin={loading} />
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
