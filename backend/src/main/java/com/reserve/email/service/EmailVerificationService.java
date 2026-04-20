package com.reserve.email.service;

import com.reserve.email.entity.EmailVerification;
import com.reserve.email.repository.EmailVerificationRepository;
import com.reserve.global.error.EmailException; // 추가
import com.reserve.member.repository.MemberRepository;
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
            // [수정] 이미 존재하는 계정이므로 409 Conflict
            throw new EmailException("이미 가입된 이메일입니다.", HttpStatus.CONFLICT);
        }

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

        log.info("인증 코드 발송: email={}", email);
    }

    @Transactional
    public boolean verifyCode(String email, String code) {
        EmailVerification verification = verificationRepository
                .findTopByEmailOrderByCreatedAtDesc(email)
                .orElseThrow(() -> new EmailException("인증 요청 내역을 찾을 수 없습니다. 다시 요청해주세요.", HttpStatus.NOT_FOUND));

        if (verification.isExpired()) {
            // [수정] 만료된 자원이므로 410 Gone 또는 400 사용
            throw new EmailException("인증 시간이 만료되었습니다. 다시 요청해주세요.", HttpStatus.GONE);
        }

        if (!verification.getVerificationCode().equals(code)) {
            // [수정] 잘못된 입력값이므로 400 Bad Request
            throw new EmailException("인증 코드가 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }

        verification.setVerified(true);
        verificationRepository.save(verification);

        log.info("이메일 인증 완료: email={}", email);
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