package kr.it.reserve.member.entity;

import java.time.Clock;
import java.time.LocalDateTime;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import kr.it.reserve.config.oauth2.OAuthProviderTokenConverter;

@Entity
@Table(name = "member", indexes = @Index(name = "idx_member_oauth_subject", columnList = "provider,provider_id,deleted_at"))
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

    /**
     * 비밀번호가 바뀔 때 증가하는 세션 세대. JWT claim과 다르면 서명이 유효해도 인증하지 않는다.
     * 기존 운영 행과 구버전 JWT는 모두 0으로 호환되도록 DB 기본값도 0이다.
     */
    @Builder.Default
    @Column(name = "auth_version", nullable = false, columnDefinition = "INT NOT NULL DEFAULT 0")
    private int authVersion = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    @Builder.Default
    private Role role = Role.USER; // 기본값: 일반 사용자

    // OAuth2 관련 필드
    @Enumerated(EnumType.STRING)
    @Column(name = "provider")
    private AuthProvider provider;

    @Column(name = "provider_id")
    private String providerId;  // OAuth2 제공자의 고유 ID

    /** 로그인 수단을 직접 관리한 회원의 연락처·프로필은 공급자 재로그인으로 덮어쓰지 않는다. */
    @Builder.Default
    @Column(name = "login_methods_managed", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean loginMethodsManaged = false;

    @Column(name = "profile_image")
    private String profileImage;  // 프로필 이미지 URL

    // 사용자가 직접 이미지를 변경(업로드 or 기본이미지로 삭제)한 경우 true
    // true면 소셜 재로그인 시 소셜 프로필 이미지로 덮어쓰지 않음
    @Builder.Default
    @Column(name = "profile_image_locked", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean profileImageLocked = false;

    @Convert(converter = OAuthProviderTokenConverter.class)
    @Column(name = "oauth_access_token", columnDefinition = "TEXT")
    private String oauthAccessToken;  // OAuth Access Token (연동 해제용)

    /** 가장 최근 공급자 인증 시각(UTC). 늦게 도착한 이전 연결의 사건과 새 인증을 구분한다. */
    @Column(name = "oauth_authenticated_at")
    private LocalDateTime oauthAuthenticatedAt;

    /** 공급자 사건보다 오래된 진행 중 인증이 폐기된 연결을 되살리지 못하게 하는 UTC cutoff. */
    @Column(name = "oauth_security_revoked_at")
    private LocalDateTime oauthSecurityRevokedAt;

    public boolean acceptsOAuthAuthentication(LocalDateTime authenticatedAt) {
        return authenticatedAt != null
                && (oauthSecurityRevokedAt == null || authenticatedAt.isAfter(oauthSecurityRevokedAt))
                && (oauthAuthenticatedAt == null || !authenticatedAt.isBefore(oauthAuthenticatedAt));
    }

    public void recordOAuthSecurityRevocation(LocalDateTime occurredAt) {
        if (oauthSecurityRevokedAt == null || occurredAt.isAfter(oauthSecurityRevokedAt)) {
            oauthSecurityRevokedAt = occurredAt;
        }
    }

    // 개인 이메일 알림 수신 여부 (예약 승인/거절 등)
    @Builder.Default
    @Column(name = "email_notification_enabled", nullable = false, columnDefinition = "BOOLEAN DEFAULT TRUE")
    private boolean emailNotificationEnabled = true;

    // 서비스 이용약관 동의 여부 (소셜 로그인 신규 가입 시 별도 동의)
    @Builder.Default
    @Column(name = "terms_agreed", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean termsAgreed = false;

    // 이메일 마케팅 수신 동의 여부 (선택 동의)
    @Builder.Default
    @Column(name = "marketing_agreed", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean marketingAgreed = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private MemberStatus status = MemberStatus.ACTIVE;

    @Column(name = "suspended_until")
    private LocalDateTime suspendedUntil;

    @Column(name = "suspend_reason")
    private String suspendReason;

    // 위치 기반 거리순 정렬용 — nullable (미입력/거부 시 null 유지, 거리순 정렬은 rating으로 fallback)
    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    /** 선택한 원본 주소를 좌표와 함께 저장한다. 좌표만 저장된 회원은 주소가 없을 수 있다. */
    @Column(name = "location_address")
    private String locationAddress;

    @Column(name = "location_zip_code", length = 10)
    private String locationZipCode;

    @Column(name = "location_address_detail")
    private String locationAddressDetail;

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

    public void rotateAuthVersion() {
        this.authVersion = this.authVersion == Integer.MAX_VALUE ? 1 : this.authVersion + 1;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(Clock.systemDefaultZone());
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    /**
     * 거래 원장의 FK는 유지하면서 로그인·연락·위치 식별자는 제거한다.
     * 이메일은 unique 제약 때문에 회원 ID 기반의 비식별 주소로 치환한다.
     */
    public void withdraw(String anonymizedEmail) {
        this.name = "탈퇴한 회원";
        this.email = anonymizedEmail;
        this.password = null;
        this.role = Role.USER;
        this.provider = null;
        this.providerId = null;
        this.loginMethodsManaged = false;
        this.profileImage = null;
        this.profileImageLocked = true;
        this.oauthAccessToken = null;
        this.oauthAuthenticatedAt = null;
        this.oauthSecurityRevokedAt = null;
        this.emailNotificationEnabled = false;
        this.termsAgreed = false;
        this.marketingAgreed = false;
        this.latitude = null;
        this.longitude = null;
        this.locationAddress = null;
        this.locationZipCode = null;
        this.locationAddressDetail = null;
        this.status = MemberStatus.ACTIVE;
        this.suspendedUntil = null;
        this.suspendReason = null;
        this.deletedAt = LocalDateTime.now(Clock.systemDefaultZone());
    }

    // 제재 상태 체크
    // 주의: DB 반영은 하지 않음. 호출측에서 @Transactional 필요
    public boolean isSuspended() {
        if (this.status == MemberStatus.BANNED) return true;
        if (this.status == MemberStatus.SUSPENDED) {
            return this.suspendedUntil == null
                    || !LocalDateTime.now(Clock.systemDefaultZone()).isAfter(this.suspendedUntil);
        }
        return false;
    }

    public boolean isSuspensionExpired() {
        return this.status == MemberStatus.SUSPENDED
            && this.suspendedUntil != null
            && LocalDateTime.now(Clock.systemDefaultZone()).isAfter(this.suspendedUntil);
    }

    public void suspend(LocalDateTime until, String reason) {
        this.status = MemberStatus.SUSPENDED;
        this.suspendedUntil = until;
        this.suspendReason = reason;
    }

    public void ban(String reason) {
        this.status = MemberStatus.BANNED;
        this.suspendedUntil = null;
        this.suspendReason = reason;
    }

    public void unban() {
        this.status = MemberStatus.ACTIVE;
        this.suspendedUntil = null;
        this.suspendReason = null;
    }

    public Member updateOAuth(String name, String profileImage) {
        if (name != null) {
            this.name = name;
        } else if (this.name == null) {
            this.name = "사용자";
        }
        if (!this.profileImageLocked && profileImage != null) {
            this.profileImage = profileImage;
        }
        return this;
    }
}
