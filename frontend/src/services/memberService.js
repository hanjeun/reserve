/**
 * memberService — 회원 관련 API
 *
 * 백엔드 엔드포인트:
 *   GET    /api/member/me             내 정보 조회
 *   PUT    /api/member/update         회원 정보 수정 (이름, 비밀번호)
 *   POST   /api/member/profile-image  프로필 이미지 업로드
 *   DELETE /api/member/delete         회원 탈퇴
 */
import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const memberService = {
    /** 내 정보 조회 */
    getMe: () => api.get(API_ENDPOINTS.MEMBER.ME),

    /** 회원 정보 수정 (이름, 비밀번호) */
    updateMember: (data) => api.put(API_ENDPOINTS.MEMBER.UPDATE, data),

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

    /** 마케팅 수신 동의 토글 (선택 동의 — 가입 후 언제든 변경) */
    updateMarketingConsent: (marketingAgreed) =>
        api.patch(API_ENDPOINTS.MEMBER.MARKETING_CONSENT, { marketingAgreed }),

    /** 위치(위도/경도) 등록 — 거리순 가게 정렬용. Geolocation 실패 시 마이페이지 주소 등록 폴백에서 호출 */
    updateLocation: (latitude, longitude) =>
        api.patch(API_ENDPOINTS.MEMBER.LOCATION, { latitude, longitude }),
};

export default memberService;
