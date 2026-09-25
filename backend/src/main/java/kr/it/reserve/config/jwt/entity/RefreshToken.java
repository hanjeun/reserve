package kr.it.reserve.config.jwt.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;

/**
 * 기기(로그인)마다 한 행. refresh 요청이 올 때마다 같은 행의 토큰을 새 토큰으로 바꾼다(rotation).
 *
 * <p>{@code previousTokenHash}·{@code rotatedAt}은 직전 토큰을 식별하는 용도다.
 * 동시에 나간 refresh 요청(탭 여러 개·재시도)이 방금 바뀐 직전 토큰을 들고 오면 짧은 유예 안에서는
 * 현재 토큰을 돌려주고, 유예가 지난 뒤 직전 토큰이 다시 오면 탈취 재사용으로 보고 이 행을 지운다.
 * 원문 토큰은 이미 {@code refresh_token}에 있으므로 직전 토큰은 해시(SHA-256 hex)만 남긴다.
 */
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Getter
@Entity
@Table(name = "refresh_token",
        indexes = @Index(name = "idx_refresh_token_previous_hash", columnList = "previous_token_hash"))
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "refresh_token", nullable = false, columnDefinition = "TEXT")
    private String refreshToken;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** 바로 직전 토큰의 SHA-256 hex. 한 번도 회전하지 않은 행은 null. */
    @Column(name = "previous_token_hash", length = 64)
    private String previousTokenHash;

    /** 마지막 회전 시각. 직전 토큰 유예 판정에 쓴다. */
    @Column(name = "rotated_at")
    private LocalDateTime rotatedAt;

    public RefreshToken(Long memberId, String refreshToken, LocalDateTime expiresAt) {
        this.memberId = memberId;
        this.refreshToken = refreshToken;
        this.expiresAt = expiresAt;
    }

    /** 현재 토큰을 새 토큰으로 바꾸고 만료를 다시 잡는다(sliding). 직전 토큰은 해시로만 남긴다. */
    public void rotate(String newToken, LocalDateTime newExpiresAt, LocalDateTime now) {
        this.previousTokenHash = hash(this.refreshToken);
        this.refreshToken = newToken;
        this.expiresAt = newExpiresAt;
        this.rotatedAt = now;
    }

    public boolean isExpired() {
        if (this.expiresAt == null) return true; // null이면 만료된 것으로 처리
        return LocalDateTime.now().isAfter(this.expiresAt);
    }

    /** 제시된 토큰이 이 행의 바로 직전 토큰인가. */
    public boolean isPreviousToken(String presentedToken) {
        return previousTokenHash != null && previousTokenHash.equals(hash(presentedToken));
    }

    /** 마지막 회전이 {@code grace} 이내에 있었는가. */
    public boolean rotatedWithin(Duration grace, LocalDateTime now) {
        return rotatedAt != null && !rotatedAt.plus(grace).isBefore(now);
    }

    public static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
