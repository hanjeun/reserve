package kr.it.reserve.member.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "login_method_challenge", uniqueConstraints =
        @UniqueConstraint(name = "uk_login_method_member_purpose", columnNames = {"member_id", "purpose"}),
        indexes = @Index(name = "idx_login_method_expiry", columnList = "expires_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoginMethodChallenge {
    public enum Purpose { SOCIAL_LINK, SOCIAL_REAUTH, PASSWORD_SETUP }

    @Id @Column(length = 36)
    private String id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;
    @Column(name = "auth_version", nullable = false)
    private int authVersion;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 30)
    private Purpose purpose;
    @Enumerated(EnumType.STRING) @Column(length = 20)
    private AuthProvider provider;
    @Column(length = 255)
    private String email;
    @Column(name = "code_hash", length = 100)
    private String codeHash;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;
    @Column(nullable = false)
    private boolean consumed;

    public LoginMethodChallenge(Member member, Purpose purpose, AuthProvider provider,
            String email, String codeHash, LocalDateTime now) {
        this.id = UUID.randomUUID().toString();
        this.member = member;
        this.authVersion = member.getAuthVersion();
        this.purpose = purpose;
        this.provider = provider;
        this.email = email;
        this.codeHash = codeHash;
        this.createdAt = now;
        this.expiresAt = now.plusMinutes(5);
    }

    public boolean validFor(Member current, Purpose expected, LocalDateTime now) {
        return !consumed && attemptCount < 5 && now.isBefore(expiresAt)
                && purpose == expected && member.getId().equals(current.getId())
                && authVersion == current.getAuthVersion();
    }
    public void failAttempt() { attemptCount++; }
    public void consume() { consumed = true; codeHash = null; }
}
