package kr.it.reserve.config.jwt;

import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Date;
import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Service
public class TokenProvider {

    private final JwtProperties jwtProperties;
    private final MemberRepository memberRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private SecretKey cachedSecretKey;

    @PostConstruct
    public void init() {
        this.cachedSecretKey = Keys.hmacShaKeyFor(
                jwtProperties.getSecretKey().getBytes(StandardCharsets.UTF_8)
        );
    }

    public String generateAccessToken(Member member) {
        return generateToken(member, jwtProperties.getAccessTokenExpiration());
    }

    /**
     * Refresh Token 발급 — 기기당 저장 방식
     * - 한 계정당 최대 5개 유지, 초과 시 가장 오래된 것부터 삭제
     * - @Transactional로 race condition 방지
     */
    @org.springframework.transaction.annotation.Transactional
    public String generateRefreshToken(Member member) {
        Duration expiration = jwtProperties.getRefreshTokenExpiration();
        String token = generateToken(member, expiration);
        LocalDateTime expiresAt = LocalDateTime.now().plus(expiration);

        // 새 토큰 저장
        refreshTokenRepository.save(new RefreshToken(member.getId(), token, expiresAt));

        // 한 계정당 최대 5개 유지 — 트랜잭션 내에서 한 번에 체크
        List<RefreshToken> tokens = refreshTokenRepository.findByMemberId(member.getId());
        if (tokens.size() > 5) {
            tokens.stream()
                    .sorted(Comparator.comparing(RefreshToken::getExpiresAt))
                    .limit(tokens.size() - 5)
                    .forEach(refreshTokenRepository::delete);
            refreshTokenRepository.flush(); // 즉시 반영
        }

        log.info("Refresh token issued: memberId={}, totalTokens={}", member.getId(), Math.min(tokens.size(), 5));
        return token;
    }

    public String generateToken(Member member, Duration expiredAt) {
        Date now = new Date();
        return makeToken(member, new Date(now.getTime() + expiredAt.toMillis()));
    }

    private String makeToken(Member member, Date expiry) {
        Date now = new Date();
        // jjwt 0.13 API — 0.12에서 set* 계열이 전부 이름을 바꿨고 parserBuilder()는 삭제됐다.
        // (setHeaderParam → header().add(), setIssuer → issuer, setSubject → subject 등)
        return Jwts.builder()
                .header().add("typ", "JWT").and()
                .issuer(jwtProperties.getIssuer())
                .issuedAt(now)
                .expiration(expiry)
                .subject(member.getEmail())
                .claim("id", member.getId())
                .claim("role", member.getRole().name())
                .signWith(cachedSecretKey)
                .compact();
    }

    public boolean validToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(cachedSecretKey)
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            log.debug("Invalid token: errorType={}", e.getClass().getSimpleName());
            return false;
        }
    }

    public Long getUserId(String token) {
        return getClaims(token).get("id", Long.class);
    }

    /**
     * 토큰 서명만 맞는 것으로 인증하지 않고 현재 활성 회원 행을 확인한다.
     * 탈퇴·익명화 직후 기존 access token이 만료될 때까지 살아 있는 공백을 막는 관문이다.
     */
    public Member getActiveMemberFromToken(String token) {
        Long userId = getUserId(token);
        Member member = memberRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new AuthException("토큰과 일치하는 사용자를 찾을 수 없습니다."));
        if (member.isSuspended()) {
            throw new AuthException("현재 인증할 수 없는 사용자입니다.");
        }
        return member;
    }

    public Member getMemberFromToken(String token) {
        return getActiveMemberFromToken(token);
    }

    private Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(cachedSecretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
