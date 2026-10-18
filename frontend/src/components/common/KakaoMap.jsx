import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { EnvironmentOutlined } from './icons';
import { colors, fontSize, radius } from '../../styles/tokens';
import { createStoreOverlayContent } from './kakaoMapOverlay';
import { loadKakaoMapsSdk } from './kakaoMapsLoader';
import { Bone } from './Skeletons';
import DataState from './DataState';

/**
 * 카카오맵 컴포넌트
 * - IntersectionObserver로 뷰포트 진입 시에만 초기화 (Lazy Load)
 * - 좌표 있으면 바로, 없으면 주소 Geocoding (저장된 좌표 없는 기존 가게 폴백)
 */
const KakaoMap = ({ latitude, longitude, address, storeName, height = 240 }) => {
    const containerRef = useRef(null);
    const mapRef       = useRef(null);
    const mapInstance  = useRef(null);
    const [visible, setVisible] = useState(() => typeof IntersectionObserver !== 'function');
    const [mapStatus, setMapStatus] = useState('loading');
    const [loadAttempt, setLoadAttempt] = useState(0);

    const kakaoMapUrl = address
        ? `https://map.kakao.com/link/search/${encodeURIComponent(address)}`
        : null;

    // 뷰포트 진입 시에만 지도 초기화 (IntersectionObserver)
    useEffect(() => {
        if (visible) return undefined;
        const el = containerRef.current;
        if (!el) return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [visible]);

    useEffect(() => {
        if (!visible || !mapRef.current) return undefined;
        let cancelled = false;
        let mapObject = null;
        let mapDecoration = null;

        const initMap = (kakao, lat, lng) => {
            if (cancelled || !mapRef.current) return;
            mapRef.current.replaceChildren();
            const center = new kakao.maps.LatLng(lat, lng);
            const map = new kakao.maps.Map(mapRef.current, {
                center,
                level: 4,
                draggable: true,
                scrollwheel: true,
            });

            if (storeName && kakaoMapUrl) {
                const content = createStoreOverlayContent(storeName, kakaoMapUrl);
                mapDecoration = new kakao.maps.CustomOverlay({
                    map, position: center, content, yAnchor: 1.4,
                });
                mapDecoration.setMap(map);
            } else {
                mapDecoration = new kakao.maps.Marker({ position: center, map });
                mapDecoration.setMap(map);
            }

            mapObject = map;
            mapInstance.current = map;
            setMapStatus('ready');
            globalThis.setTimeout(() => {
                if (!cancelled) {
                    map.relayout();
                    map.setCenter(center);
                }
            }, 100);
        };

        loadKakaoMapsSdk().then(kakao => {
            if (cancelled) return;
            const lat = Number.parseFloat(latitude);
            const lng = Number.parseFloat(longitude);
            if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
                initMap(kakao, lat, lng);
            } else if (address) {
                const geocoder = new kakao.maps.services.Geocoder();
                geocoder.addressSearch(address, (result, status) => {
                    if (cancelled) return;
                    if (status === kakao.maps.services.Status.OK && result.length > 0) {
                        initMap(kakao, Number.parseFloat(result[0].y), Number.parseFloat(result[0].x));
                    } else {
                        setMapStatus('error');
                    }
                });
            } else {
                setMapStatus('error');
            }
        }).catch(() => {
            if (!cancelled) setMapStatus('error');
        });

        return () => {
            cancelled = true;
            mapDecoration?.setMap(null);
            if (mapInstance.current === mapObject) mapInstance.current = null;
        };
    }, [visible, latitude, longitude, address, storeName, kakaoMapUrl, loadAttempt]);

    if (!address && !latitude && !longitude) return null;

    return (
        <div ref={containerRef} className="reserve-kakao-map" style={{ position: 'relative', borderRadius: radius.lg, overflow: 'hidden' }}>
            <div
                ref={mapRef}
                style={{ width: '100%', height, background: colors.gray[100] }}
            />
            {mapStatus !== 'ready' && mapStatus !== 'error' && (
                <Bone
                    pageLoading={false}
                    width="100%"
                    height={height}
                    borderRadius={0}
                    style={{ position: 'absolute', inset: 0 }}
                />
            )}
            {mapStatus === 'error' && (
                <DataState state="error" title="지도를 불러오지 못했어요."
                    onRetry={() => {
                        setMapStatus('loading');
                        setLoadAttempt(attempt => attempt + 1);
                    }}
                    style={{ position: 'absolute', inset: 0, minHeight: height, background: colors.gray[50] }} />
            )}
            {kakaoMapUrl && (
                <a
                    className="reserve-kakao-map-link"
                    href={kakaoMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        position: 'absolute', bottom: 10, right: 10,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: colors.background.paper,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: radius.md,
                        padding: '5px 10px',
                        fontSize: fontSize.xs,
                        color: colors.text.primary,
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

KakaoMap.propTypes = {
    latitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    longitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    address: PropTypes.string,
    storeName: PropTypes.string,
    height: PropTypes.number,
};

export default KakaoMap;
