package kr.it.reserve.member.service;

import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.MemberException;
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

    /**
     * 비밀번호 재설정 코드 발송
     * @return true = 실제 발송됨, false = 미가입/OAuth 계정 (프론트에서 안내 메시지용)
     */
    @Transactional
    public boolean sendResetCode(String email) {
        var memberOpt = memberRepository.findByEmail(email);
        if (memberOpt.isEmpty()) {
            log.info("Password reset requested: unregistered email={}", email);
            return false;
        }
        var member = memberOpt.get();
        if (member.getPassword() == null) {
            // OAuth 전용 계정 (Google/Naver/Kakao) → 로컬 비밀번호 없음
            log.info("Password reset requested: OAuth-only account={}", email);
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
        log.info("Password reset code sent: email={}", email);
        return true;
    }

    /**
     * 코드 검증
     */
    @Transactional
    public void verifyCode(String email, String code) {
        PasswordResetToken token = tokenRepository.findTopByEmailOrderByIdDesc(email)
                .orElseThrow(() -> new MemberException("인증 코드가 존재하지 않습니다. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST));

        if (token.isExpired()) {
            throw new MemberException("인증 시간이 만료되었습니다. 코드를 재발송해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (!token.getToken().equals(code)) {
            throw new MemberException("인증 코드가 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        token.markVerified();
    }

    /**
     * 비밀번호 재설정
     */
    @Transactional
    public void resetPassword(String email, String code, String newPassword) {
        PasswordResetToken token = tokenRepository.findTopByEmailOrderByIdDesc(email)
                .orElseThrow(() -> new MemberException("인증 코드가 존재하지 않습니다.", HttpStatus.BAD_REQUEST));

        if (token.isExpired()) {
            throw new MemberException("인증 시간이 만료되었습니다. 다시 시도해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (!token.getToken().equals(code)) {
            throw new MemberException("잘못된 접근입니다.", HttpStatus.BAD_REQUEST);
        }
        if (!token.isVerified()) {
            throw new MemberException("코드 인증을 먼저 완료해주세요.", HttpStatus.BAD_REQUEST);
        }

        Member member = memberRepository.findByEmail(email)
                .orElseThrow(MemberException::notFound);

        member.setPassword(passwordEncoder.encode(newPassword));
        tokenRepository.deleteByEmail(email);
        log.info("Password reset completed: email={}", email);
    }

    private String generateCode() {
        SecureRandom random = new SecureRandom();
        return String.valueOf(random.nextInt(900000) + 100000);
    }
}
