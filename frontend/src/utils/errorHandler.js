/**
 * RESERVE - API 에러 처리 유틸리티
 *
 * axios interceptor가 reject한 값은 아래 두 가지 중 하나:
 *   1. { message, isSessionExpired } 객체
 *   2. 문자열 (서버 에러 메시지)
 */

/**
 * @param {any}    error          - axios interceptor가 reject한 값
 * @param {Object} messageApi     - Ant Design message 인스턴스
 * @param {string} defaultMessage - 기본 에러 메시지
 */
export const handleApiError = (error, messageApi, defaultMessage = '잠시 후 다시 시도해주세요.') => {
    // 토큰 만료 → axios가 이미 /login으로 이동했으므로 메시지 중복 표시 안 함
    if (error?.isSessionExpired) return;

    const msg = typeof error === 'string' ? error : error?.message;

    // 서버가 직접 내려준 메시지가 있으면 우선 사용
    if (msg) {
        messageApi.error(msg);
        return;
    }

    messageApi.error(defaultMessage);
};
