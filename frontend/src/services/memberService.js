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
    // 2026-07 전수조사: AddressSearch는 도로명 + 우편번호 + 상세주소를 한 세트로 다룬다.
    // 예전엔 좌표(+나중엔 도로명)만 보내서, 저장 후 새로고침하면 우편번호 칸이 아예 안 뜨고
    // 상세주소는 빈칸이 되는 버그가 있었다 — 저장할 곳(컬럼) 자체가 없었기 때문.
    // 각 주소 필드는 서버에서 null/blank면 기존 값을 덮어쓰지 않는다.
    updateLocation: ({ latitude, longitude, address, zipCode, addressDetail }) =>
        api.patch(API_ENDPOINTS.MEMBER.LOCATION, { latitude, longitude, address, zipCode, addressDetail }),
};

export default memberService;
