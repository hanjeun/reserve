package kr.it.reserve.config.jwt.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;

/**
 * One device and one refresh family. All timestamps are UTC.
 * The old refresh_token table is deliberately not read: its sid-less tokens require a new login.
 * Only hashes and non-secret reconstruction metadata are stored, never a bearer credential.
 */
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Getter
@Entity
@Table(name = "login_session", indexes = {
        @Index(name = "idx_login_session_member", columnList = "member_id"),
        @Index(name = "idx_login_session_expiry", columnList = "expires_at")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uk_login_session_sid", columnNames = "session_id"),
        @UniqueConstraint(name = "uk_login_session_hash", columnNames = "refresh_token_hash")
})
public class RefreshToken {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;
    @Column(name = "session_id", nullable = false, length = 36)
    private String sessionId;
    @Column(name = "refresh_token_hash", nullable = false, length = 64)
    private String refreshTokenHash;
    @Column(name = "previous_token_hash", length = 64)
    private String previousTokenHash;
    @Column(name = "rotation_version", nullable = false)
    private long rotationVersion;
    @Column(name = "refresh_jti", nullable = false, length = 36)
    private String refreshJti;
    @Column(name = "signing_key_id", length = 48)
    private String signingKeyId;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    @Column(name = "issued_at", nullable = false)
    private LocalDateTime issuedAt;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "absolute_expires_at", nullable = false)
    private LocalDateTime absoluteExpiresAt;
    @Column(name = "rotated_at")
    private LocalDateTime rotatedAt;
    @Column(name = "auth_version", nullable = false)
    private int authVersion;
    @Column(name = "oauth_authenticated_at")
    private LocalDateTime oauthAuthenticatedAt;
    @Column(name = "login_method", nullable = false, length = 16)
    private String loginMethod;

    public RefreshToken(Long memberId, String sessionId, String refreshJti, String signingKeyId,
                        LocalDateTime issuedAt, LocalDateTime expiresAt, LocalDateTime absoluteExpiresAt,
                        int authVersion, LocalDateTime oauthAuthenticatedAt, String loginMethod) {
        this.memberId = Objects.requireNonNull(memberId);
        this.sessionId = Objects.requireNonNull(sessionId);
        this.refreshJti = Objects.requireNonNull(refreshJti);
        this.signingKeyId = signingKeyId;
        this.createdAt = issuedAt.truncatedTo(ChronoUnit.SECONDS);
        this.issuedAt = this.createdAt;
        this.expiresAt = expiresAt.truncatedTo(ChronoUnit.SECONDS);
        this.absoluteExpiresAt = absoluteExpiresAt.truncatedTo(ChronoUnit.SECONDS);
        this.authVersion = authVersion;
        this.oauthAuthenticatedAt = oauthAuthenticatedAt == null ? null
                : oauthAuthenticatedAt.truncatedTo(ChronoUnit.MILLIS);
        this.loginMethod = Objects.requireNonNull(loginMethod);
    }

    /** Compatibility for fixtures that only seed a removable session; the argument is immediately hashed. */
    public RefreshToken(Long memberId, String token, LocalDateTime expiresAt) {
        this(memberId, UUID.randomUUID().toString(), UUID.randomUUID().toString(), null,
                utcNow(), expiresAt, expiresAt, 0, null, "PASSWORD");
        bindRefreshToken(token);
    }

    public void bindRefreshToken(String token) { this.refreshTokenHash = hash(token); }

    public void rotate(String token, String jti, String keyId, LocalDateTime now, LocalDateTime expiresAt) {
        if (rotationVersion == Long.MAX_VALUE) throw new IllegalStateException("Refresh family rotation exhausted");
        this.previousTokenHash = this.refreshTokenHash;
        this.refreshTokenHash = hash(token);
        this.refreshJti = jti;
        this.signingKeyId = keyId;
        this.issuedAt = now.truncatedTo(ChronoUnit.SECONDS);
        this.expiresAt = expiresAt.truncatedTo(ChronoUnit.SECONDS);
        this.rotatedAt = now;
        this.rotationVersion++;
    }

    public boolean isExpired() { return !isLiveAt(utcNow()); }
    public boolean isLiveAt(LocalDateTime now) {
        return expiresAt != null && absoluteExpiresAt != null
                && now.isBefore(expiresAt) && now.isBefore(absoluteExpiresAt);
    }
    public boolean isCurrentToken(String token) { return equalHash(refreshTokenHash, token); }
    public boolean isPreviousToken(String token) { return equalHash(previousTokenHash, token); }
    public boolean rotatedWithin(Duration grace, LocalDateTime now) {
        return rotatedAt != null && !now.isBefore(rotatedAt) && now.isBefore(rotatedAt.plus(grace));
    }

    private static boolean equalHash(String expected, String token) {
        return expected != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
                hash(token).getBytes(StandardCharsets.US_ASCII));
    }
    private static LocalDateTime utcNow() { return LocalDateTime.now(Clock.systemUTC()); }
    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
