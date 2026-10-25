package kr.it.reserve.config.jwt;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.LoginSessionAuthentication;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.time.*;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** JWT 검증과 회원→기기 세션 순서의 발급 경계를 관리한다. */
@Slf4j
@RequiredArgsConstructor
@Service
public class TokenProvider {
    public enum Purpose { ACCESS, REFRESH }
    public enum RefreshTokenState { VALID, EXPIRED, INVALID, NOT_REFRESH, LEGACY }
    public record RefreshTokenInspection(RefreshTokenState state, Long memberId, int authVersion,
            LocalDateTime oauthAuthenticatedAt, String loginMethod, String sessionId, long rotationVersion,
            String jti, LocalDateTime absoluteExpiresAt) {
        public RefreshTokenInspection(RefreshTokenState state, Long memberId, int authVersion) {
            this(state, memberId, authVersion, null, null, null, -1, null, null);
        }
        public RefreshTokenInspection(RefreshTokenState state, Long memberId, int authVersion, LocalDateTime at) {
            this(state, memberId, authVersion, at, null, null, -1, null, null);
        }
        public RefreshTokenInspection(RefreshTokenState state, Long memberId, int authVersion, LocalDateTime at, String method) {
            this(state, memberId, authVersion, at, method, null, -1, null, null);
        }
    }
    public record IssuedSession(String accessToken, String refreshToken, Duration refreshMaxAge) {
        @Override public String toString() { return "IssuedSession[credentials=redacted]"; }
    }
    /** 검증된 문맥만 보관하고 인증 상세에 원문 토큰을 남기지 않는다. */
    public record VerifiedAuthentication(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod,
                                         String sessionId) { }

    private static final String PURPOSE = "purpose";
    private static final String AUTH_VERSION = "authVersion";
    private static final String OAUTH_AT = "oauth_auth_at";
    private static final String METHOD = "login_method";
    private static final String SID = "sid";
    private static final String GENERATION = "rgen";
    private static final String ABSOLUTE_EXPIRY = "session_exp";
    public static final String RELOGIN_AFTER_UPDATE = "로그인 보안이 업데이트됐어요. 다시 로그인해주세요.";

    private final JwtProperties jwtProperties;
    private final MemberRepository memberRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    @PersistenceContext private EntityManager entityManager;
    private SecretKey cachedSecretKey;
    private Map<String, SecretKey> verificationKeys = Map.of();
    private JwtParser parser;
    private Clock clock = Clock.systemUTC();

    @PostConstruct
    public void init() {
        cachedSecretKey = Keys.hmacShaKeyFor(jwtProperties.getSecretKey().getBytes(StandardCharsets.UTF_8));
        Map<String, SecretKey> keys = new HashMap<>();
        jwtProperties.getSigningKeys().forEach((id, value) ->
                keys.put(id, Keys.hmacShaKeyFor(value.getBytes(StandardCharsets.UTF_8))));
        verificationKeys = Map.copyOf(keys);
        parser = Jwts.parser().keyLocator(new LocatorAdapter<Key>() {
            @Override protected Key locate(JwsHeader header) {
                if (!"HS512".equals(header.getAlgorithm())) throw new JwtException("Unsupported JWT algorithm");
                return signingKey(header.getKeyId());
            }
        }).clock(() -> Date.from(clock.instant())).requireIssuer(jwtProperties.getIssuer())
                .sig().clear().add(Jwts.SIG.HS512).and().build();
    }

