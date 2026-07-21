package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.Collections;
import java.util.Map;

/**
 * OAuth2 인증된 사용자 정보를 담는 클래스
 * Spring Security의 OAuth2User 인터페이스 구현
 */
@Getter
public class CustomOAuth2User implements OAuth2User {

    private final Member member;
    private final Map<String, Object> attributes;
    private final String nameAttributeKey;
    private final boolean newUser;

    public CustomOAuth2User(Member member, Map<String, Object> attributes, String nameAttributeKey) {
        this.member = member;
        this.attributes = attributes;
        this.nameAttributeKey = nameAttributeKey;
        this.newUser = false;
    }

    public CustomOAuth2User(Member member, Map<String, Object> attributes, String nameAttributeKey, boolean newUser) {
        this.member = member;
        this.attributes = attributes;
        this.nameAttributeKey = nameAttributeKey;
        this.newUser = newUser;
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singleton(new SimpleGrantedAuthority("ROLE_" + member.getRole().name()));
    }

    @Override
    public String getName() {
        return member.getEmail();
    }

    public Long getId() {
        return member.getId();
    }

    public String getEmail() {
        return member.getEmail();
    }

    public Role getRole() {
        return member.getRole();
    }
}
