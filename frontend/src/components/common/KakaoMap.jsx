import React, { useEffect, useRef, useState } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';
import { colors, fontSize, radius } from '../../styles/tokens';

/**
 * 카카오맵 컴포넌트
 * - IntersectionObserver로 뷰포트 진입 시에만 초기화 (Lazy Load)
 * - 좌표 있으면 바로, 없으면 주소 Geocoding (저장된 좌표 없는 기존 가게 폴백)
 */
const KakaoMap = ({ latitude, longitude, address, storeName, height = 240 }) => {
    const containerRef = useRef(null);
    const mapRef       = useRef(null);
    const mapInstance  = useRef(null);
    const [visible, setVisible] = useState(false);

    const kakaoMapUrl = address
        ? `https://map.kakao.com/link/search/${encodeURIComponent(address)}`
        : null;

    // 뷰포트 진입 시에만 지도 초기화 (IntersectionObserver)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // visible 될 때 한 번만 지도 초기화
    useEffect(() => {
        if (!visible || !mapRef.current || !globalThis.kakao) return;

        const initMap = (lat, lng) => {
            if (!mapRef.current) return;
            const center = new globalThis.kakao.maps.LatLng(lat, lng);
            const map = new globalThis.kakao.maps.Map(mapRef.current, {
                center,
                level: 4,
                draggable: true,
                scrollwheel: true,
            });

            if (storeName) {
                const content = `
                    <div style="
                        position: relative;
                        display: inline-flex;
                        align-items: center;
                        background: #fff;
                        color: #111;
                        font-size: 12px;
                        font-weight: 600;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        padding: 6px 12px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                        white-space: nowrap;
                        cursor: pointer;
                        border: 1px solid rgba(0,0,0,0.08);
                    " onclick="globalThis.open('${kakaoMapUrl}', '_blank')">
                        ${storeName}
                        <div style="
                            position: absolute;
                            bottom: -6px;
                            left: 50%;
                            transform: translateX(-50%);
                            width: 0; height: 0;
                            border-left: 5px solid transparent;
                            border-right: 5px solid transparent;
                            border-top: 6px solid #fff;
                            filter: drop-shadow(0 1px 1px rgba(0,0,0,0.08));
                        "></div>
                    </div>
                `;
                const overlay = new globalThis.kakao.maps.CustomOverlay({
                    map, position: center, content, yAnchor: 1.4,
                });
                overlay.setMap(map);
            } else {
                const marker = new globalThis.kakao.maps.Marker({ position: center, map });
                marker.setMap(map);
            }

            mapInstance.current = map;
            setTimeout(() => { map.relayout(); map.setCenter(center); }, 100);
        };

        globalThis.kakao.maps.load(() => {
            const lat = Number.parseFloat(latitude);
            const lng = Number.parseFloat(longitude);
            if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
                initMap(lat, lng);
            } else if (address) {
                const geocoder = new globalThis.kakao.maps.services.Geocoder();
                geocoder.addressSearch(address, (result, status) => {
                    if (status === globalThis.kakao.maps.services.Status.OK && result.length > 0) {
                        initMap(Number.parseFloat(result[0].y), Number.parseFloat(result[0].x));
                    }
                });
            }
        });

        return () => { mapInstance.current = null; };
    }, [visible, latitude, longitude, address, storeName, kakaoMapUrl]);

    if (!address && !latitude && !longitude) return null;

    return (
        <div ref={containerRef} style={{ position: 'relative', borderRadius: radius.lg, overflow: 'hidden' }}>
            <div
                ref={mapRef}
                style={{ width: '100%', height, background: colors.gray[100] }}
            />
            {kakaoMapUrl && (
                <a
                    href={kakaoMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        position: 'absolute', bottom: 10, right: 10,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#fff',
                        border: `1px solid ${colors.border.light}`,
                        borderRadius: radius.md,
                        padding: '5px 10px',
                        fontSize: fontSize.xs,
                        color: colors.text.secondary,
                        textDecoration: 'none',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        zIndex: 10,
                    }}
                >
                    <EnvironmentOutlined style={{ color: colors.primary.main }} />
                    카카오맵으로 보기
                </a>
            )}
        </div>
    );
};

export default KakaoMap;
