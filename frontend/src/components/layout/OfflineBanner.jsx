import React from 'react';
import { WifiOutlined } from '../common/icons';
import useOnlineStatus from '../../hooks/useOnlineStatus';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

/*
 * 요청 시도와 무관하게 연결 상태를 표시하고 온라인 복귀 안내 뒤 닫는다.
 */
const OfflineBanner = () => {
    const online = useOnlineStatus();
    // 한 번이라도 오프라인이 된 적 있어야 "복구됨"을 보여줌 (첫 로드부터 온라인이면 아무것도 안 뜸)
    const [previousOnline, setPreviousOnline] = React.useState(online);
    const [showReconnected, setShowReconnected] = React.useState(false);

    if (previousOnline !== online) {
        setPreviousOnline(online);
        setShowReconnected(online);
    }

    React.useEffect(() => {
        if (!online || !showReconnected) return;
        const timer = setTimeout(() => setShowReconnected(false), 2500);
        return () => clearTimeout(timer);
    }, [online, showReconnected]);

    if (online && !showReconnected) return null;

    const reconnected = online && showReconnected;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{ ...styles.bar, background: reconnected ? colors.success.solid : colors.text.primary,
                color: reconnected ? colors.success.foreground : colors.background.default }}
        >
            <WifiOutlined style={{ fontSize: 14 }} />
            <span>
                {reconnected
                    ? '인터넷에 다시 연결됐어요.'
                    : '인터넷 연결이 끊겼어요. 네트워크 상태를 확인해주세요.'}
            </span>
        </div>
    );
};

const styles = {
    bar: {
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 16px',
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        textAlign: 'center',
    },
};

export default OfflineBanner;
