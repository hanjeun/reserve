/*
 * 위치 요청은 Promise<{ latitude, longitude } | null>을 반환한다. 거부·시간 초과·미지원은 안내 후 null로 처리한다.
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