    /** 액세스·리프레시 토큰을 같은 잠금 세션에서 발급한다. */
    @Transactional
    public IssuedSession issueSession(Member authenticated, LocalDateTime oauthAuthenticatedAt) {
        oauthAuthenticatedAt = oauthAuthenticatedAt == null ? null : oauthAuthenticatedAt.truncatedTo(ChronoUnit.MILLIS);
        int expectedVersion = authenticated.getAuthVersion();
        String method = loginMethod(authenticated, oauthAuthenticatedAt);
        AuthProvider provider = authenticated.getProvider();
        String providerId = authenticated.getProviderId();
        Member current = memberRepository.findActiveByIdForUpdate(authenticated.getId())
                .orElseThrow(TokenProvider::expired);
        entityManager.flush();
        entityManager.refresh(current, LockModeType.PESSIMISTIC_WRITE);
        if (current.isDeleted() || current.isSuspended() || current.getAuthVersion() != expectedVersion
                || !isLoginSessionCurrent(current, oauthAuthenticatedAt, method)
                || "OAUTH".equals(method) && (current.getProvider() != provider
                    || !Objects.equals(current.getProviderId(), providerId))) throw expired();

        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime absolute = now.plus(jwtProperties.getAbsoluteSessionLifetime());
        LocalDateTime expires = earlier(now.plus(jwtProperties.getRefreshTokenExpiration()), absolute);
        RefreshToken row = new RefreshToken(current.getId(), UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                jwtProperties.getActiveKeyId(), now, expires, absolute, current.getAuthVersion(), oauthAuthenticatedAt, method);
        String refresh = reconstructRefreshToken(row);
        row.bindRefreshToken(refresh);
        refreshTokenRepository.save(row);
        List<RefreshToken> devices = refreshTokenRepository.findByMemberIdForUpdate(current.getId());
        for (int i = 0; i < devices.size() - 5; i++) refreshTokenRepository.delete(devices.get(i));
        refreshTokenRepository.flush();
        return new IssuedSession(accessForSession(row), refresh, Duration.between(now, expires));
    }

    @Transactional
    public String generateRefreshToken(Member member) {
        return issueSession(member, oauthAuthenticationAt(member)).refreshToken();
    }
    @Transactional
    public String generateRefreshToken(Member member, LocalDateTime at) { return issueSession(member, at).refreshToken(); }

    /** 호환 발급 함수의 토큰은 세션을 등록하지 않는다. 로그인은 issueSession을 사용해야 한다. */
    public String generateAccessToken(Member member) { return generateAccessToken(member, oauthAuthenticationAt(member)); }
    public String generateAccessToken(Member member, LocalDateTime at) { return generateAccessToken(member, at, loginMethod(member, at)); }
    public String generateAccessToken(Member member, LocalDateTime at, String method) {
        return accessForSession(detachedSession(member, at, method));
    }
    public String createRefreshJwt(Member member) { return createRefreshJwt(member, oauthAuthenticationAt(member)); }
    public String createRefreshJwt(Member member, LocalDateTime at) { return createRefreshJwt(member, at, loginMethod(member, at)); }
    public String createRefreshJwt(Member member, LocalDateTime at, String method) {
        return reconstructRefreshToken(detachedSession(member, at, method));
    }
    private RefreshToken detachedSession(Member member, LocalDateTime at, String method) {
        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime absolute = now.plus(jwtProperties.getAbsoluteSessionLifetime());
        return new RefreshToken(member.getId(), UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                jwtProperties.getActiveKeyId(), now, earlier(now.plus(jwtProperties.getRefreshTokenExpiration()), absolute),
                absolute, member.getAuthVersion(), at, method == null ? loginMethod(member, at) : method);
    }

