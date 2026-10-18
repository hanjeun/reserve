package kr.it.reserve.config.oauth2.events;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import kr.it.reserve.member.entity.AuthProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Google RISC/Kakao SET 인증 후 지원되는 사건만 자체 세션 폐기로 해석한다. */
@Component
public class OAuthSecurityEventVerifier {
    private static final String OAUTH = "https://schemas.openid.net/secevent/oauth/event-type/";
    private static final String RISC = "https://schemas.openid.net/secevent/risc/event-type/";
    private static final Set<String> GOOGLE_SUBJECT_ISSUERS = Set.of(
            "https://accounts.google.com", "https://accounts.google.com/", "accounts.google.com");
    private final OAuthSecurityEventKeys keys;
    private final boolean googleEnabled;
    private final Set<String> googleClientIds;
    private final boolean kakaoEnabled;
    private final String kakaoRestApiKey;
    private final String kakaoAppId;
    private final Clock clock;

    @Autowired
    public OAuthSecurityEventVerifier(
            OAuthSecurityEventKeys keys,
            @Value("${oauth.security-events.google.enabled:false}") boolean googleEnabled,
            @Value("${oauth.security-events.google.client-ids:}") String googleClientIds,
            @Value("${oauth.security-events.kakao.enabled:false}") boolean kakaoEnabled,
            @Value("${oauth.security-events.kakao.rest-api-key:}") String kakaoRestApiKey,
            @Value("${oauth.security-events.kakao.app-id:}") String kakaoAppId) {
        this(keys, googleEnabled, googleClientIds, kakaoEnabled, kakaoRestApiKey, kakaoAppId, Clock.systemUTC());
    }

    OAuthSecurityEventVerifier(OAuthSecurityEventKeys keys, boolean googleEnabled, String googleClientIds,
            boolean kakaoEnabled, String kakaoRestApiKey, String kakaoAppId, Clock clock) {
        this.keys = keys;
        this.googleEnabled = googleEnabled;
        this.googleClientIds = Arrays.stream(googleClientIds.split(","))
                .map(String::trim).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
        this.kakaoEnabled = kakaoEnabled;
        this.kakaoRestApiKey = kakaoRestApiKey;
        this.kakaoAppId = kakaoAppId;
        this.clock = clock;
        if (googleEnabled && this.googleClientIds.isEmpty()) {
            throw new IllegalStateException("Google security event audience is required");
        }
        if (kakaoEnabled && (kakaoRestApiKey.isBlank() || kakaoAppId.isBlank())) {
            throw new IllegalStateException("Kakao security event audience and app id are required");
        }
    }

