package kr.it.reserve.config.oauth2.events;

import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.member.entity.AuthProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** 공급자가 정한 고정 discovery/JWKS만 읽는다. SET의 jku/x5u/URL은 사용하지 않는다. */
@Component
public class OAuthSecurityEventKeys {
    private static final Duration CACHE_TTL = Duration.ofHours(1);
    private static final Duration MIN_REFRESH_INTERVAL = Duration.ofMinutes(1);
    private final OAuthSecurityEventMetadataClient metadataClient;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final Map<AuthProvider, CachedKeys> cache = new ConcurrentHashMap<>();
    private final Map<AuthProvider, Instant> nextRefreshAt = new ConcurrentHashMap<>();
    private final Map<AuthProvider, Object> providerLocks = new EnumMap<>(AuthProvider.class);

    @Autowired
    public OAuthSecurityEventKeys(ObjectMapper objectMapper, OAuthSecurityEventMetadataClient metadataClient) {
        this(objectMapper, metadataClient, Clock.systemUTC());
    }

    OAuthSecurityEventKeys(ObjectMapper objectMapper, OAuthSecurityEventMetadataClient metadataClient, Clock clock) {
        this.objectMapper = objectMapper;
        this.metadataClient = metadataClient;
        this.clock = clock;
        providerLocks.put(AuthProvider.GOOGLE, new Object());
        providerLocks.put(AuthProvider.KAKAO, new Object());
    }

    public VerificationKey resolve(AuthProvider provider, String keyId) {
        Object lock = providerLocks.get(provider);
        if (lock == null) throw OAuthSecurityEventException.invalid("invalid_issuer");
        synchronized (lock) {
            return resolveLocked(provider, keyId);
        }
    }

    private VerificationKey resolveLocked(AuthProvider provider, String keyId) {
        Instant now = clock.instant();
        CachedKeys cached = cache.get(provider);
        if (cached == null || !cached.loadedAt().plus(CACHE_TTL).isAfter(now)) {
            cached = refresh(provider, now);
        }
        JWK key = cached.keys().getKeyByKeyId(keyId);
        if (key == null && !cached.loadedAt().plus(MIN_REFRESH_INTERVAL).isAfter(now)) {
            cached = refresh(provider, now);
            key = cached.keys().getKeyByKeyId(keyId);
        }
        if (!(key instanceof RSAKey rsa) || rsa.isPrivate()
                || (rsa.getAlgorithm() != null && !"RS256".equals(rsa.getAlgorithm().getName()))
                || (rsa.getKeyUse() != null && !"sig".equals(rsa.getKeyUse().identifier()))) {
            throw OAuthSecurityEventException.invalid("invalid_key");
        }
        try {
            RSAPublicKey publicKey = rsa.toRSAPublicKey();
            if (publicKey.getModulus().bitLength() < 2048) throw OAuthSecurityEventException.invalid("invalid_key");
            return new VerificationKey(cached.issuer(), publicKey);
        } catch (com.nimbusds.jose.JOSEException exception) {
            throw OAuthSecurityEventException.invalid("invalid_key");
        }
    }

    private CachedKeys refresh(AuthProvider provider, Instant now) {
        Instant next = nextRefreshAt.get(provider);
        if (next != null && next.isAfter(now)) throw OAuthSecurityEventException.unavailable();
        // 실패도 기록해 cold/expired 캐시 요청이 반복해서 원격 서버와 작업 스레드를 붙들지 않게 한다.
        nextRefreshAt.put(provider, now.plus(MIN_REFRESH_INTERVAL));
        String discovery;
        String expectedJwks;
        Set<String> issuers;
        if (provider == AuthProvider.GOOGLE) {
            discovery = "https://accounts.google.com/.well-known/risc-configuration";
            expectedJwks = "https://www.googleapis.com/oauth2/v3/certs";
            issuers = Set.of("https://accounts.google.com", "https://accounts.google.com/", "accounts.google.com");
        } else if (provider == AuthProvider.KAKAO) {
            discovery = "https://kauth.kakao.com/.well-known/ssf-configuration";
            expectedJwks = "https://kauth.kakao.com/.well-known/jwks.json";
            issuers = Set.of("https://kauth.kakao.com");
        } else {
            throw OAuthSecurityEventException.invalid("invalid_issuer");
        }
        try {
            JsonNode metadata = objectMapper.readTree(metadataClient.read(discovery, 32_768));
            if (metadata == null || !metadata.isObject()) throw OAuthSecurityEventException.unavailable();
            String issuer = metadata.path("issuer").asText();
            if (!issuers.contains(issuer) || !expectedJwks.equals(metadata.path("jwks_uri").asText())) {
                throw OAuthSecurityEventException.unavailable();
            }
            JWKSet keys = JWKSet.parse(metadataClient.read(expectedJwks, 262_144));
            CachedKeys loaded = new CachedKeys(issuer, keys, now);
            cache.put(provider, loaded);
            return loaded;
        } catch (IOException | java.text.ParseException | IllegalArgumentException exception) {
            throw OAuthSecurityEventException.unavailable();
        }
    }

    public record VerificationKey(String issuer, RSAPublicKey key) { }
    private record CachedKeys(String issuer, JWKSet keys, Instant loadedAt) { }
}
