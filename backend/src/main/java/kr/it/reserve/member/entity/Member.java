package kr.it.reserve.member.entity;

import java.time.LocalDateTime;
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
    @Column(name = "profile_image_locked", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean profileImageLocked = false;

    @Column(name = "oauth_access_token", length = 2048)
    private String oauthAccessToken;  // OAuth Access Token (연동 해제용)

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

    /**
     * 위치 등록 시 사용자가 실제로 고른 주소 문자열.
     *
     * 2026-07 전수조사로 추가됨. 예전엔 latitude/longitude만 저장했는데, 그러면 마이페이지의
     * 위치 탭을 다시 열었을 때 "무엇을 저장했는지"를 화면에 되살릴 방법이 전혀 없었다 —
     * 좌표만으로는 주소를 역산할 수 없으니 AddressSearch 입력칸이 항상 빈칸으로 뜨고,
     * 저장 버튼도 (좌표가 로컬 state라) 계속 비활성이라 사용자 입장에선 "저장이 안 됐다"고
     * 보였다. 실제로는 DB에 좌표가 멀쩡히 들어가 있었고 거리순 정렬/우리동네 배지도 잘 동작했음.
     * → 좌표와 함께 원본 주소 문자열도 보관해서 화면이 저장 상태를 정직하게 보여줄 수 있게 함.
     *
     * nullable: 이 컬럼이 생기기 전에 위치를 등록한 기존 회원은 좌표만 있고 주소는 null이다.
     */
    @Column(name = "location_address")
    private String locationAddress;

    /**
     * 우편번호 / 상세주소.
     *
     * AddressSearch 컴포넌트는 도로명주소 + 우편번호 + 상세주소 3개를 한 세트로 다루는데
     * (Store 엔티티도 address / zip_code / address_detail 3개를 모두 저장한다),
     * Member엔 location_address 하나만 있어서 우편번호와 상세주소를 저장할 곳이 없었다.
     * 그래서 마이페이지 위치 탭에서 주소를 저장하고 새로고침하면 도로명만 복원되고
     * 우편번호 칸은 아예 안 뜨고 상세주소는 빈칸이 되는 버그가 있었다 (2026-07 전수조사).
     * → Store와 동일한 컨벤션으로 3개를 모두 보관한다.
     */
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

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    // 제재 상태 체크
    // 주의: DB 반영은 하지 않음. 호출측에서 @Transactional 필요
    public boolean isSuspended() {
        if (this.status == MemberStatus.BANNED) return true;
        if (this.status == MemberStatus.SUSPENDED) {
            if (this.suspendedUntil != null && LocalDateTime.now().isAfter(this.suspendedUntil)) {
                return false;
            }
            return true;
        }
        return false;
    }

    public boolean isSuspensionExpired() {
        return this.status == MemberStatus.SUSPENDED
            && this.suspendedUntil != null
            && LocalDateTime.now().isAfter(this.suspendedUntil);
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
