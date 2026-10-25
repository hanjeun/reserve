package kr.it.reserve.member.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Clock;
import java.time.LocalDateTime;

@Entity
@Table(name = "password_reset_token")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PasswordResetToken {

    /**
     * 코드 한 장에 허용하는 대조 실패 횟수. 넘으면 토큰이 죽고 재발송해야 한다.
     *
     * <p>오타를 두어 번 내는 건 흔하므로 너무 빡빡하면 정상 사용자가 막힌다. 5회면
     * 사람이 실수로 도달하기는 어렵고, 공격자에겐 90만분의 5라 아무 의미가 없는 수치다.
     */
    public static final int MAX_VERIFY_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "token", nullable = false, length = 10)
    private String token;

    /** 새 코드는 해시만 보관한다. NULL은 배포 전 발급된 5분짜리 코드의 호환 경로다. */
    @Column(name = "token_hash", length = 60)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    @Builder.Default
    private boolean verified = false;

    /** IP·계정 제한과 별도로 코드 자체의 대조 실패 횟수를 누적한다. 기존 행에도 적용할 기본값을 지정한다. */
    @Column(name = "attempt_count", nullable = false, columnDefinition = "INT DEFAULT 0")
    @Builder.Default
    private int attemptCount = 0;

    public boolean isExpired() {
        return LocalDateTime.now(Clock.systemDefaultZone()).isAfter(expiresAt);
    }

    public void markVerified() {
        this.verified = true;
    }

    /** 코드가 틀렸을 때 호출. 호출부가 카운트를 잊지 않도록 실패 경로에서 반드시 부른다. */
    public void recordFailedAttempt() {
        this.attemptCount++;
    }

    /** 상한에 도달했으면 이 토큰으로는 더 시도할 수 없다. */
    public boolean isAttemptExhausted() {
        return this.attemptCount >= MAX_VERIFY_ATTEMPTS;
    }
}