    /** 호출부가 회원→세션 잠금을 보유해야 한다. 저장된 메타데이터로 현재 리프레시 토큰을 동일하게 재구성한다. */
    public IssuedSession rotateSession(RefreshToken row) {
        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime expires = earlier(now.plus(jwtProperties.getRefreshTokenExpiration()), row.getAbsoluteExpiresAt());
        String jti = UUID.randomUUID().toString();
        String keyId = jwtProperties.getActiveKeyId();
        String refresh = makeToken(row, Purpose.REFRESH, jti, now, expires, keyId, row.getRotationVersion() + 1);
        row.rotate(refresh, jti, keyId, now, expires);
        return new IssuedSession(accessForSession(row), refresh, Duration.between(now, expires));
    }
    public IssuedSession currentSessionTokens(RefreshToken row) {
        String refresh = reconstructRefreshToken(row);
        if (!row.isCurrentToken(refresh)) throw new JwtException("Refresh reconstruction does not match stored hash");
        return new IssuedSession(accessForSession(row), refresh, Duration.between(utcNow(), row.getExpiresAt()));
    }
    private String reconstructRefreshToken(RefreshToken row) {
        return makeToken(row, Purpose.REFRESH, row.getRefreshJti(), row.getIssuedAt(), row.getExpiresAt(),
                row.getSigningKeyId(), row.getRotationVersion());
    }
    public String accessForSession(RefreshToken row) {
        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime expires = earlier(now.plus(jwtProperties.getAccessTokenExpiration()),
                earlier(row.getExpiresAt(), row.getAbsoluteExpiresAt()));
        return makeToken(row, Purpose.ACCESS, UUID.randomUUID().toString(), now, expires,
                jwtProperties.getActiveKeyId(), null);
    }

    /** 갱신 유예 응답이 프로필 변경에 흔들리지 않도록 회원 ID와 클레임 순서를 고정한다. */
    private String makeToken(RefreshToken row, Purpose purpose, String jti, LocalDateTime issuedAt,
                             LocalDateTime expires, String keyId, Long generation) {
        JwtBuilder builder = Jwts.builder().header().type("JWT").and();
        if (keyId != null) builder.header().keyId(keyId).and();
        builder.id(jti).issuer(jwtProperties.getIssuer())
                .audience().add(audience(purpose)).and()
                .issuedAt(date(issuedAt)).expiration(date(expires)).subject(row.getMemberId().toString())
                .claim("id", row.getMemberId()).claim(AUTH_VERSION, row.getAuthVersion())
                .claim(METHOD, row.getLoginMethod())
                .claim(OAUTH_AT, row.getOauthAuthenticatedAt() == null ? null
                        : row.getOauthAuthenticatedAt().toInstant(ZoneOffset.UTC).toEpochMilli())
                .claim(PURPOSE, purpose.name()).claim(SID, row.getSessionId())
                .claim(ABSOLUTE_EXPIRY, row.getAbsoluteExpiresAt().toEpochSecond(ZoneOffset.UTC));
        if (generation != null) builder.claim(GENERATION, generation);
        return builder.signWith(signingKey(keyId), Jwts.SIG.HS512).compact();
    }

    public boolean isRefreshToken(String token) { return inspectRefreshToken(token).state() == RefreshTokenState.VALID; }

    public RefreshTokenInspection inspectRefreshToken(String token) {
        Claims claims;
        boolean expired = false;
        try { claims = getClaims(token); }
        catch (ExpiredJwtException exception) { claims = exception.getClaims(); expired = true; }
        catch (JwtException | IllegalArgumentException exception) { return invalidInspection(); }
        try {
            Long memberId = readMemberId(claims);
            if (!Purpose.REFRESH.name().equals(claims.get(PURPOSE, String.class))) {
                return new RefreshTokenInspection(RefreshTokenState.NOT_REFRESH, memberId, 0);
            }
            if (claims.get(SID) == null) return new RefreshTokenInspection(RefreshTokenState.LEGACY, memberId, 0);
            validateSessionClaims(claims, Purpose.REFRESH);
            Object generation = claims.get(GENERATION);
            if (!(generation instanceof Integer || generation instanceof Long) || ((Number) generation).longValue() < 0) {
                throw new JwtException("Invalid refresh generation");
            }
            return new RefreshTokenInspection(expired ? RefreshTokenState.EXPIRED : RefreshTokenState.VALID,
                    memberId, readAuthVersion(claims), readOAuthAuthenticationAt(claims), claims.get(METHOD, String.class),
                    claims.get(SID, String.class), ((Number) generation).longValue(), claims.getId(),
                    readAbsoluteExpiry(claims));
        } catch (JwtException | IllegalArgumentException exception) { return invalidInspection(); }
    }

