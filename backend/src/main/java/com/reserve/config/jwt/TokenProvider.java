package com.reserve.config.jwt;

import com.reserve.config.jwt.entity.RefreshToken;
import com.reserve.config.jwt.repository.RefreshTokenRepository;
import com.reserve.global.error.AuthException;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import com.reserve.member.repository.MemberRepository;
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

    public String generateRefreshToken(Member member) {
        Duration expiration = jwtProperties.getRefreshTokenExpiration();
        String token = generateToken(member, expiration);
        LocalDateTime expiresAt = LocalDateTime.now().plus(expiration);

        // upsert: 기존 레코드가 있으면 토큰값만 갱신, 없으면 새로 생성
        List<RefreshToken> existingTokens = refreshTokenRepository.findByMemberId(member.getId());
        if (!existingTokens.isEmpty()) {
            existingTokens.get(0).update(token, expiresAt);
            // 혹시 중복 레코드가 있으면 나머지 삭제
            if (existingTokens.size() > 1) {
                refreshTokenRepository.deleteAll(existingTokens.subList(1, existingTokens.size()));
            }
            refreshTokenRepository.save(existingTokens.get(0));
        } else {
            refreshTokenRepository.save(new RefreshToken(member.getId(), token, expiresAt));
        }

        return token;
    }

    public String generateToken(Member member, Duration expiredAt) {
        Date now = new Date();
        return makeToken(member, new Date(now.getTime() + expiredAt.toMillis()));
    }

    private String makeToken(Member member, Date expiry) {
        Date now = new Date();
        return Jwts.builder()
                .setHeaderParam("typ", "JWT")
                .setIssuer(jwtProperties.getIssuer())
                .setIssuedAt(now)
                .setExpiration(expiry)
                .setSubject(member.getEmail())
                .claim("id", member.getId())
                .claim("role", member.getRole().name())
                .signWith(cachedSecretKey)
                .compact();
    }

    public boolean validToken(String token) {
        try {
            Jwts.parserBuilder()
                    .setSigningKey(cachedSecretKey)
                    .build()
                    .parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            log.debug("유효하지 않은 토큰입니다: {}", e.getMessage());
            return false;
        }
    }

    public Long getUserId(String token) {
        return getClaims(token).get("id", Long.class);
    }

    /**
     * JWT 클레임만으로 Member 객체 생성 (DB 조회 없음)
     * 필터에서 사용 - id, role만 필요하므로 DB 조회 불필요
     */
    public Member getMemberFromTokenWithoutDB(String token) {
        Claims claims = getClaims(token);
        Long id = claims.get("id", Long.class);
        Role role = Role.valueOf(claims.get("role", String.class));
        String email = claims.getSubject();
        return Member.builder()
                .id(id)
                .email(email)
                .role(role)
                .build();
    }

    /**
     * DB에서 최신 Member 조회 (프로필 이미지 등 최신 정보 필요 시)
     */
    public Member getMemberFromToken(String token) {
        Long userId = getUserId(token);
        return memberRepository.findById(userId)
                .orElseThrow(() -> new AuthException("토큰과 일치하는 사용자를 찾을 수 없습니다."));
    }

    private Claims getClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(cachedSecretKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}