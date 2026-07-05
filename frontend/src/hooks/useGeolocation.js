/**
 * useGeolocation — 브라우저 Geolocation 요청 + 실패 시나리오별 폴백 안내
 *
 * 반환값:
 *   request(): Promise<{ latitude, longitude } | null>
 *     - 성공: 좌표 반환
 *     - 실패(거부/타임아웃/미지원): null 반환 + toast로 이유 안내
 *   requesting: boolean — 요청 진행 중 여부
 *
 * 실패 메시지는 전부 토스트 — 상황별로 다르게 안내:
 *   PERMISSION_DENIED → "위치 정보 허용이 필요해요"
 *   POSITION_UNAVAILABLE / TIMEOUT / 인앱 브라우저 미지원 →
 *     "위치를 가져올 수 없어요. 마이페이지에서 주소를 등록해보세요."
 */
import { useState, useCallback } from 'react';
import useMessage from './useMessage';

const useGeolocation = () => {
    const { message } = useMessage();
    const [requesting, setRequesting] = useState(false);

    const request = useCallback(() => {
        return new Promise((resolve) => {
            if (!('geolocation' in navigator)) {
                message.warning('위치를 가져올 수 없어요. 마이페이지에서 주소를 등록해보세요.');
                resolve(null);
                return;
            }

            setRequesting(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setRequesting(false);
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                },
                (error) => {
                    setRequesting(false);
                    if (error.code === error.PERMISSION_DENIED) {
                        message.warning('위치 정보 허용이 필요해요');
                    } else {
                        // POSITION_UNAVAILABLE, TIMEOUT, 그 외 인앱 브라우저 미지원 케이스 전부 동일 안내
                        message.warning('위치를 가져올 수 없어요. 마이페이지에서 주소를 등록해보세요.');
                    }
                    resolve(null);
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
            );
        });
    }, [message]);

    return { request, requesting };
};

export default useGeolocation;
