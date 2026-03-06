package com.reserve.config.oauth2;

import java.util.Map;

/**
 * Naver OAuth2 사용자 정보
 * 
 * Naver에서 제공하는 사용자 정보 구조:
 * {
 *   "resultcode": "00",
 *   "message": "success",
 *   "response": {
 *     "id": "고유ID",
 *     "email": "이메일",
 *     "name": "이름",
 *     "profile_image": "프로필이미지URL"
 *   }
 * }
 */
public class NaverOAuth2UserInfo implements OAuth2UserInfo {

    private final Map<String, Object> attributes;
    private final Map<String, Object> response;

    @SuppressWarnings("unchecked")
    public NaverOAuth2UserInfo(Map<String, Object> attributes) {
        this.attributes = attributes;
        this.response = (Map<String, Object>) attributes.get("response");
    }

    @Override
    public String getProviderId() {
        return (String) response.get("id");
    }

    @Override
    public String getEmail() {
        return (String) response.get("email");
    }

    @Override
    public String getName() {
        return (String) response.get("name");
    }

    @Override
    public String getProfileImage() {
        return (String) response.get("profile_image");
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }
}
