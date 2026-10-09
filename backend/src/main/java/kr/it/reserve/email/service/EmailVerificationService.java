package kr.it.reserve.email.service;

import kr.it.reserve.email.entity.EmailVerification;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.EmailException; // 추가
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus; // 추가
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.security.SecureRandom;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HexFormat;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    private final EmailVerificationRepository verificationRepository;
    private final MemberRepository memberRepository;
    private final EmailService emailService;

    private static final int CODE_LENGTH = 6;
    private static final SecureRandom CODE_RANDOM = new SecureRandom();
    private static final int EXPIRATION_MINUTES = 5;
    private static final String EMAIL_CONSTRAINT = "uk_email_verification_email";

    @Transactional
    public Instant sendVerificationCode(String email) {
        if (memberRepository.findByEmailAndDeletedAtIsNull(email).isPresent()) {
            throw new EmailException("이미 가입된 이메일이에요.", HttpStatus.CONFLICT);
        }

        LocalDateTime now = LocalDateTime.now(Clock.systemDefaultZone());
        EmailVerification verification = verificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                .orElseGet(() -> EmailVerification.builder().email(email).build());
        if (verification.getCreatedAt() != null && verification.getCreatedAt().isAfter(now.minusMinutes(1))) {
            throw new EmailException("인증 코드를 이미 발송했어요. 1분 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        String code = generateVerificationCode();
        verification.setVerificationCode(code);
        verification.setExpiresAt(now.plusMinutes(EXPIRATION_MINUTES));
        verification.setCreatedAt(now);
        verification.setVerified(false);
        verification.setVerificationTicketHash(null);
        verification.setAttemptCount(0);
        // Flush the unique-email boundary before sending mail, including concurrent first requests.
        try {
            verificationRepository.saveAndFlush(verification);
        } catch (DataIntegrityViolationException failure) {
            if (!isConcurrentEmailIssue(failure)) throw failure;
            throw new EmailException("인증 요청을 처리 중이에요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }

        emailService.sendVerificationEmail(email, code);

        log.info("Verification code sent");
        return verification.getExpiresAt().atZone(ZoneId.systemDefault()).toInstant();
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
                .orElseThrow(() -> new EmailException("인증 요청 내역을 찾을 수 없어요. 다시 요청해주세요.", HttpStatus.NOT_FOUND));

        if (verification.isExpired()) {
            // [수정] 만료된 자원이므로 410 Gone 또는 400 사용
            throw new EmailException("인증 시간이 만료됐어요. 다시 요청해주세요.", HttpStatus.GONE);
        }

        // 시도 횟수 상한 (2026-08-16) — 코드가 6자리 숫자라 이 상한이 1차 방어다.
        if (verification.isAttemptExhausted()) {
            log.warn("Email verification attempts exhausted");
            throw new EmailException("인증 시도 횟수를 초과했어요. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }

        if (!verification.getVerificationCode().equals(code)) {
            verification.recordFailedAttempt();
            verificationRepository.save(verification);
            log.warn("Email verification code mismatch: attempt={}/{}",
                    verification.getAttemptCount(), EmailVerification.MAX_VERIFY_ATTEMPTS);
            // [수정] 잘못된 입력값이므로 400 Bad Request
            throw new EmailException("인증 코드가 일치하지 않아요.", HttpStatus.BAD_REQUEST);
        }

        verification.setVerified(true);
        verificationRepository.save(verification);

        log.info("Email verification completed");
        return true;
    }

    @Transactional(readOnly = true)
    public boolean isEmailVerified(String email) {
        return verificationRepository.findByEmailAndVerifiedTrue(email)
                .filter(verification -> !verification.isExpired() && !verification.isAttemptExhausted()).isPresent();
    }

    @Transactional(noRollbackFor = BusinessException.class)
    public VerificationResult verifyCodeAndIssueTicket(String email, String code) {
        verifyCode(email, code);
        EmailVerification verification = verificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                .orElseThrow(() -> new EmailException("이메일 인증을 다시 요청해주세요.", HttpStatus.BAD_REQUEST));
        byte[] bytes = new byte[32];
        CODE_RANDOM.nextBytes(bytes);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        verification.setVerificationTicketHash(hashTicket(ticket));
        verificationRepository.save(verification);
        return new VerificationResult(ticket, verification.getExpiresAt().atZone(ZoneId.systemDefault()).toInstant());
    }

    public record VerificationResult(String verificationTicket, Instant expiresAt) {}

    /** The signup transaction owns consumption; failed account creation restores the verification. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void consumeVerifiedEmail(String email, String ticket) {
        EmailVerification verification = verificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                .filter(value -> Boolean.TRUE.equals(value.getVerified()) && !value.isExpired() && !value.isAttemptExhausted())
                .orElseThrow(() -> new EmailException("이메일 인증이 만료됐거나 필요해요. 다시 인증해주세요.", HttpStatus.BAD_REQUEST));
        if (ticket == null || !ticket.matches("[A-Za-z0-9_-]{43}") || verification.getVerificationTicketHash() == null
                || !MessageDigest.isEqual(hashTicket(ticket).getBytes(StandardCharsets.US_ASCII),
                    verification.getVerificationTicketHash().getBytes(StandardCharsets.US_ASCII))) {
            throw new EmailException("이메일 인증을 다시 진행해주세요.", HttpStatus.BAD_REQUEST);
        }
        verificationRepository.delete(verification);
        verificationRepository.flush();
    }

    private static String hashTicket(String ticket) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(ticket.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private static boolean isConcurrentEmailIssue(DataIntegrityViolationException failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException constraint) {
                String name = constraint.getConstraintName();
                if (name != null && (name.equals(EMAIL_CONSTRAINT) || name.endsWith("." + EMAIL_CONSTRAINT))) return true;
            }
        }
        return false;
    }

    private String generateVerificationCode() {
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CODE_RANDOM.nextInt(10));
        }
        return code.toString();
    }
}
