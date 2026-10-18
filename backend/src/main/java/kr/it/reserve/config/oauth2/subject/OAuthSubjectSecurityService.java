package kr.it.reserve.config.oauth2.subject;

import kr.it.reserve.member.entity.AuthProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Set;

/** 로그인·사건의 공통 잠금 관문. receiver flag와 무관하게 공급자 로그인은 이 관문을 지난다. */
@Service
public class OAuthSubjectSecurityService {
    private static final Set<AuthProvider> PROVIDERS = Set.of(AuthProvider.GOOGLE, AuthProvider.KAKAO, AuthProvider.NAVER);
    private static final Duration MAXIMUM_AUTHENTICATION_AGE = Duration.ofMinutes(10);
    private final OAuthSubjectSecurityRepository subjects;
    private final Clock clock;

    @Autowired
    public OAuthSubjectSecurityService(OAuthSubjectSecurityRepository subjects) {
        this(subjects, Clock.systemUTC());
    }

    public OAuthSubjectSecurityService(OAuthSubjectSecurityRepository subjects, Clock clock) {
        this.subjects = subjects;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public OAuthSubjectSecurity lock(AuthProvider provider, String providerId) {
        String key = subjectKey(provider, providerId);
        subjects.createIfAbsent(key, provider.name(), now());
        OAuthSubjectSecurity subject = subjects.findByKeyForUpdate(key)
                .orElseThrow(() -> new IllegalStateException("OAuth subject state is missing after creation"));
        if (!provider.name().equals(subject.getProvider())) throw new IllegalStateException("OAuth subject provider does not match");
        return subject;
    }

    /** 동의 화면 체류가 아니라 token 교환부터 회원 커밋까지의 시간이다. 잠금 대기 뒤 다시 확인한다. */
    public void requireFreshAuthentication(LocalDateTime authenticatedAt, Instant tokenExpiresAt) {
        Instant now = clock.instant();
        Instant issuedAt = authenticatedAt == null ? null : authenticatedAt.toInstant(ZoneOffset.UTC);
        if (issuedAt == null || tokenExpiresAt == null || !now.isBefore(tokenExpiresAt)
                || !issuedAt.plus(MAXIMUM_AUTHENTICATION_AGE).isAfter(now)
                || issuedAt.isAfter(now.plusSeconds(60))) {
            throw new OAuth2AuthenticationException("oauth_reauthentication_required");
        }
    }

    public LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC);
    }

    public static String subjectKey(AuthProvider provider, String providerId) {
        if (provider == null || !PROVIDERS.contains(provider) || providerId == null || providerId.isBlank() || providerId.length() > 255) {
            throw new IllegalArgumentException("OAuth provider subject is invalid");
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((provider.name() + "\0" + providerId).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
