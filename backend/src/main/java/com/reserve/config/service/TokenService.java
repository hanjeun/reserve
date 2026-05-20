package com.reserve.config.service;

import com.reserve.config.jwt.TokenProvider;
import com.reserve.global.error.AuthException;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import com.reserve.member.service.MemberService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@RequiredArgsConstructor
@Service
public class TokenService {

    private final TokenProvider tokenProvider;
    private final RefreshTokenService refreshTokenService;
    private final MemberService memberService;
    private final MemberRepository memberRepository;

    @Transactional
    public String createNewAccessToken(String refreshToken) {
        log.info("========== Access Token refresh started ==========");

        // 1. 토큰 유효성 검사
        if (!tokenProvider.validToken(refreshToken)) {
            log.warn("Refresh token signature verification failed");
            throw new AuthException("리프레시 토큰이 유효하지 않습니다. 다시 로그인해주세요.");
        }

        // 2. DB 레코드 조회 및 만료 확인
        var savedToken = refreshTokenService.findByRefreshToken(refreshToken);
        if (savedToken.isExpired()) {
            throw new AuthException("만료된 리프레시 토큰입니다. 다시 로그인해주세요.");
        }

        // 3. 회원 조회
        Member member = memberService.findById(savedToken.getMemberId());

        // 4. 정지 기간 만료 시 자동 해제 (DB 반영)
        if (member.isSuspensionExpired()) {
            log.info("Suspension expired, auto-lifting for memberId={}", member.getId());
            member.unban();
            memberRepository.save(member);
        }

        // 5. 정지 중이어도 토큰 재발급 허용 — 기존 예약 조회 등 허용
        //    예약 생성 등 특정 기능 차단은 서비스 레이어에서 처리

        // 6. 신규 Access Token 생성
        String newAccessToken = tokenProvider.generateAccessToken(member);
        log.info("========== Access Token refresh completed for memberId={} ==========", member.getId());
        return newAccessToken;
    }
}
