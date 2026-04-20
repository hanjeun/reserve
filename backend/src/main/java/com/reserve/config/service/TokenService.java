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
        log.info("========== Access Token 재발급 시작 ==========");

        // 1. 토큰 유효성 검사 (서명 검증)
        if (!tokenProvider.validToken(refreshToken)) {
            // JWT 서명 검증 실패 = 키가 다르거나 토큰이 변조됨
            // 쿠키 자체는 있지만 현재 서버 키로 검증 불가 (재배포 후 키 변경 등)
            log.warn("⚠️ Refresh Token JWT 서명 검증 실패 (키 불일치 또는 만료된 서명)");
            throw new AuthException("리프레시 토큰이 유효하지 않습니다. 다시 로그인해주세요.");
        }

        // 2. DB 레코드 조회 및 만료 확인
        var savedToken = refreshTokenService.findByRefreshToken(refreshToken);
        if (savedToken.isExpired()) {
            throw new AuthException("만료된 리프레시 토큰입니다. 다시 로그인해주세요.");
        }
        Long userId = savedToken.getMemberId();
        Member member = memberService.findById(userId);

        log.info("사용자 확인: {}", member.getEmail());

        // 3. 신규 토큰 생성
        String newAccessToken = tokenProvider.generateAccessToken(member);
        log.info("========== Access Token 재발급 완료 ==========");

        return newAccessToken;
    }
}