package kr.it.reserve.config.oauth2;

import java.util.Map;

/**
 * Kakao OAuth2 사용자 정보
 * 
 * Kakao에서 제공하는 사용자 정보 구조:
 * {
 *   "id": 고유ID(Long),
 *   "kakao_account": {
 *     "email": "이메일" (비즈니스 인증 필요, 없을 수 있음),
 *     "profile": {
 *       "nickname": "닉네임",
 *       "profile_image_url": "프로필이미지URL"
 *     }
 *   }
 * }
 *
 * 비즈니스 인증이 없는 경우 이메일을 받을 수 없으므로,
 * 카카오 ID를 기반으로 가상 이메일을 생성합니다.
 */
public class KakaoOAuth2UserInfo implements OAuth2UserInfo {

    private final Map<String, Object> attributes;
    private final Map<String, Object> kakaoAccount;
    private final Map<String, Object> profile;

    @SuppressWarnings("unchecked")
    public KakaoOAuth2UserInfo(Map<String, Object> attributes) {
        this.attributes = attributes;
        this.kakaoAccount = (Map<String, Object>) attributes.get("kakao_account");
        this.profile = kakaoAccount != null ?
            (Map<String, Object>) kakaoAccount.get("profile") : null;
    }

    @Override
    public String getProviderId() {
        return String.valueOf(attributes.get("id"));
    }

    @Override
    public String getEmail() {
        // 비즈니스 인증이 있는 경우 실제 이메일 반환
        if (kakaoAccount != null && kakaoAccount.get("email") != null) {
            return (String) kakaoAccount.get("email");
        }
        // 이메일이 없는 경우 null 반환 (CustomOAuth2UserService에서 자동 생성)
        return null;
    }

    @Override
    public String getName() {
        return profile != null ? (String) profile.get("nickname") : null;
    }

    @Override
    public String getProfileImage() {
        return profile != null ? (String) profile.get("profile_image_url") : null;
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }
}
