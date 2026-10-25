package kr.it.reserve.config.oauth2;

import java.util.Map;

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
        // 제공자가 이메일을 주지 않으면 null을 반환한다.
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
