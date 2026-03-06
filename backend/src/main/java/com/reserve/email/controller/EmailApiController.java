package com.reserve.email.controller;

import com.reserve.email.service.EmailVerificationService;
import com.reserve.global.error.EmailException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/email")
@RequiredArgsConstructor
public class EmailApiController {

    private final EmailVerificationService verificationService;

    /**
     * 인증 코드 발송
     */
    @PostMapping("/send-code")
    public ResponseEntity<Map<String, Object>> sendVerificationCode(@RequestBody Map<String, String> request) {
        String email = request.get("email");

        if (email == null || email.isBlank()) {
            throw new EmailException("이메일을 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 이메일 형식 검증 (정규식)
        if (!email.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
            throw new EmailException("올바른 이메일 형식이 아닙니다.", HttpStatus.BAD_REQUEST);
        }

        verificationService.sendVerificationCode(email);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "인증 코드가 발송되었습니다. 이메일을 확인해주세요."
        ));
    }

    /**
     * 인증 코드 검증
     */
    @PostMapping("/verify-code")
    public ResponseEntity<Map<String, Object>> verifyCode(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String code = request.get("code");

        if (email == null || email.isBlank() || code == null || code.isBlank()) {
            throw new EmailException("이메일과 인증 코드를 모두 입력해주세요.", HttpStatus.BAD_REQUEST);
        }

        // 내부 로직에서 검증 실패 시 EmailException을 던지도록 Service도 수정해야 함
        verificationService.verifyCode(email, code);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "이메일 인증이 완료되었습니다."
        ));
    }

    /**
     * 이메일 인증 상태 확인
     */
    @GetMapping("/check-verified")
    public ResponseEntity<Map<String, Object>> checkVerified(@RequestParam String email) {
        boolean verified = verificationService.isEmailVerified(email);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "verified", verified
        ));
    }
}