    /** 서명 검증과 현재 회원·세션 결합 조회를 한 번씩 수행한다. */
    @Transactional(readOnly = true)
    public VerifiedAuthentication verifyAuthentication(String token) {
        Claims claims = getClaims(token);
        if (!Purpose.ACCESS.name().equals(claims.get(PURPOSE, String.class))) {
            throw new AuthException("접근 토큰이 아니에요. 다시 로그인해주세요.");
        }
        if (claims.get(SID) == null) throw new AuthException(RELOGIN_AFTER_UPDATE);
        validateSessionClaims(claims, Purpose.ACCESS);
        Long memberId = readMemberId(claims);
        String sid = claims.get(SID, String.class);
        LoginSessionAuthentication current = refreshTokenRepository.findAuthenticationBySessionIdAndMemberId(sid, memberId)
                .orElseThrow(TokenProvider::expired);
        Member member = current.member();
        LocalDateTime oauthAt = readOAuthAuthenticationAt(claims);
        String method = claims.get(METHOD, String.class);
        if (member.isDeleted() || member.isSuspended() || member.getAuthVersion() != readAuthVersion(claims)
                || !isLoginSessionCurrent(member, oauthAt, method)) throw expired();
        RefreshToken session = current.session();
        if (!session.isLiveAt(utcNow()) || session.getAuthVersion() != member.getAuthVersion()
                || !Objects.equals(session.getLoginMethod(), method)
                || !Objects.equals(session.getOauthAuthenticatedAt(), oauthAt)
                || !session.getAbsoluteExpiresAt().equals(readAbsoluteExpiry(claims))) throw expired();
        return new VerifiedAuthentication(member, oauthAt, method, sid);
    }
    public boolean isDeviceSessionCurrent(String sessionId, Long memberId) {
        return sessionId != null && memberId != null
                && refreshTokenRepository.findBySessionIdAndMemberId(sessionId, memberId)
                .filter(session -> session.isLiveAt(utcNow())).isPresent();
    }
    public Member getActiveMemberFromToken(String token) { return verifyAuthentication(token).member(); }
    public Member getMemberFromToken(String token) { return getActiveMemberFromToken(token); }
    public boolean validToken(String token) {
        try { getClaims(token); return true; }
        catch (Exception exception) { log.debug("Invalid token: errorType={}", exception.getClass().getSimpleName()); return false; }
    }
    public Long getUserId(String token) { return getClaims(token).get("id", Long.class); }
    public LocalDateTime getOAuthAuthenticationAt(String token) { return readOAuthAuthenticationAt(getClaims(token)); }
    public String getLoginMethod(String token) { return getClaims(token).get(METHOD, String.class); }
    public String getSessionId(String token) { return getClaims(token).get(SID, String.class); }

