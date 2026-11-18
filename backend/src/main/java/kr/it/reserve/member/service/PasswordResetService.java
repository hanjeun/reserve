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
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final int EXPIRES_MINUTES = 5;
    private static final String INVALID_CODE_MESSAGE = "인증 코드를 확인하지 못했어요. 코드를 다시 확인하거나 새로 요청해주세요.";
    private static final SecureRandom CODE_RANDOM = new SecureRandom();

    private final MemberRepository memberRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final EmailService emailService;
    private final BCryptPasswordEncoder passwordEncoder;
    private final PwnedPasswordChecker pwnedPasswordChecker;
    private final RefreshTokenRepository refreshTokenRepository;

    /** 이메일 로그인이 활성인 회원에게만 코드를 발급한다. */
    @Transactional
    public boolean sendResetCode(String email) {
        var memberOpt = findResettableMember(email);
        if (memberOpt.isEmpty()) {
            log.info("Password reset request not deliverable");
            return false;
        }

        Member member = memberOpt.get();
        String registeredEmail = member.getEmail();
        tokenRepository.deleteByEmail(registeredEmail);
        String code = generateCode();
        PasswordResetToken token = PasswordResetToken.builder()
                .email(registeredEmail)
                .token("HASHED")
                .tokenHash(passwordEncoder.encode(code))
                .expiresAt(LocalDateTime.now(Clock.systemDefaultZone()).plusMinutes(EXPIRES_MINUTES))
                .build();
        tokenRepository.save(token);
        emailService.sendPasswordResetEmail(registeredEmail, code);
        log.info("Password reset code queued: memberId={}", member.getId());
        return true;
    }

    /** 실패 횟수 증가가 예외로 롤백되지 않도록 noRollbackFor를 유지한다. */
    @Transactional(noRollbackFor = BusinessException.class)
    public Instant verifyCode(String email, String code) {
        PasswordResetToken token = requireValidCode(email, code, findResettableMember(email));
        token.markVerified();
        return token.getExpiresAt().atZone(ZoneId.systemDefault()).toInstant();
    }

    /** 코드 검증을 건너뛰는 우회를 막기 위해 재설정 경로에도 대조 횟수 제한을 적용한다. 실패 횟수는 롤백하지 않는다. */
    @Transactional(noRollbackFor = BusinessException.class)
    public void resetPassword(String email, String code, String newPassword) {
        // 재발송·검증과 같은 member → token 잠금 순서로 중복 소비를 막는다.
        var memberOpt = findResettableMember(email);
        PasswordResetToken token = requireValidCode(email, code, memberOpt);
        if (!token.isVerified()) {
            throw new InvalidCode();
        }

        Member member = memberOpt.orElseThrow();

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
        member.setSecurityContactEmail(member.getEmail());
        member.rotateAuthVersion();
        refreshTokenRepository.deleteByMemberId(member.getId());
        tokenRepository.deleteByEmail(member.getEmail());
        log.info("Password reset completed: memberId={}", member.getId());
    }

    private Optional<PasswordResetToken> findLatestTokenForUpdate(String email) {
        return tokenRepository.findIdsByEmail(email).stream()
                .findFirst()
                .flatMap(tokenRepository::findByIdForUpdate);
    }

    private Optional<Member> findResettableMember(String email) {
        // DB 정렬 규칙에서 같은 값으로 취급하는 다른 주소로는 발급하거나 검증하지 않는다.
        return memberRepository.findActiveByEmailForUpdate(email)
                .filter(member -> !member.isAccountProtected() && member.getPassword() != null
                        && member.getEmail().toLowerCase(Locale.ROOT).equals(email));
    }

    private PasswordResetToken requireValidCode(String email, String code, Optional<Member> member) {
        String registeredEmail = member.map(Member::getEmail).orElse(email);
        PasswordResetToken token = findLatestTokenForUpdate(registeredEmail).orElse(null);
        boolean usable = member.isPresent() && token != null && !token.isExpired() && !token.isAttemptExhausted();
        String hash = usable ? token.getTokenHash() : null;
        boolean formatted = code != null && code.matches("[0-9]{6}");

        // 코드가 없거나 사용할 수 없어도 대조 비용과 실패 응답을 맞춘다.
        boolean hashMatches = passwordEncoder.matches(formatted ? code : "000000",
                hash != null ? hash : PasswordPolicy.DUMMY_BCRYPT_HASH);
        if (usable) {
            boolean matches = hash != null ? hashMatches : token.getToken().equals(code);
            if (formatted && matches) {
                return token;
            }
            token.recordFailedAttempt();
        }
        throw new InvalidCode();
    }

    public static final class InvalidCode extends MemberException {
        private InvalidCode() {
            super(INVALID_CODE_MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    private String generateCode() {
        return String.valueOf(CODE_RANDOM.nextInt(900000) + 100000);
    }
}
