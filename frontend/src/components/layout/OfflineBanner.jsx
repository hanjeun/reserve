import React from 'react';
import { WifiOutlined } from '@ant-design/icons';
import useOnlineStatus from '../../hooks/useOnlineStatus';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

/**
 * 오프라인 상태 안내 배너.
 *
 * 네트워크가 끊기면 화면 상단에 고정되어 "인터넷 연결이 끊겼습니다"를 알린다.
 * axios 인터셉터가 개별 요청 실패를 각 화면에서 toast로 띄우긴 하지만, 그건 "요청을 시도했을 때"만
 * 반응하는 사후 안내다. 이 배너는 요청 전에도 상시로 오프라인임을 알려줘서, 사용자가 왜 화면이
 * 안 넘어가는지 헷갈리지 않게 한다.
 *
 * 온라인으로 복귀하면 잠깐 "연결됨"을 초록으로 보여준 뒤 사라진다.
 */
const OfflineBanner = () => {
    const online = useOnlineStatus();
    // 한 번이라도 오프라인이 된 적 있어야 "복구됨"을 보여줌 (첫 로드부터 온라인이면 아무것도 안 뜸)
    const [wasOffline, setWasOffline] = React.useState(false);
    const [showReconnected, setShowReconnected] = React.useState(false);

    React.useEffect(() => {
        if (!online) {
            setWasOffline(true);
            setShowReconnected(false);
            return;
        }
        if (wasOffline) {
            setShowReconnected(true);
            const t = setTimeout(() => {
                setShowReconnected(false);
                setWasOffline(false);
            }, 2500);
            return () => clearTimeout(t);
        }
    }, [online, wasOffline]);

    if (online && !showReconnected) return null;

    const reconnected = online && showReconnected;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{ ...styles.bar, background: reconnected ? colors.success.main : colors.text.primary }}
        >
            <WifiOutlined style={{ fontSize: 14 }} />
            <span>
                {reconnected
                    ? '인터넷에 다시 연결되었습니다.'
                    : '인터넷 연결이 끊겼습니다. 네트워크 상태를 확인해주세요.'}
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
        color: '#fff',
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        textAlign: 'center',
    },
};

export default OfflineBanner;
