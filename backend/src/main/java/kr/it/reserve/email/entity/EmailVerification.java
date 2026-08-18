package kr.it.reserve.email.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "email_verification")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmailVerification {

    /** 코드 한 장에 허용하는 대조 실패 횟수. PasswordResetToken 과 같은 이유·같은 값이다. */
    public static final int MAX_VERIFY_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, length = 6)
    private String verificationCode;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    @Builder.Default
    private Boolean verified = false;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    /**
     * 코드 대조 실패 누적 횟수 (2026-08-16 신설).
     *
     * <p>가입 인증 코드도 6자리 숫자라 비밀번호 재설정과 똑같은 무차별 대입 대상이다.
     * 피해 크기는 다르지만(계정 탈취가 아니라 남의 이메일로 가입) 구조는 같으므로 같이 막는다.
     * 자세한 근거는 {@code PasswordResetToken.attemptCount} 주석 참고.
     */
    @Column(name = "attempt_count", nullable = false, columnDefinition = "INT DEFAULT 0")
    @Builder.Default
    private int attemptCount = 0;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    /** 코드가 틀렸을 때 호출. */
    public void recordFailedAttempt() {
        this.attemptCount++;
    }

    /** 상한에 도달했으면 이 코드로는 더 시도할 수 없다. */
    public boolean isAttemptExhausted() {
        return this.attemptCount >= MAX_VERIFY_ATTEMPTS;
    }

    /**
     * 인증 코드 만료 여부 확인
     */
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(this.expiresAt);
    }

    /**
     * 인증 코드 검증
     */
    public boolean verify(String code) {
        if (isExpired()) {
            return false;
        }
        if (this.verificationCode.equals(code)) {
            this.verified = true;
            return true;
        }
        return false;
    }
}
