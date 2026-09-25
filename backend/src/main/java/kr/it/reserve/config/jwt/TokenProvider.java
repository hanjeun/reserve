package kr.it.reserve.config.jwt;

import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
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
import java.util.UUID;

@Slf4j
@RequiredArgsConstructor
@Service
public class TokenProvider {

    public enum Purpose { ACCESS, REFRESH }

    /** refresh 토큰을 열어 본 결과. 거절 사유 로그가 만료와 위조를 구분할 수 있게 나눈다. */
    public enum RefreshTokenState { VALID, EXPIRED, INVALID, NOT_REFRESH }

    /**
     * @param memberId    서명이 확인된 토큰의 회원 id(만료 포함). INVALID이면 null
     * @param authVersion claim이 없는 구버전 토큰은 0
     */
    public record RefreshTokenInspection(RefreshTokenState state, Long memberId, int authVersion) { }

    private static final String PURPOSE_CLAIM = "purpose";
    private static final String AUTH_VERSION_CLAIM = "authVersion";

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
        return generateToken(member, jwtProperties.getAccessTokenExpiration(), Purpose.ACCESS);
    }

    /**
     * Refresh Token 발급 — 기기당 저장 방식
     * - 한 계정당 최대 5개 유지, 초과 시 가장 오래된 것부터 삭제
     * - @Transactional로 race condition 방지
     */
    @org.springframework.transaction.annotation.Transactional
    public String generateRefreshToken(Member member) {
        Duration expiration = jwtProperties.getRefreshTokenExpiration();
        String token = createRefreshJwt(member);
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

    /** 저장 없이 refresh JWT 문자열만 만든다. 회전(TokenService.refresh)은 기존 행을 갱신하므로 새 행을 만들면 안 된다. */
    public String createRefreshJwt(Member member) {
        return generateToken(member, jwtProperties.getRefreshTokenExpiration(), Purpose.REFRESH);
    }

    private String generateToken(Member member, Duration expiredAt, Purpose purpose) {
        Date now = new Date();
        return makeToken(member, new Date(now.getTime() + expiredAt.toMillis()), purpose);
    }

    private String makeToken(Member member, Date expiry, Purpose purpose) {
        Date now = new Date();
        // jjwt 0.13 API — 0.12에서 set* 계열이 전부 이름을 바꿨고 parserBuilder()는 삭제됐다.
        // (setHeaderParam → header().add(), setIssuer → issuer, setSubject → subject 등)
        return Jwts.builder()
                .header().add("typ", "JWT").and()
                // jti: iat가 초 단위라 같은 초에 같은 회원에게 발급한 토큰은 문자열까지 같아진다.
                //      refresh 회전은 토큰 문자열로 행을 찾고 직전 토큰을 해시로 구분하므로 매번 달라야 한다.
                .id(UUID.randomUUID().toString())
                .issuer(jwtProperties.getIssuer())
                .issuedAt(now)
                .expiration(expiry)
                .subject(member.getEmail())
                .claim("id", member.getId())
                .claim("role", member.getRole().name())
                .claim(AUTH_VERSION_CLAIM, member.getAuthVersion())
                .claim(PURPOSE_CLAIM, purpose.name())
                .signWith(cachedSecretKey)
                .compact();
    }

    /**
     * Refresh 전용 관문. 무클레임 토큰은 배포 전에 발급된 refresh와의 짧은 호환 기간에만
     * 허용하며, 실제 사용 가능 여부는 곧바로 refresh_token 테이블에서 다시 확인한다.
     */
    public boolean isRefreshToken(String token) {
        String purpose = getClaims(token).get(PURPOSE_CLAIM, String.class);
        return purpose == null || Purpose.REFRESH.name().equals(purpose);
    }

    /**
     * refresh 요청 전용 검사. validToken()과 달리 만료와 서명 불일치를 구분한다.
     * jjwt는 서명을 먼저 확인한 뒤 exp를 보므로, EXPIRED의 memberId는 서명이 확인된 값이다.
     */
    public RefreshTokenInspection inspectRefreshToken(String token) {
        Claims claims;
        try {
            claims = getClaims(token);
        } catch (ExpiredJwtException e) {
            return new RefreshTokenInspection(RefreshTokenState.EXPIRED, readMemberId(e.getClaims()), 0);
        } catch (JwtException | IllegalArgumentException e) {
            return new RefreshTokenInspection(RefreshTokenState.INVALID, null, 0);
        }
        Long memberId = readMemberId(claims);
        String purpose = claims.get(PURPOSE_CLAIM, String.class);
        if (purpose != null && !Purpose.REFRESH.name().equals(purpose)) {
            return new RefreshTokenInspection(RefreshTokenState.NOT_REFRESH, memberId, 0);
        }
        if (memberId == null) {
            return new RefreshTokenInspection(RefreshTokenState.INVALID, null, 0);
        }
        return new RefreshTokenInspection(RefreshTokenState.VALID, memberId, readAuthVersion(claims));
    }

    private static Long readMemberId(Claims claims) {
        Object raw = claims == null ? null : claims.get("id");
        return raw instanceof Number number ? number.longValue() : null;
    }

    private static int readAuthVersion(Claims claims) {
        Object raw = claims.get(AUTH_VERSION_CLAIM);
        return raw instanceof Number number ? number.intValue() : 0;
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
        Claims claims = getClaims(token);
        // Access와 refresh가 같은 키로 서명되므로 서명·만료만 확인해서는 refresh를 Bearer로
        // 사용할 수 있다. 무클레임 구버전 access는 짧은 access 수명 뒤 /refresh로 교체된다.
        if (!Purpose.ACCESS.name().equals(claims.get(PURPOSE_CLAIM, String.class))) {
            throw new AuthException("접근 토큰이 아닙니다. 다시 로그인해주세요.");
        }
        Long userId = claims.get("id", Long.class);
        Member member = memberRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new AuthException("토큰과 일치하는 사용자를 찾을 수 없습니다."));
        if (member.isSuspended()) {
            throw new AuthException("현재 인증할 수 없는 사용자입니다.");
        }
        // authVersion claim이 없던 구버전 JWT는 0으로 읽어 무중단 배포한다. 비밀번호를 한 번
        // 바꾸면 회원 행이 1 이상이 되어 그 이전 access JWT도 즉시 전부 거부된다.
        if (readAuthVersion(claims) != member.getAuthVersion()) {
            throw new AuthException("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
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
