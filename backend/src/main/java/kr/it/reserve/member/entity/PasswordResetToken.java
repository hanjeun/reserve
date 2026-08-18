package kr.it.reserve.member.entity;

import jakarta.persistence.*;
import lombok.*;
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

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    @Builder.Default
    private boolean verified = false;

    /**
     * 코드 대조 실패 누적 횟수 (2026-08-16 신설).
     *
     * <h3>왜 rate limit 만으로는 안 되는가</h3>
     * 코드가 6자리 숫자라 경우의 수가 90만뿐이다. IP 기준 제한은 공격자가 프록시·봇넷으로
     * IP 를 돌리면 매번 새 버킷이 되어 <b>사실상 무제한</b>이 된다. 그래서 상한을
     * <b>토큰 자체</b>에 건다 — "이 코드 한 장으로 몇 번까지 시도할 수 있는가"가
     * 요청지와 무관하게 확정되므로, 분산 공격에도 뚫리지 않는다.
     * IP·계정 rate limit 은 그 위에 얹는 2차 방어다.
     *
     * <p>{@code columnDefinition} 에 DEFAULT 를 명시한 이유: {@code ddl-auto: update} 로
     * NOT NULL 컬럼이 추가될 때 기존 행을 채울 값이 필요하다(같은 이유로 {@code verified} 도
     * 이 형태다). 마이그레이션 툴이 없으므로 이걸 빼면 배포 시 ALTER 가 실패한다.
     */
    @Column(name = "attempt_count", nullable = false, columnDefinition = "INT DEFAULT 0")
    @Builder.Default
    private int attemptCount = 0;

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
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
