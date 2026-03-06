/**
 * RESERVE - API 에러 처리 유틸리티
 *
 * axios interceptor가 이미 에러를 처리해서
 * reject 값은 { status, message } 객체 또는 문자열로 옴
 */

/**
 * @param {any}    error          - axios interceptor가 reject한 값
 * @param {Object} messageApi     - Ant Design message 인스턴스
 * @param {string} defaultMessage - 기본 에러 메시지
 */
export const handleApiError = (error, messageApi, defaultMessage = '오류가 발생했습니다') => {
    // interceptor가 이미 가공한 에러 문자열
    if (typeof error === 'string') {
        if (error === 'Unauthorized') {
            messageApi.error('로그인이 필요합니다');
            return;
        }
        messageApi.error(error || defaultMessage);
        return;
    }

    // 아직 response가 살아있는 경우 (드물지만 방어적으로 처리)
    if (error?.response) {
        const { status, data } = error.response;
        if (status === 401) { messageApi.error('로그인이 필요합니다'); return; }
        if (status === 403) { messageApi.error('접근 권한이 없습니다'); return; }
        if (status === 404) { messageApi.error('요청하신 정보를 찾을 수 없습니다'); return; }
        if (status === 409) { messageApi.error(data?.message || '이미 존재하는 데이터입니다'); return; }
        if (status >= 500)  { messageApi.error('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'); return; }
        messageApi.error(data?.message || defaultMessage);
        return;
    }

    // 네트워크 오류 등
    messageApi.error(error?.message || defaultMessage);
};
