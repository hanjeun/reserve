package com.reserve.config.service;

import com.reserve.config.jwt.TokenProvider;
import com.reserve.global.error.AuthException;
import com.reserve.member.entity.Member;
import com.reserve.member.service.MemberService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@RequiredArgsConstructor
@Service
public class TokenService {

    private final TokenProvider tokenProvider;
    private final RefreshTokenService refreshTokenService;
    private final MemberService memberService;

    public String createNewAccessToken(String refreshToken) {
        log.info("========== 🔄 Access Token 재발급 시작 ==========");

        // 1. 토큰 유효성 검사
        if (!tokenProvider.validToken(refreshToken)) {
            log.error("❌ Refresh Token 검증 실패");
            throw new AuthException("유효하지 않은 리프레시 토큰입니다.");
        }

        // 2. 사용자 조회
        Long userId = refreshTokenService.findByRefreshToken(refreshToken).getMemberId();
        Member member = memberService.findById(userId);

        log.info("✅ 사용자 확인: {}", member.getEmail());

        // 3. 신규 토큰 생성
        String newAccessToken = tokenProvider.generateAccessToken(member);
        log.info("========== ✅ Access Token 재발급 완료 ==========");

        return newAccessToken;
    }
}