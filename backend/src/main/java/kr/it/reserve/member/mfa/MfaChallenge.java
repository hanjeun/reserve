package kr.it.reserve.member.mfa;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Getter
@NoArgsConstructor(access = lombok.AccessLevel.PROTECTED)
@Entity
@Table(name = "mfa_challenge", indexes = {@Index(name = "idx_mfa_challenge_expiry", columnList = "expires_at"), @Index(name = "idx_mfa_challenge_member", columnList = "member_id")})
public class MfaChallenge {
    public enum Purpose { LOGIN, MANAGE, PASSKEY_LOGIN }
    @Id @Column(length = 64) private String id;
    @Column(name = "member_id") private Long memberId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private Purpose purpose;
    @Column(name = "primary_method", length = 20) private String primaryMethod;
    @Column(name = "auth_version", nullable = false) private int authVersion;
    @Column(name = "bound_session_id", length = 36) private String boundSessionId;
    @Column(name = "oauth_at") private LocalDateTime oauthAt;
    @Column(name = "expires_at", nullable = false) private LocalDateTime expiresAt;
    @Column(nullable = false) private int failures;
    @Column(name = "factor_verified", nullable = false) private boolean factorVerified;
    @Column(name = "ceremony_type", length = 16) private String ceremonyType;
    @Lob @Column(name = "ceremony_json", columnDefinition = "TEXT") private String ceremonyJson;
    @Column(name = "pending_secret", length = 512) private String pendingSecret;
    @Column(name = "consumed_at") private LocalDateTime consumedAt;

    public MfaChallenge(String id, Long memberId, Purpose purpose, String primaryMethod, int authVersion,
            LocalDateTime oauthAt, LocalDateTime expiresAt) {
        this.id = id;
        this.memberId = memberId;
        this.purpose = purpose;
        this.primaryMethod = primaryMethod;
        this.authVersion = authVersion;
        this.oauthAt = oauthAt;
        this.expiresAt = expiresAt.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }
    public void limitExpiry(LocalDateTime expiry) { if (expiry.isBefore(expiresAt)) expiresAt = expiry.truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    public void loginContinuation() { purpose = Purpose.LOGIN; boundSessionId = null; }
    public void bindMember(Long id, int version) { memberId = id; authVersion = version; }
    public void updateAuthVersion(int version) { authVersion = version; }
    public void bindSession(String id) { boundSessionId = id; }
    public boolean active(LocalDateTime now) {
        return consumedAt == null && failures < 5 && expiresAt.isAfter(now);
    }
    public void failed() { failures++; }
    public void verified() { factorVerified = true; pendingSecret = null; clearCeremony(); }
    public void ceremony(String type, String json) { ceremonyType = type; ceremonyJson = json; }
    public void clearCeremony() { ceremonyType = null; ceremonyJson = null; }
    public void pendingSecret(String ciphertext) { pendingSecret = ciphertext; }
    public void consume(LocalDateTime now) {
        consumedAt = now;
        pendingSecret = null;
        clearCeremony();
    }
}
