export const cameraFailurePresentation = error => {
    // html5-qrcode wraps getUserMedia failures in a string, while browsers use DOMException.
    const name = error?.name || String(error || '').match(/\b(NotAllowedError|PermissionDeniedError|NotReadableError|TrackStartError|NotFoundError|OverconstrainedError)\b/)?.[1] || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { icon: 'camera-denied', message: '카메라 권한이 거부됐어요. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.' };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return { icon: 'camera-unavailable', message: '다른 앱이 카메라를 쓰고 있어요. 해당 앱을 닫고 다시 시도해주세요.' };
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return { icon: 'camera-unavailable', message: '사용할 수 있는 후면 카메라를 찾지 못했어요.' };
    }
    return { icon: 'camera-unavailable', message: '카메라를 시작할 수 없어요. 카메라 연결과 브라우저 권한을 확인해주세요.' };
};

export const unsupportedCameraPresentation = () => ({
    icon: 'browser-unsupported', message: '이 브라우저에서는 카메라 스캔을 사용할 수 없어요. 링크를 복사해 Safari 또는 Chrome에서 열어주세요.',
});
