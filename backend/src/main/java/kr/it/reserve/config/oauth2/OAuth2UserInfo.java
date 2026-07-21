package kr.it.reserve.config.oauth2;

import java.util.Map;

/**
 * OAuth2 제공자별 사용자 정보 추상화 인터페이스
 */
public interface OAuth2UserInfo {
    
    String getProviderId();
    
    String getEmail();
    
    String getName();
    
    String getProfileImage();
    
    Map<String, Object> getAttributes();
}
