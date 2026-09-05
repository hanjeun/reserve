package kr.it.reserve.member.service;

import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
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
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final int EXPIRES_MINUTES = 5;

    private final MemberRepository memberRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final EmailService emailService;
    private final BCryptPasswordEncoder passwordEncoder;
    private final PwnedPasswordChecker pwnedPasswordChecker;

    /**
     * 비밀번호 재설정 코드 발송
     * @return true = 실제 발송됨, false = 미가입/OAuth 계정 (프론트에서 안내 메시지용)
     */
    @Transactional
    public boolean sendResetCode(String email) {
        var memberOpt = memberRepository.findByEmailAndDeletedAtIsNull(email);
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
                .token(code)
                .expiresAt(LocalDateTime.now().plusMinutes(EXPIRES_MINUTES))
                .build();
        tokenRepository.save(token);
        emailService.sendPasswordResetEmail(email, code);
        log.info("Password reset code queued: memberId={}", member.getId());
        return true;
    }

    /**
     * 코드 검증.
     *
     * <h3>{@code noRollbackFor} 가 왜 필요한가 — 빼면 이 방어가 통째로 죽는다</h3>
     * {@code BusinessException} 은 {@code RuntimeException} 이라 스프링의 기본 규칙상
     * <b>트랜잭션이 롤백된다.</b> 실패 횟수를 올린 뒤 예외를 던지면 그 증가분까지 같이 사라져서
     * {@code attemptCount} 가 <b>영원히 0</b>에 머무른다 — 카운터가 있는 것처럼 보이지만
     * 실제로는 무제한 시도가 된다. 실패를 <b>기록해야</b> 하는 경로라 롤백 대상에서 뺀다.
     *
     * <p>이 메서드가 쓰는 것은 조회와 카운터·verified 플래그뿐이라, 롤백을 끄더라도
     * 어중간하게 남는 상태가 없다.
     */
    @Transactional(noRollbackFor = BusinessException.class)
    public void verifyCode(String email, String code) {
        PasswordResetToken token = tokenRepository.findTopByEmailOrderByIdDesc(email)
                .orElseThrow(() -> new MemberException("인증 코드가 존재하지 않습니다. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST));

        if (token.isExpired()) {
            throw new MemberException("인증 시간이 만료되었습니다. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }
        requireAttemptsLeft(token, email);

        if (!token.getToken().equals(code)) {
            token.recordFailedAttempt();
            log.warn("Password reset code mismatch: attempt={}/{}",
                    token.getAttemptCount(), PasswordResetToken.MAX_VERIFY_ATTEMPTS);
            throw new MemberException("인증 코드가 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        token.markVerified();
    }

    /**
     * 시도 횟수가 남았는지 확인. 소진됐으면 코드가 맞든 틀리든 거부한다.
     *
     * <p>메시지를 "재발송해주세요"로 두는 건 의도적이다 — 남은 횟수를 숫자로 알려주면
     * 공격자가 언제 리셋되는지 계산할 수 있고, 정상 사용자에게는 다음에 할 행동만 알려주면 된다.
     */
    private void requireAttemptsLeft(PasswordResetToken token, String email) {
        if (token.isAttemptExhausted()) {
            log.warn("Password reset code attempts exhausted");
            throw new MemberException(
                    "인증 시도 횟수를 초과했습니다. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * 비밀번호 재설정.
     *
     * <h3>여기에도 같은 카운터를 건다 — 빼면 우회로가 생긴다</h3>
     * 이 메서드는 {@code verified} 를 확인하기 <b>전에</b> 코드를 대조한다. 그래서
     * {@code verify-code} 를 건너뛰고 여기만 두드려도 코드를 맞힐 수 있었고, 더 나쁘게는
     * 응답 문구가 "잘못된 접근입니다"(코드 불일치) ↔ "코드 인증을 먼저 완료해주세요"(코드 일치)로
     * 갈려서 <b>맞았는지 여부를 알려주는 오라클</b>이 됐다.
     * 검증 경로가 둘이면 방어도 둘 다 걸어야 한다 — 하나만 막으면 막지 않은 쪽이 정문이 된다.
     *
     * <p>{@code noRollbackFor} 이유는 {@link #verifyCode} 주석 참고.
     * 여기서는 실패 경로에서만 롤백을 끄는 셈인데, 성공 경로는 예외를 던지지 않으므로
     * 비밀번호 변경·토큰 삭제는 평소대로 하나의 트랜잭션으로 커밋된다.
     */
    @Transactional(noRollbackFor = BusinessException.class)
    public void resetPassword(String email, String code, String newPassword) {
        PasswordResetToken token = tokenRepository.findTopByEmailOrderByIdDesc(email)
                .orElseThrow(() -> new MemberException("인증 코드가 존재하지 않습니다.", HttpStatus.BAD_REQUEST));

        if (token.isExpired()) {
            throw new MemberException("인증 시간이 만료되었습니다. 다시 시도해주세요.", HttpStatus.BAD_REQUEST);
        }
        requireAttemptsLeft(token, email);

        if (!token.getToken().equals(code)) {
            token.recordFailedAttempt();
            log.warn("Password reset code mismatch on reset: attempt={}/{}",
                    token.getAttemptCount(), PasswordResetToken.MAX_VERIFY_ATTEMPTS);
            throw new MemberException("잘못된 접근입니다.", HttpStatus.BAD_REQUEST);
        }
        if (!token.isVerified()) {
            throw new MemberException("코드 인증을 먼저 완료해주세요.", HttpStatus.BAD_REQUEST);
        }

        Member member = memberRepository.findActiveByEmailForUpdate(email)
                .orElseThrow(MemberException::notFound);

        // 재설정 경로에도 같은 검사를 건다. 여기를 빼면 "가입은 막히는데 재설정으로는 들어간다"는
        // 우회로가 생긴다 — 정책은 반드시 모든 진입로에 같이 걸려야 의미가 있다.
        // 토큰 검증을 먼저 통과한 뒤에 두었으므로 임의의 외부인이 이 경로로 외부 API 를 두드릴 수 없다.
        if (pwnedPasswordChecker.isPwned(newPassword)) {
            throw new MemberException(
                    "다른 사이트에서 유출된 적이 있는 비밀번호입니다. 다른 비밀번호를 사용해주세요.",
                    HttpStatus.BAD_REQUEST);
        }

        member.setPassword(passwordEncoder.encode(newPassword));
        tokenRepository.deleteByEmail(email);
        log.info("Password reset completed: memberId={}", member.getId());
    }

    private String generateCode() {
        SecureRandom random = new SecureRandom();
        return String.valueOf(random.nextInt(900000) + 100000);
    }
}
