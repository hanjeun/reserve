import { useEffect, useRef, useState } from 'react';
import Button from '../../frontend/src/components/common/Button';
import Tooltip from '../../frontend/src/components/common/Tooltip';
import { PlusOutlined, MinusOutlined } from '../../frontend/src/components/common/icons';
import { createStoreOverlayContent } from '../../frontend/src/components/common/kakaoMapOverlay';
import { colors, radius } from '../../frontend/src/styles/tokens';

export default function PreviewMap({ storeName, height = 240 }) {
    const marker = useRef(null);
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
        const target = marker.current;
        const callout = createStoreOverlayContent(storeName, () => setZoom(1));
        target.append(callout);
        return () => callout.remove();
    }, [storeName]);
    return <div className="reserve-kakao-map reserve-preview-map" style={{ height, borderRadius: radius.lg, background: colors.gray[100] }}>
        <svg viewBox="0 0 640 360" role="img" aria-label={`${storeName}의 예시 위치 지도`} preserveAspectRatio="xMidYMid slice"
            style={{ transform: `scale(${zoom})` }}>
            <rect width="640" height="360" fill="#eef1ed" />
            <path d="M0 280Q170 188 326 286T640 254V360H0Z" fill="#c9e5f5" />
            <g fill="#e1e5df" stroke="#d8dfd7" strokeWidth="1">
                {[40, 160, 280, 400, 520].map(x => <g key={x}><rect x={x} y="25" width="76" height="66" rx="5" /><rect x={x} y="129" width="76" height="70" rx="5" /></g>)}
            </g>
            <path d="M0 112H640M134 0V360M370 0V360M0 224H640" stroke="#fff" strokeWidth="22" fill="none" />
            <path d="M0 112H640M370 0V360" stroke="#f3dca6" strokeWidth="11" fill="none" />
            <rect x="440" y="133" width="100" height="66" rx="18" fill="#c9dfbe" />
            <g fill="#7d8a88" fontSize="14" fontFamily="inherit"><text x="460" y="170">작은 공원</text><text x="170" y="105">예시로</text><text x="385" y="44">중앙길</text></g>
            <circle cx="320" cy="168" r="20" fill="#3182f6" fillOpacity=".14" /><circle cx="320" cy="168" r="7" fill="#3182f6" stroke="#fff" strokeWidth="3" />
        </svg>
        <div ref={marker} className="reserve-preview-map-marker" />
        <div className="reserve-preview-map-zoom">
            <Tooltip title="확대"><Button variant="ghost" size="sm" icon={<PlusOutlined />} aria-label="예시 지도 확대" onClick={() => setZoom(value => Math.min(1.8, value + 0.2))} disabled={zoom >= 1.8} /></Tooltip>
            <Tooltip title="축소"><Button variant="ghost" size="sm" icon={<MinusOutlined />} aria-label="예시 지도 축소" onClick={() => setZoom(value => Math.max(1, value - 0.2))} disabled={zoom <= 1} /></Tooltip>
        </div>
        <span className="reserve-preview-map-label">예시 지도</span>
    </div>;
}
