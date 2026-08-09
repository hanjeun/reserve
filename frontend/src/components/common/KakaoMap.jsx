import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { EnvironmentOutlined } from '@ant-design/icons';
import { colors, rawColors, fontSize, radius } from '../../styles/tokens';
import { Bone } from './Skeletons';

/**
 * 카카오맵 컴포넌트
 * - IntersectionObserver로 뷰포트 진입 시에만 초기화 (Lazy Load)
 * - 좌표 있으면 바로, 없으면 주소 Geocoding (저장된 좌표 없는 기존 가게 폴백)
 */
// XSS 방지: storeName 등 외부 입력값을 HTML에 삽입 전 이스케이프
const escapeHtml = (text) => {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const KakaoMap = ({ latitude, longitude, address, storeName, height = 240 }) => {
    const containerRef = useRef(null);
    const mapRef       = useRef(null);
    const mapInstance  = useRef(null);
    const [visible, setVisible] = useState(false);
    // 지도가 실제로 그려지기 전까지(뷰포트 진입 대기 + SDK 로드 + 지오코딩) 스켈레톤 표시용.
    // 기존엔 이 구간이 그냥 고정 회색 박스(colors.gray[100])였는데, 다른 컴포넌트들과 다르게
    // 셰이머 스켈레톤 컨벤션이 전혀 없었음(2026-07 신규 추가) — Skeletons.jsx의 Bone/shimmer를 그대로 재사용.
    //
    // 참고(디버깅 기록): 페이지가 완전히 로드된 뒤에야 지도 영역이 마운트되므로(store 데이터 로딩 전엔
    // KakaoMap 자체가 존재하지 않음), 스켈레톤이 "페이지 나머지가 다 뜨고 난 뒤 지도 자리에서만 따로"
    // 잠깐 보이는 건 정상 동작이다(레이지 로드 아키텍처상 불가피 — 예전엔 이 구간이 무늬 없는 회색
    // 박스라 눈에 덜 띄었을 뿐). IntersectionObserver 자체는 실제 사용자 브라우저에서 정상 동작 확인
    // (SDK 로드/좌표 파싱/지도 초기화 로직 전부 정상 — 브라우저 자동화 테스트 환경이 탭을 항상
    // document.hidden=true로 유지해서 IntersectionObserver 콜백이 아예 발화하지 않는 것까지 직접
    // 확인함 — 이건 크롬의 백그라운드 탭 스로틀링이지 이 컴포넌트의 버그가 아니었음).
    const [mapReady, setMapReady] = useState(false);

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

    // 안전장치 — SDK 로드 실패나 지오코딩 결과 없음(status !== OK) 같은 실패 케이스는 별도 처리가
    // 없어서 예전엔 그냥 조용히 회색 박스로 남았는데, 스켈레톤을 셰이머로 바꾸고 나니 그 경우 영원히
    // 반짝이는 것처럼 보일 수 있음 — 8초 지나도 지도가 안 뜨면 스켈레톤을 그만 보여주고 정적인
    // 회색 박스로 폴백(실패를 감추진 않지만 최소한 "계속 로딩 중"처럼 보이진 않게).
    useEffect(() => {
        if (!visible) return undefined;
        const failSafeTimer = setTimeout(() => setMapReady(true), 8000);
        return () => clearTimeout(failSafeTimer);
    }, [visible]);

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
                const safeStoreName = escapeHtml(storeName);
                const safeMapUrl = encodeURI(kakaoMapUrl ?? '');
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
                    " onclick="globalThis.open('${safeMapUrl}', '_blank')">
                        ${safeStoreName}
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
            setMapReady(true);
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
            {/* 지도 준비 전 셰이머 스켈레톤 — 다른 화면의 Bone/shimmer 컨벤션과 통일.
                지도 div(mapRef) 위에 겹쳐두고, 실제 지도가 뜨면(mapReady) 사라짐 */}
            {!mapReady && (
                <Bone
                    width="100%"
                    height={height}
                    borderRadius={0}
                    style={{ position: 'absolute', inset: 0 }}
                />
            )}
            {kakaoMapUrl && (
                <a
                    href={kakaoMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        position: 'absolute', bottom: 10, right: 10,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        // ★ 테마 토큰을 쓰면 안 되는 자리다.
                        // 이 버튼은 카카오 지도 타일 위에 얹히는데, 지도는 우리 테마와 무관하게
                        // 항상 밝다. 다크에서 배경만 어두워지거나(우리가 칠하면) 글자만 밝아지면
                        // (text.secondary가 #c3c8cf로 뒤집힘) 어느 쪽이든 대비가 무너진다.
                        // 실제로 다크에서 "흰 배경 + 밝은 회색 글자"가 되어 거의 안 보였다.
                        // 지도가 고정이므로 이 칩도 라이트 기준 고정색으로 둔다.
                        background: '#ffffff',
                        border: `1px solid ${rawColors.gray[200]}`,
                        borderRadius: radius.md,
                        padding: '5px 10px',
                        fontSize: fontSize.xs,
                        color: rawColors.gray[700],
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
