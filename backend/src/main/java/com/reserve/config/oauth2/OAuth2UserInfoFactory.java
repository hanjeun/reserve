package com.reserve.config.oauth2;

import com.reserve.global.error.AuthException;
import com.reserve.member.entity.AuthProvider;

import java.util.Map;

/**
 * OAuth2 제공자별 UserInfo 객체 생성 팩토리
 */
public class OAuth2UserInfoFactory {

    public static OAuth2UserInfo getOAuth2UserInfo(AuthProvider provider, Map<String, Object> attributes) {
        return switch (provider) {
            case GOOGLE -> new GoogleOAuth2UserInfo(attributes);
            case NAVER -> new NaverOAuth2UserInfo(attributes);
            case KAKAO -> new KakaoOAuth2UserInfo(attributes);
            default -> throw new AuthException("지원하지 않는 OAuth2 제공자입니다: " + provider);
        };
    }
}
