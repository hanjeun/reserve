
import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const loginMethodScope = memberId => ({ headers: { 'X-Reserve-Member-Id': String(memberId) } });

const memberService = {
    /** 내 정보 조회 */
    getMe: () => api.get(API_ENDPOINTS.MEMBER.ME),

    getLoginMethods: (signal) => api.get('/api/member/login-methods', { signal }),
    beginLoginMethodOAuth: (memberId, data) => api.post('/api/member/login-methods/oauth', data, loginMethodScope(memberId)),
    sendLoginMethodCode: (memberId, email) => api.post('/api/member/login-methods/password/code', { email }, loginMethodScope(memberId)),
    setLoginMethodPassword: (memberId, data) => api.post('/api/member/login-methods/password', data, loginMethodScope(memberId)),
    removeLoginMethodPassword: (memberId) => api.delete('/api/member/login-methods/password', loginMethodScope(memberId)),
    unlinkSocialLogin: (memberId, currentPassword) => api.delete('/api/member/login-methods/social', {
        ...loginMethodScope(memberId), data: { currentPassword },
    }),

    /** 일반 회원 정보 수정 (비밀번호는 전용 관문 사용) */
    updateMember: (data) => api.put(API_ENDPOINTS.MEMBER.UPDATE, data),

    /** 현재 비밀번호 재인증 후 변경. 성공하면 authVersion 회전 + refresh token 폐기로 모든 세션을 끊는다. */
    changePassword: (data, memberId) => memberId == null ? api.put(API_ENDPOINTS.MEMBER.PASSWORD, data)
        : api.put('/api/member/login-methods/password', data, loginMethodScope(memberId)),

    /** 프로필 이미지 업로드 */
    uploadProfileImage: (file) => {
        const formData = new FormData();
        formData.append('image', file);
        return api.post(API_ENDPOINTS.MEMBER.PROFILE_IMAGE, formData);
    },

    /** 프로필 이미지 삭제 (기본 이미지로 초기화) */
    deleteProfileImage: () => api.delete(API_ENDPOINTS.MEMBER.PROFILE_IMAGE),

    /** 회원 탈퇴 */
    deleteMember: () => api.delete(API_ENDPOINTS.MEMBER.DELETE),

    /** 탈퇴 전 운영·결제 미결 상태 확인 */
    getWithdrawalReadiness: () => api.get(API_ENDPOINTS.MEMBER.WITHDRAWAL_READINESS),

    /** 마케팅 수신 동의 토글 (선택 동의 — 가입 후 언제든 변경) */
    updateMarketingConsent: (marketingAgreed) =>
        api.patch(API_ENDPOINTS.MEMBER.MARKETING_CONSENT, { marketingAgreed }),

    /* 저장 위치는 거리순 정렬과 현재 위치 요청의 대안으로 사용한다. */
    // 도로명·우편번호·상세주소를 함께 저장한다.

    // 주소 필드의 빈 값은 서버의 기존 값 유지 정책을 따른다.
    updateLocation: ({ latitude, longitude, address, zipCode, addressDetail }) =>
        api.patch(API_ENDPOINTS.MEMBER.LOCATION, { latitude, longitude, address, zipCode, addressDetail }),
};

export default memberService;
