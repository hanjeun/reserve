package kr.it.reserve.email.service;

import kr.it.reserve.email.entity.EmailVerification;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.EmailException; // 추가
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus; // 추가
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    private final EmailVerificationRepository verificationRepository;
    private final MemberRepository memberRepository;
    private final EmailService emailService;

    private static final int CODE_LENGTH = 6;
    private static final int EXPIRATION_MINUTES = 5;

    @Transactional
    public void sendVerificationCode(String email) {
        if (memberRepository.findByEmail(email).isPresent()) {
            throw new EmailException("이미 가입된 이메일입니다.", HttpStatus.CONFLICT);
        }

        // 연속 안전장치: 1분 이내 재발송 차단
        verificationRepository.findTopByEmailOrderByCreatedAtDesc(email).ifPresent(existing -> {
            if (existing.getCreatedAt() != null &&
                existing.getCreatedAt().isAfter(LocalDateTime.now().minusMinutes(1))) {
                throw new EmailException("인증 코드를 이미 발송했습니다. 1분 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
            }
        });

        verificationRepository.deleteByEmail(email);

        String code = generateVerificationCode();

        EmailVerification verification = EmailVerification.builder()
                .email(email)
                .verificationCode(code)
                .expiresAt(LocalDateTime.now().plusMinutes(EXPIRATION_MINUTES))
                .verified(false)
                .build();

        verificationRepository.save(verification);

        emailService.sendVerificationEmail(email, code);

        log.info("Verification code sent: email={}", email);
    }

    /**
     * 코드 검증.
     *
     * <p>{@code noRollbackFor} 가 없으면 실패 카운터가 예외와 함께 롤백돼 <b>영원히 0</b>이 된다 —
     * 근거는 {@code PasswordResetService.verifyCode} 주석에 자세히 적어뒀다.
     */
    @Transactional(noRollbackFor = BusinessException.class)
    public boolean verifyCode(String email, String code) {
        EmailVerification verification = verificationRepository
                .findTopByEmailOrderByCreatedAtDesc(email)
                .orElseThrow(() -> new EmailException("인증 요청 내역을 찾을 수 없습니다. 다시 요청해주세요.", HttpStatus.NOT_FOUND));

        if (verification.isExpired()) {
            // [수정] 만료된 자원이므로 410 Gone 또는 400 사용
            throw new EmailException("인증 시간이 만료되었습니다. 다시 요청해주세요.", HttpStatus.GONE);
        }

        // 시도 횟수 상한 (2026-08-16) — 코드가 6자리 숫자라 이 상한이 1차 방어다.
        if (verification.isAttemptExhausted()) {
            log.warn("Email verification attempts exhausted: email={}", email);
            throw new EmailException("인증 시도 횟수를 초과했습니다. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }

        if (!verification.getVerificationCode().equals(code)) {
            verification.recordFailedAttempt();
            verificationRepository.save(verification);
            log.warn("Email verification code mismatch: email={}, attempt={}/{}",
                    email, verification.getAttemptCount(), EmailVerification.MAX_VERIFY_ATTEMPTS);
            // [수정] 잘못된 입력값이므로 400 Bad Request
            throw new EmailException("인증 코드가 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }

        verification.setVerified(true);
        verificationRepository.save(verification);

        log.info("Email verification completed: email={}", email);
        return true;
    }

    public boolean isEmailVerified(String email) {
        return verificationRepository.findByEmailAndVerifiedTrue(email).isPresent();
    }

    private String generateVerificationCode() {
        SecureRandom random = new SecureRandom();
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(random.nextInt(10));
        }
        return code.toString();
    }
}