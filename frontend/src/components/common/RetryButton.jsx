import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from './Button';
import { SyncOutlined } from './icons';

/** 조회 재시도는 기존 버튼 모양을 유지하고 실제 요청이 끝날 때까지 중복 실행을 막아요. */
export default function RetryButton({ onRetry, loading = false, disabled = false, children = '다시 불러오기',
    variant = 'ghost', size = 'sm', className, ...rest }) {
    const [pending, setPending] = useState(false);
    const operation = useRef(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; operation.current = null; };
    }, []);
    const retry = event => {
        if (!onRetry || loading || disabled || operation.current) return;
        const current = {};
        operation.current = current;
        const finish = () => {
            if (operation.current !== current) return;
            operation.current = null;
            if (mounted.current) setPending(false);
        };
        try {
            const request = onRetry(event);
            if (request && typeof request.then === 'function') {
                setPending(true);
                Promise.resolve(request).then(finish, finish);
            } else finish();
            return request;
        } catch (error) { finish(); throw error; }
    };
    if (!onRetry) return null;
    return <Button {...rest} variant={variant} size={size} disabled={disabled} loading={loading || pending}
        icon={<SyncOutlined aria-hidden="true" />} loadingIcon={<SyncOutlined spin aria-hidden="true" />}
        className={['reserve-retry-button', className].filter(Boolean).join(' ')} onClick={retry}>
        {children}
    </Button>;
}
RetryButton.propTypes = { onRetry: PropTypes.func, loading: PropTypes.bool, disabled: PropTypes.bool,
    children: PropTypes.node, variant: PropTypes.string, size: PropTypes.string, className: PropTypes.string };