    public boolean isOAuthSessionCurrent(Member member, LocalDateTime authenticatedAt) {
        return !isOAuthMember(member) || member.getOauthSecurityRevokedAt() == null
                || authenticatedAt != null && authenticatedAt.isAfter(member.getOauthSecurityRevokedAt());
    }
    public boolean isLoginSessionCurrent(Member member, LocalDateTime at, String method) {
        if (method == null) return isOAuthSessionCurrent(member, at);
        return switch (method) {
            case "PASSWORD" -> !isOAuthMember(member) || member.getPassword() != null;
            case "OAUTH" -> isOAuthMember(member) && at != null && isOAuthSessionCurrent(member, at);
            default -> false;
        };
    }
    private void validateSessionClaims(Claims claims, Purpose purpose) {
        Long id = readMemberId(claims);
        String sid = claims.get(SID, String.class);
        if (id == null || id <= 0 || !id.toString().equals(claims.getSubject()) || !uuid(sid) || !uuid(claims.getId())
                || claims.getIssuedAt() == null || claims.getExpiration() == null
                || claims.getIssuedAt().after(new Date(clock.millis() + 60_000))
                || !claims.getIssuedAt().before(claims.getExpiration())
                || claims.getAudience() == null || !claims.getAudience().equals(Set.of(audience(purpose)))
                || !(claims.get(AUTH_VERSION) instanceof Number) || readAuthVersion(claims) < 0
                || !("PASSWORD".equals(claims.get(METHOD, String.class)) || "OAUTH".equals(claims.get(METHOD, String.class)))
                || claims.getExpiration().after(date(readAbsoluteExpiry(claims)))) {
            throw new JwtException("Invalid device-session claims");
        }
    }
    private Claims getClaims(String token) {
        if (token == null || token.length() > 8192) throw new JwtException("Invalid token length");
        try { return parser.parseSignedClaims(token).getPayload(); }
        catch (ExpiredJwtException exception) {
            // 만료 예외는 필수 클레임 검증보다 먼저 발생하므로 발급자를 별도로 확인한다.
            if (!jwtProperties.getIssuer().equals(exception.getClaims().getIssuer())) throw new JwtException("Invalid token issuer");
            throw exception;
        }
    }
    private SecretKey signingKey(String keyId) {
        SecretKey key = keyId == null ? cachedSecretKey : verificationKeys.get(keyId);
        if (key == null) throw new JwtException("Unknown JWT signing key");
        return key;
    }
    private String audience(Purpose purpose) {
        return purpose == Purpose.ACCESS ? jwtProperties.getAccessAudience() : jwtProperties.getRefreshAudience();
    }
    private static RefreshTokenInspection invalidInspection() { return new RefreshTokenInspection(RefreshTokenState.INVALID, null, 0); }
    private static Long readMemberId(Claims claims) {
        Object raw = claims.get("id");
        return raw instanceof Long || raw instanceof Integer ? ((Number) raw).longValue() : null;
    }
    private static int readAuthVersion(Claims claims) {
        Object raw = claims.get(AUTH_VERSION);
        if (!(raw instanceof Integer || raw instanceof Long) || ((Number) raw).longValue() > Integer.MAX_VALUE
                || ((Number) raw).longValue() < 0) return -1;
        return ((Number) raw).intValue();
    }
    private static LocalDateTime readAbsoluteExpiry(Claims claims) {
        Object raw = claims.get(ABSOLUTE_EXPIRY);
        if (!(raw instanceof Integer || raw instanceof Long)) throw new JwtException("Invalid absolute session expiry");
        try { return LocalDateTime.ofEpochSecond(((Number) raw).longValue(), 0, ZoneOffset.UTC); }
        catch (DateTimeException exception) { throw new JwtException("Invalid absolute session expiry"); }
    }
    private static LocalDateTime readOAuthAuthenticationAt(Claims claims) {
        Object raw = claims.get(OAUTH_AT);
        if (raw == null) return null;
        if (!(raw instanceof Long || raw instanceof Integer)) throw new JwtException("Invalid OAuth authentication time");
        try { return LocalDateTime.ofInstant(Instant.ofEpochMilli(((Number) raw).longValue()), ZoneOffset.UTC); }
        catch (DateTimeException exception) { throw new JwtException("Invalid OAuth authentication time"); }
    }
    private static boolean uuid(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException exception) { return false; }
    }
    private static boolean isOAuthMember(Member member) { return member.getProvider() != null && member.getProvider() != AuthProvider.LOCAL; }
    private static LocalDateTime oauthAuthenticationAt(Member member) { return isOAuthMember(member) ? member.getOauthAuthenticatedAt() : null; }
    private static String loginMethod(Member member, LocalDateTime at) {
        return isOAuthMember(member) && !(at == null && member.getPassword() != null) ? "OAUTH" : "PASSWORD";
    }
    private static AuthException expired() { return new AuthException("로그인 세션이 만료됐어요. 다시 로그인해주세요."); }
    private static LocalDateTime earlier(LocalDateTime first, LocalDateTime second) { return first.isBefore(second) ? first : second; }
    private LocalDateTime utcNow() { return LocalDateTime.now(clock); }
    private static Date date(LocalDateTime time) { return Date.from(time.toInstant(ZoneOffset.UTC)); }
}