    public VerifiedOAuthSecurityEvent verify(AuthProvider provider, String encoded) {
        if ((provider != AuthProvider.GOOGLE || !googleEnabled)
                && (provider != AuthProvider.KAKAO || !kakaoEnabled)) {
            throw new OAuthSecurityEventException("receiver_disabled", HttpStatus.NOT_FOUND);
        }
        if (encoded == null || encoded.length() > 32_768 || encoded.isBlank()) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
        try {
            SignedJWT jwt = SignedJWT.parse(encoded);
            if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())
                    || jwt.getHeader().getKeyID() == null || jwt.getHeader().getKeyID().isBlank()
                    || jwt.getHeader().getKeyID().length() > 255
                    || (provider == AuthProvider.KAKAO
                        && !new JOSEObjectType("secevent+jwt").equals(jwt.getHeader().getType()))) {
                throw OAuthSecurityEventException.invalid("invalid_request");
            }
            OAuthSecurityEventKeys.VerificationKey verificationKey = keys.resolve(provider, jwt.getHeader().getKeyID());
            if (!jwt.verify(new RSASSAVerifier(verificationKey.key()))) {
                throw OAuthSecurityEventException.invalid("invalid_key");
            }
            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            // JWTClaimsSet의 등록 날짜/Long accessor가 소수를 절삭하기 전의 서명된 원문 Number다.
            Map<String, Object> originalClaims = jwt.getPayload().toJSONObject();
            if (originalClaims == null) throw OAuthSecurityEventException.invalid("invalid_request");
            if (!verificationKey.issuer().equals(claims.getIssuer())) {
                throw OAuthSecurityEventException.invalid("invalid_issuer");
            }
            Set<String> audiences = provider == AuthProvider.GOOGLE ? googleClientIds : Set.of(kakaoRestApiKey);
            if (claims.getAudience() == null || claims.getAudience().stream().noneMatch(audiences::contains)) {
                throw OAuthSecurityEventException.invalid("invalid_audience");
            }
            if (provider == AuthProvider.KAKAO
                    && !kakaoAppId.equals(String.valueOf(claims.getClaim("app_id")))) {
                throw OAuthSecurityEventException.invalid("invalid_audience");
            }
            String eventId = claims.getJWTID();
            Instant issuedAt = numericDate(originalClaims.get("iat"));
            if (eventId == null || eventId.isBlank() || eventId.length() > 255
                    || issuedAt.isAfter(clock.instant().plusSeconds(300))) {
                throw OAuthSecurityEventException.invalid("invalid_request");
            }
            // SET는 과거 보안 사건을 나타낸다. 로그인 JWT의 exp 규칙을 적용하지 않는다.
            Instant occurredAt = issuedAt;
            Object toe = originalClaims.get("toe");
            if (toe != null) {
                occurredAt = numericDate(toe);
                if (occurredAt.isAfter(issuedAt.plusSeconds(300))) {
                    throw OAuthSecurityEventException.invalid("invalid_request");
                }
            }
            Map<String, Object> events = claims.getJSONObjectClaim("events");
            if (events == null || events.isEmpty() || events.size() > 16) {
                throw OAuthSecurityEventException.invalid("invalid_request");
            }
            Map<String, Boolean> subjects = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : events.entrySet()) {
                if (!(entry.getValue() instanceof Map<?, ?> payload)) {
                    throw OAuthSecurityEventException.invalid("invalid_request");
                }
                Boolean clearToken = sessionRevocation(provider, entry.getKey(), payload);
                if (clearToken == null) continue;
                String subject = subject(provider, payload, claims.getSubject());
                subjects.merge(subject, clearToken, (previous, next) -> previous || next);
            }
            List<VerifiedOAuthSecurityEvent.Action> actions = new ArrayList<>();
            subjects.forEach((subject, clearToken) -> actions.add(new VerifiedOAuthSecurityEvent.Action(subject, clearToken)));
            return new VerifiedOAuthSecurityEvent(provider, eventId, occurredAt, actions);
        } catch (OAuthSecurityEventException exception) {
            throw exception;
        } catch (Exception exception) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
    }

    /** RFC 7519 NumericDate 소수는 UTC ms로 올림해 폐기 시각을 과거로 낮추지 않는다. */
    private static Instant numericDate(Object value) {
        if (!(value instanceof Number number)) throw OAuthSecurityEventException.invalid("invalid_request");
        // 곱셈은 큰 지수를 정수 자리수로 확장하지 않아 범위 검사 전에 메모리가 커지지 않는다.
        BigDecimal millis = new BigDecimal(number.toString()).multiply(BigDecimal.valueOf(1000));
        if (millis.signum() < 0 || millis.compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
        // 극단적인 작은 지수에서도 거대한 10의 거듭제곱을 만들지 않는다.
        if (millis.signum() > 0 && millis.compareTo(BigDecimal.ONE) < 0) return Instant.ofEpochMilli(1);
        return Instant.ofEpochMilli(millis.setScale(0, RoundingMode.CEILING).longValueExact());
    }

    private Boolean sessionRevocation(AuthProvider provider, String type, Map<?, ?> payload) {
        if ((OAUTH + "tokens-revoked").equals(type)) {
            // 비즈니스 토큰은 일반 로그인 토큰과 소유자 규격이 다르다.
            return payload.containsKey("token_class") ? null : Boolean.TRUE;
        }
        if ((RISC + "sessions-revoked").equals(type)) return Boolean.FALSE;
        if ((RISC + "account-disabled").equals(type)) {
            return "hijacking".equals(payload.get("reason")) ? Boolean.TRUE : null;
        }
        if (provider == AuthProvider.KAKAO && (OAUTH + "user-unlinked").equals(type)) return Boolean.TRUE;
        // profile 변경/동의항목 일부 철회/계정 활성화/단일 refresh-token 사건을 계정 삭제로 일반화하지 않는다.
        return null;
    }

    private String subject(AuthProvider provider, Map<?, ?> payload, String topLevelSubject) {
        if (!(payload.get("subject") instanceof Map<?, ?> subject)) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
        String type = String.valueOf(subject.get("subject_type"));
        String issuer = String.valueOf(subject.get("iss"));
        if (!("iss-sub".equals(type) || (provider == AuthProvider.GOOGLE && "id_token_claims".equals(type)))) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
        if (provider == AuthProvider.GOOGLE ? !GOOGLE_SUBJECT_ISSUERS.contains(issuer)
                : !"https://kauth.kakao.com".equals(issuer)) {
            throw OAuthSecurityEventException.invalid("invalid_issuer");
        }
        Object value = subject.get("sub");
        if (!(value instanceof String providerId) || providerId.isBlank() || providerId.length() > 255
                || (provider == AuthProvider.KAKAO && !providerId.equals(topLevelSubject))) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
        return providerId;
    }
}
