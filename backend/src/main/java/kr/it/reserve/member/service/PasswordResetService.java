package kr.it.reserve.member.service;

import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.global.security.PasswordPolicy;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.PasswordResetToken;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final int EXPIRES_MINUTES = 5;
    private static final SecureRandom CODE_RANDOM = new SecureRandom();

    private final MemberRepository memberRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final EmailService emailService;
    private final BCryptPasswordEncoder passwordEncoder;
    private final PwnedPasswordChecker pwnedPasswordChecker;
    private final RefreshTokenRepository refreshTokenRepository;

    /**
     * 비밀번호 재설정 코드 발송
     * @return true = 실제 발송됨, false = 미가입/OAuth 계정 (프론트에서 안내 메시지용)
     */
    @Transactional
    public boolean sendResetCode(String email) {
        var memberOpt = memberRepository.findActiveByEmailForUpdate(email);
        if (memberOpt.isEmpty()) {
            log.info("Password reset request not deliverable");
            return false;
        }
        var member = memberOpt.get();
        if (member.getPassword() == null) {
            // OAuth 전용 계정 (Google/Naver/Kakao) → 로컬 비밀번호 없음
            log.info("Password reset request not deliverable");
            return false;
        }

        tokenRepository.deleteByEmail(email);
        String code = generateCode();
        PasswordResetToken token = PasswordResetToken.builder()
                .email(email)
                .token("HASHED")
                .tokenHash(passwordEncoder.encode(code))
                .expiresAt(LocalDateTime.now(Clock.systemDefaultZone()).plusMinutes(EXPIRES_MINUTES))
                .build();
        tokenRepository.save(token);
        emailService.sendPasswordResetEmail(email, code);
        log.info("Password reset code queued: memberId={}", member.getId());
        return true;
    }

    /** 실패 횟수 증가가 예외로 롤백되지 않도록 noRollbackFor를 유지한다. */
    @Transactional(noRollbackFor = BusinessException.class)
    public void verifyCode(String email, String code) {
        PasswordResetToken token = findLatestTokenForUpdate(email)
                .orElseThrow(() -> new MemberException("인증 코드가 존재하지 않아요. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST));

        if (token.isExpired()) {
            throw new MemberException("인증 시간이 만료됐어요. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }
        requireAttemptsLeft(token);

        if (!matchesCode(token, code)) {
            token.recordFailedAttempt();
            log.warn("Password reset code mismatch: attempt={}/{}",
                    token.getAttemptCount(), PasswordResetToken.MAX_VERIFY_ATTEMPTS);
            throw new MemberException("인증 코드가 일치하지 않아요.", HttpStatus.BAD_REQUEST);
        }
        token.markVerified();
    }

    /**
     * 시도 횟수가 남았는지 확인. 소진됐으면 코드가 맞든 틀리든 거부한다.
     *
     * <p>메시지를 "재발송해주세요"로 두는 건 의도적이다 — 남은 횟수를 숫자로 알려주면
     * 공격자가 언제 리셋되는지 계산할 수 있고, 정상 사용자에게는 다음에 할 행동만 알려주면 된다.
     */
    private void requireAttemptsLeft(PasswordResetToken token) {
        if (token.isAttemptExhausted()) {
            log.warn("Password reset code attempts exhausted");
            throw new MemberException(
                    "인증 시도 횟수를 초과했어요. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    /** 코드 검증을 건너뛰는 우회를 막기 위해 재설정 경로에도 대조 횟수 제한을 적용한다. 실패 횟수는 롤백하지 않는다. */
    @Transactional(noRollbackFor = BusinessException.class)
    public void resetPassword(String email, String code, String newPassword) {
        // 재발송과 같은 member → token 순서를 지켜 잠금 순환과 중복 소비를 막는다.
        var memberOpt = memberRepository.findActiveByEmailForUpdate(email);
        PasswordResetToken token = findLatestTokenForUpdate(email)
                .orElseThrow(() -> new MemberException("인증 코드가 존재하지 않아요.", HttpStatus.BAD_REQUEST));

        if (token.isExpired()) {
            throw new MemberException("인증 시간이 만료됐어요. 다시 시도해주세요.", HttpStatus.BAD_REQUEST);
        }
        requireAttemptsLeft(token);

        if (!matchesCode(token, code)) {
            token.recordFailedAttempt();
            log.warn("Password reset code mismatch on reset: attempt={}/{}",
                    token.getAttemptCount(), PasswordResetToken.MAX_VERIFY_ATTEMPTS);
            throw new MemberException("잘못된 접근이에요.", HttpStatus.BAD_REQUEST);
        }
        if (!token.isVerified()) {
            throw new MemberException("코드 인증을 먼저 완료해주세요.", HttpStatus.BAD_REQUEST);
        }

        Member member = memberOpt.orElseThrow(MemberException::notFound);

        String policyViolation = PasswordPolicy.violation(newPassword);
        if (policyViolation != null) {
            throw new MemberException(policyViolation, HttpStatus.BAD_REQUEST);
        }

        // 재설정 경로에도 같은 검사를 건다. 여기를 빼면 "가입은 막히는데 재설정으로는 들어간다"는
        // 우회로가 생긴다 — 정책은 반드시 모든 진입로에 같이 걸려야 의미가 있다.
        // 토큰 검증을 먼저 통과한 뒤에 두었으므로 임의의 외부인이 이 경로로 외부 API 를 두드릴 수 없다.
        if (pwnedPasswordChecker.isPwned(newPassword)) {
            throw new MemberException(
                    "다른 사이트에서 유출된 적이 있는 비밀번호예요. 다른 비밀번호를 사용해주세요.",
                    HttpStatus.BAD_REQUEST);
        }

        member.setPassword(passwordEncoder.encode(newPassword));
        member.rotateAuthVersion();
        refreshTokenRepository.deleteByMemberId(member.getId());
        tokenRepository.deleteByEmail(email);
        log.info("Password reset completed: memberId={}", member.getId());
    }

    private Optional<PasswordResetToken> findLatestTokenForUpdate(String email) {
        return tokenRepository.findIdsByEmail(email).stream()
                .findFirst()
                .flatMap(tokenRepository::findByIdForUpdate);
    }

    private boolean matchesCode(PasswordResetToken token, String code) {
        if (code == null || !code.matches("\\d{6}")) {
            return false;
        }
        if (token.getTokenHash() != null) {
            return passwordEncoder.matches(code, token.getTokenHash());
        }
        return code.equals(token.getToken());
    }

    private String generateCode() {
        return String.valueOf(CODE_RANDOM.nextInt(900000) + 100000);
    }
}
