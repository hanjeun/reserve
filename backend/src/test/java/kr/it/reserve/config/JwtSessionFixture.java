package kr.it.reserve.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.ProtectedHeader;
import io.jsonwebtoken.security.Keys;
import jakarta.persistence.EntityManager;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.LoginSessionAuthentication;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Real signing, validation and rotation with an in-memory repository substitute; no external secrets or calls. */
public final class JwtSessionFixture {
    public static final String SECRET = "synthetic-jwt-session-test-key-that-is-longer-than-sixty-four-characters-000";
    public final JwtProperties properties = properties();
    public final MemberRepository members = mock(MemberRepository.class);
    public final RefreshTokenRepository sessions = mock(RefreshTokenRepository.class);
    public final EntityManager entityManager = mock(EntityManager.class);
    public final Map<String, RefreshToken> devices = new ConcurrentHashMap<>();
    public final TokenProvider tokens;
    public final TokenService service;
    public final Member member;
    public final Instant startedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    private final AtomicLong sequence = new AtomicLong();

    public JwtSessionFixture(Member member) {
        this.member = member;
        tokens = new TokenProvider(properties, members, sessions);
        service = new TokenService(tokens, sessions, members, properties);
        ReflectionTestUtils.setField(tokens, "entityManager", entityManager);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        setNow(startedAt);
        tokens.init();
        when(members.findActiveByIdForUpdate(member.getId())).thenAnswer(i -> Optional.of(member));
        when(members.findByIdAndDeletedAtIsNull(member.getId())).thenAnswer(i -> Optional.of(member));
        when(sessions.save(any(RefreshToken.class))).thenAnswer(i -> register(i.getArgument(0)));
        when(sessions.findByMemberId(member.getId())).thenAnswer(i -> list());
        when(sessions.findByMemberIdForUpdate(member.getId())).thenAnswer(i -> list());
        when(sessions.findBySessionIdAndMemberId(anyString(), anyLong())).thenAnswer(i -> lookup(i.getArgument(0), i.getArgument(1)));
        when(sessions.findAuthenticationBySessionIdAndMemberId(anyString(), anyLong()))
                .thenAnswer(i -> authenticationLookup(i.getArgument(0), i.getArgument(1)));
        when(sessions.findBySessionIdForUpdate(anyString(), anyLong())).thenAnswer(i -> lookup(i.getArgument(0), i.getArgument(1)));
        doAnswer(i -> { devices.remove(((RefreshToken) i.getArgument(0)).getSessionId()); return null; })
                .when(sessions).delete(any(RefreshToken.class));
        doAnswer(i -> { devices.values().removeIf(row -> Objects.equals(row.getMemberId(), i.getArgument(0))); return null; })
                .when(sessions).deleteByMemberId(anyLong());
    }
    public static JwtProperties properties() {
        JwtProperties value = new JwtProperties();
        value.setIssuer("test-issuer");
        value.setSecretKey(SECRET);
        value.getAccessToken().setExpirationMinutes(30);
        value.getRefreshToken().setExpirationDays(14);
        return value;
    }
    public void setNow(Instant instant) {
        Clock clock = Clock.fixed(instant, ZoneOffset.UTC);
        ReflectionTestUtils.setField(tokens, "clock", clock);
        ReflectionTestUtils.setField(service, "clock", clock);
    }
    public TokenProvider.IssuedSession issue(LocalDateTime at) { return tokens.issueSession(member, at); }
    public RefreshToken row(String token) { return devices.get(tokens.inspectRefreshToken(token).sessionId()); }
    public List<RefreshToken> list() {
        return devices.values().stream().filter(row -> row.getMemberId().equals(member.getId()))
                .sorted(Comparator.comparing(RefreshToken::getCreatedAt).thenComparing(RefreshToken::getId)).toList();
    }
    public RefreshToken register(RefreshToken row) {
        if (row.getId() == null) ReflectionTestUtils.setField(row, "id", sequence.incrementAndGet());
        devices.put(row.getSessionId(), row);
        return row;
    }
    private Optional<RefreshToken> lookup(String sid, Long memberId) {
        return Optional.ofNullable(devices.get(sid)).filter(row -> row.getMemberId().equals(memberId));
    }
    private Optional<LoginSessionAuthentication> authenticationLookup(String sid, Long memberId) {
        if (!Objects.equals(member.getId(), memberId) || member.isDeleted()) return Optional.empty();
        return lookup(sid, memberId).map(row -> new LoginSessionAuthentication(member, row));
    }
    public Claims claims(String token) {
        return Jwts.parser().clock(() -> Date.from(startedAt)).keyLocator(header -> {
            String kid = ((ProtectedHeader) header).getKeyId();
            String material = kid == null ? properties.getSecretKey() : properties.getSigningKeys().get(kid);
            return Keys.hmacShaKeyFor(material.getBytes(StandardCharsets.UTF_8));
        }).build().parseSignedClaims(token).getPayload();
    }
    public RefreshToken seed(String token) {
        var proof = tokens.inspectRefreshToken(token);
        Claims claims = claims(token);
        String keyId = properties.getActiveKeyId();
        RefreshToken row = new RefreshToken(proof.memberId(), proof.sessionId(), proof.jti(), keyId,
                LocalDateTime.ofInstant(claims.getIssuedAt().toInstant(), ZoneOffset.UTC),
                LocalDateTime.ofInstant(claims.getExpiration().toInstant(), ZoneOffset.UTC),
                proof.absoluteExpiresAt(), proof.authVersion(), proof.oauthAuthenticatedAt(), proof.loginMethod());
        row.bindRefreshToken(token);
        return register(row);
    }
}
