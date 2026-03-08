package com.reserve.member.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "member")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "member_id", unique = true, updatable = false)
    private Long id;

    @Column(name = "member_name", nullable = false)
    private String name;

    @Column(name = "email", nullable = false, unique = true)
    private String email;

    @Column(name = "password")  // OAuth 사용자는 password가 null일 수 있음
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    @Builder.Default
    private Role role = Role.USER; // 기본값: 일반 사용자

    // OAuth2 관련 필드
    @Enumerated(EnumType.STRING)
    @Column(name = "provider")
    private AuthProvider provider;  // GOOGLE, NAVER, KAKAO, LOCAL

    @Column(name = "provider_id")
    private String providerId;  // OAuth2 제공자의 고유 ID

    @Column(name = "profile_image")
    private String profileImage;  // 프로필 이미지 URL

    // 사용자가 직접 이미지를 변경(업로드 or 기본이미지로 삭제)한 경우 true
    // true면 소셜 재로그인 시 소셜 프로필 이미지로 덮어쓰지 않음
    @Builder.Default
    @Column(name = "profile_image_locked", nullable = false, columnDefinition = "TINYINT(1) DEFAULT 0")
    private boolean profileImageLocked = false;

    @Column(name = "oauth_access_token", length = 2048)
    private String oauthAccessToken;  // OAuth Access Token (연동 해제용)

    // 권한 체크 헬퍼 메서드
    public boolean isUser() {
        return this.role == Role.USER;
    }

    public boolean isBusiness() {
        return this.role == Role.BUSINESS;
    }

    public boolean isAdmin() { return this.role == Role.ADMIN; }

    // OAuth 사용자인지 확인
    public boolean isOAuthUser() {
        return this.provider != null && this.provider != AuthProvider.LOCAL;
    }

    // OAuth 정보 업데이트
    // profileImageLocked = true : 유저가 직접 이미지 조작 → 소셜 이미지로 덮어쓰지 않음
    // profileImageLocked = false : 최초 가입 상태 → 소셜 프로필 이미지 적용
    public Member updateOAuth(String name, String profileImage) {
        if (name != null) this.name = name;
        if (!this.profileImageLocked && profileImage != null) {
            this.profileImage = profileImage;
        }
        return this;
    }
}
