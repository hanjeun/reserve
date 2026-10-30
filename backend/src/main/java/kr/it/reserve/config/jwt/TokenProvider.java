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
            String jti, LocalDateTime absoluteExpiresAt, Boolean persistence) {
        public RefreshTokenInspection(RefreshTokenState state, Long memberId, int version, LocalDateTime at, String method,
                String sid, long generation, String jti, LocalDateTime expiry) {
            this(state, memberId, version, at, method, sid, generation, jti, expiry, null);
        }
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
    public record IssuedSession(String accessToken, String refreshToken, Duration refreshMaxAge, boolean persistent) {
        public IssuedSession(String access, String refresh, Duration maxAge) { this(access, refresh, maxAge, true); }
        @Override public String toString() { return "IssuedSession[credentials=redacted]"; }
    }
    /** 검증된 문맥만 보관하고 인증 상세에 원문 토큰을 남기지 않는다. */
    public record VerifiedAuthentication(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod,
                                         String sessionId, boolean persistent) {
        public VerifiedAuthentication(Member member, LocalDateTime at, String method, String sid) { this(member, at, method, sid, true); }
    }

    private static final String PURPOSE = "purpose";
    private static final String AUTH_VERSION = "authVersion";
    private static final String OAUTH_AT = "oauth_auth_at";
    private static final String METHOD = "login_method";
    private static final String SID = "sid";
    private static final String GENERATION = "rgen";
    private static final String ABSOLUTE_EXPIRY = "session_exp";
    private static final String PERSISTENT_LOGIN = "persistent_login";
    public static final String RELOGIN_AFTER_UPDATE = "로그인 보안이 업데이트됐어요. 다시 로그인해주세요.";

    private final JwtProperties jwtProperties;
    private final MemberRepository memberRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    @org.springframework.beans.factory.annotation.Autowired private kr.it.reserve.member.mfa.MfaPolicy mfaPolicy;
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
        return issue(authenticated, oauthAuthenticatedAt, loginMethod(authenticated, oauthAuthenticatedAt));
    }

    @Transactional
    public IssuedSession issueVerifiedSession(Member member, LocalDateTime at, String method) {
        if (!kr.it.reserve.member.mfa.MfaPolicy.strong(method)) throw expired();
        return issue(member, at, method);
    }

    @Transactional
    public IssuedSession issueSession(Member member, LocalDateTime at, boolean persistent) {
        return issue(member, at, loginMethod(member, at), persistent);
    }
    @Transactional
    public IssuedSession issueVerifiedSession(Member member, LocalDateTime at, String method, boolean persistent) {
        if (!kr.it.reserve.member.mfa.MfaPolicy.strong(method)) throw expired();
        return issue(member, at, method, persistent);
    }
    private IssuedSession issue(Member member, LocalDateTime at, String method) {
        return issue(member, at, method, null);
    }
    private IssuedSession issue(Member authenticated, LocalDateTime oauthAuthenticatedAt, String method, Boolean persistence) {
        oauthAuthenticatedAt = oauthAuthenticatedAt == null ? null : oauthAuthenticatedAt.truncatedTo(ChronoUnit.MILLIS);
        int expectedVersion = authenticated.getAuthVersion();
        AuthProvider provider = authenticated.getProvider();
        String providerId = authenticated.getProviderId();
        Member current = memberRepository.findActiveByIdForUpdate(authenticated.getId())
                .orElseThrow(TokenProvider::expired);
        entityManager.flush();
        entityManager.refresh(current, LockModeType.PESSIMISTIC_WRITE);
        if (mfaPolicy != null && !kr.it.reserve.member.mfa.MfaPolicy.strong(method) && mfaPolicy.requires(current)) throw expired();
        if (current.isDeleted() || current.isSuspended() || current.getAuthVersion() != expectedVersion
                || !isLoginSessionCurrent(current, oauthAuthenticatedAt, method)
                || method.startsWith("OAUTH") && (current.getProvider() != provider
                    || !Objects.equals(current.getProviderId(), providerId))) throw expired();

        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime absolute = now.plus(jwtProperties.getAbsoluteSessionLifetime());
        LocalDateTime expires = earlier(now.plus(jwtProperties.getRefreshTokenExpiration()), absolute);
        RefreshToken row = new RefreshToken(current.getId(), UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                jwtProperties.getActiveKeyId(), now, expires, absolute, current.getAuthVersion(), oauthAuthenticatedAt, method);
        String refresh = reconstructRefreshToken(row, persistence);
        row.bindRefreshToken(refresh);
        refreshTokenRepository.save(row);
        List<RefreshToken> devices = refreshTokenRepository.findByMemberIdForUpdate(current.getId());
        for (int i = 0; i < devices.size() - 5; i++) refreshTokenRepository.delete(devices.get(i));
        refreshTokenRepository.flush();
        return new IssuedSession(accessForSession(row, persistence), refresh, Duration.between(now, expires), !Boolean.FALSE.equals(persistence));
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
    public IssuedSession rotateSession(RefreshToken row) { return rotateSession(row, null); }
    public IssuedSession rotateSession(RefreshToken row, Boolean persistence) {
        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime expires = earlier(now.plus(jwtProperties.getRefreshTokenExpiration()), row.getAbsoluteExpiresAt());
        String jti = UUID.randomUUID().toString();
        String keyId = jwtProperties.getActiveKeyId();
        String refresh = makeToken(row, Purpose.REFRESH, jti, now, expires, keyId, row.getRotationVersion() + 1, persistence);
        row.rotate(refresh, jti, keyId, now, expires);
        return new IssuedSession(accessForSession(row, persistence), refresh, Duration.between(now, expires), !Boolean.FALSE.equals(persistence));
    }
    public IssuedSession currentSessionTokens(RefreshToken row) { return currentSessionTokens(row, null); }
    public IssuedSession currentSessionTokens(RefreshToken row, Boolean persistence) {
        String refresh = reconstructRefreshToken(row, persistence);
        if (!row.isCurrentToken(refresh)) throw new JwtException("Refresh reconstruction does not match stored hash");
        return new IssuedSession(accessForSession(row, persistence), refresh, Duration.between(utcNow(), row.getExpiresAt()), !Boolean.FALSE.equals(persistence));
    }
    private String reconstructRefreshToken(RefreshToken row) { return reconstructRefreshToken(row, null); }
    private String reconstructRefreshToken(RefreshToken row, Boolean persistence) {
        return makeToken(row, Purpose.REFRESH, row.getRefreshJti(), row.getIssuedAt(), row.getExpiresAt(),
                row.getSigningKeyId(), row.getRotationVersion(), persistence);
    }
    public String accessForSession(RefreshToken row) { return accessForSession(row, null); }
    private String accessForSession(RefreshToken row, Boolean persistence) {
        LocalDateTime now = utcNow().truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime expires = earlier(now.plus(jwtProperties.getAccessTokenExpiration()),
                earlier(row.getExpiresAt(), row.getAbsoluteExpiresAt()));
        return makeToken(row, Purpose.ACCESS, UUID.randomUUID().toString(), now, expires,
                jwtProperties.getActiveKeyId(), null, persistence);
    }

    /** 갱신 유예 응답이 프로필 변경에 흔들리지 않도록 회원 ID와 클레임 순서를 고정한다. */
    private String makeToken(RefreshToken row, Purpose purpose, String jti, LocalDateTime issuedAt,
                             LocalDateTime expires, String keyId, Long generation, Boolean persistence) {
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
        if (persistence != null) builder.claim(PERSISTENT_LOGIN, persistence);
        return builder.signWith(signingKey(keyId), Jwts.SIG.HS512).compact();
    }

    private static Boolean readPersistence(Claims claims) {
        Object value = claims.get(PERSISTENT_LOGIN);
        if (value != null && !(value instanceof Boolean)) throw new JwtException("Invalid login persistence");
        return (Boolean) value;
    }

    public boolean isPersistentLogin(String token) { return !Boolean.FALSE.equals(readPersistence(getClaims(token))); }

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
                    readAbsoluteExpiry(claims), readPersistence(claims));
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
                || !isLoginSessionCurrent(member, oauthAt, method, current.mfaEnabled())) throw expired();
        RefreshToken session = current.session();
        if (!session.isLiveAt(utcNow()) || session.getAuthVersion() != member.getAuthVersion()
                || !Objects.equals(session.getLoginMethod(), method)
                || !Objects.equals(session.getOauthAuthenticatedAt(), oauthAt)
                || !session.getAbsoluteExpiresAt().equals(readAbsoluteExpiry(claims))) throw expired();
        return new VerifiedAuthentication(member, oauthAt, method, sid, !Boolean.FALSE.equals(readPersistence(claims)));
    }
    public boolean isDeviceSessionCurrent(String sessionId, Long memberId) {
        if (sessionId == null || memberId == null) return false;
        return refreshTokenRepository.findAuthenticationBySessionIdAndMemberId(sessionId, memberId)
                .filter(value -> !value.member().isDeleted() && !value.member().isSuspended()
                        && value.session().isLiveAt(utcNow())
                        && value.session().getAuthVersion() == value.member().getAuthVersion()
                        && isLoginSessionCurrent(value.member(), value.session().getOauthAuthenticatedAt(), value.session().getLoginMethod(), value.mfaEnabled()))
                .isPresent();
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
    /** 관리자 필수 인증은 발급과 매 요청에서 검사하고, 수단 변경은 인증 버전과 세션을 폐기해요. */
    public boolean isLoginSessionCurrent(Member member, LocalDateTime at, String method) {
        return isLoginSessionCurrent(member, at, method, null);
    }
    private boolean isLoginSessionCurrent(Member member, LocalDateTime at, String method, Boolean enrolled) {
        if (mfaPolicy != null && !kr.it.reserve.member.mfa.MfaPolicy.strong(method)
                && (enrolled == null ? mfaPolicy.mandatory(member) : mfaPolicy.mandatory(member, enrolled))) return false;
        return isPrimaryLoginCurrent(member, at, method);
    }
    public boolean isPrimaryLoginCurrent(Member member, LocalDateTime at, String method) {
        if (method == null) return isOAuthSessionCurrent(member, at);
        return switch (method) {
            case "PASSKEY" -> true;
            case "PASSWORD", "PASSWORD_MFA" -> !isOAuthMember(member) || member.getPassword() != null;
            case "OAUTH", "OAUTH_MFA" -> isOAuthMember(member) && at != null && isOAuthSessionCurrent(member, at);
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
                || !Set.of("PASSWORD", "OAUTH", "PASSWORD_MFA", "OAUTH_MFA", "PASSKEY").contains(claims.get(METHOD, String.class))
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
