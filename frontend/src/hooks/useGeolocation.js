/*
 * 위치 요청은 Promise<{ latitude, longitude } | null>을 반환한다. 거부·시간 초과·미지원은 안내 후 null로 처리한다. showError가 false면 호출부 안내를 사용한다.
 */
import { useState, useCallback } from 'react';
import useMessage from './useMessage';

const failureMessage = (error) => {
    if (error?.code === 1 || error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        return '위치 정보 허용이 필요해요. 브라우저와 기기의 위치 권한을 확인해주세요.';
    }
    if (error?.code === 2) {
        return '기기에서 현재 위치를 확인하지 못했어요. 위치 서비스를 확인하거나 마이페이지에 주소를 등록해주세요.';
    }
    if (error?.code === 3) {
        return '위치 확인 시간이 초과됐어요. 다시 시도하거나 마이페이지에 주소를 등록해주세요.';
    }
    return '현재 위치를 확인하지 못했어요. 다시 시도하거나 마이페이지에 주소를 등록해주세요.';
};

const useGeolocation = () => {
    const { message } = useMessage();
    const [requesting, setRequesting] = useState(false);

    const request = useCallback(({ showError = true } = {}) => {
        return new Promise((resolve) => {
            const fail = (text) => {
                setRequesting(false);
                if (showError) message.warning(text);
                resolve(null);
            };
            try {
                const geolocation = typeof navigator === 'undefined' ? null : navigator.geolocation;
                if (typeof geolocation?.getCurrentPosition !== 'function') {
                    fail('이 브라우저에서는 현재 위치 기능을 사용할 수 없어요. 마이페이지에 주소를 등록해주세요.');
                    return;
                }
                setRequesting(true);
                geolocation.getCurrentPosition(
                    (position) => {
                        setRequesting(false);
                        resolve({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        });
                    },
                    (error) => fail(failureMessage(error)),
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
                );
            } catch (error) {
                fail(failureMessage(error));
            }
        });
    }, [message]);

    return { request, requesting };
};

export default useGeolocation;
