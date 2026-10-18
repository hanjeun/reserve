package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.member.entity.AuthProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Naver 개발가이드 4.4의 MAC을 먼저 검증한 뒤에만 encrypted subject를 복호화한다. */
@Component
public class NaverUnlinkEventVerifier {
    private static final Set<String> FIELDS = Set.of("clientId", "encryptUniqueId", "timestamp", "signature");
    private final boolean enabled;
    private final String clientId;
    private final byte[] protocolKey;
    private final Clock clock;

    @Autowired
    public NaverUnlinkEventVerifier(
            @Value("${oauth.security-events.naver.enabled:false}") boolean enabled,
            @Value("${spring.security.oauth2.client.registration.naver.client-id:}") String clientId,
            @Value("${spring.security.oauth2.client.registration.naver.client-secret:}") String clientSecret) {
        this(enabled, clientId, clientSecret, Clock.systemUTC());
    }

    NaverUnlinkEventVerifier(boolean enabled, String clientId, String clientSecret, Clock clock) {
        this.enabled = enabled;
        this.clientId = clientId;
        this.clock = clock;
        if (enabled && (clientId.isBlank() || clientSecret.isBlank())) {
            throw new IllegalStateException("Naver security event client credentials are required");
        }
        try {
            // 공급자 상호운용 규격의 MD5 raw16-byte 키다. 앱 토큰/비밀번호의 암호화 키로 재사용하지 않는다.
            protocolKey = clientSecret.isBlank() ? null
                    : MessageDigest.getInstance("MD5").digest(clientSecret.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Naver security event verification could not be initialized", exception);
        }
    }

    public VerifiedOAuthSecurityEvent verify(Map<String, String> parameters) {
        if (!enabled) throw new OAuthSecurityEventException("receiver_disabled", HttpStatus.NOT_FOUND);
        if (!parameters.keySet().equals(FIELDS)) throw OAuthSecurityEventException.invalid("invalid_request");
        String incomingClient = parameters.get("clientId");
        String encrypted = parameters.get("encryptUniqueId");
        String timestamp = parameters.get("timestamp");
        String signature = parameters.get("signature");
        if (incomingClient == null || !clientId.equals(incomingClient)) throw forbidden();
        if (encrypted == null || !encrypted.matches("[A-Za-z0-9_-]{43,2048}")
                || timestamp == null || !timestamp.matches("[0-9]{1,12}")
                || signature == null || !signature.matches("[A-Za-z0-9_-]{43}")) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
        try {
            String base = "clientId=" + incomingClient + "&encryptUniqueId=" + encrypted + "&timestamp=" + timestamp;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(protocolKey, "HmacSHA256"));
            byte[] expected = mac.doFinal(base.getBytes(StandardCharsets.UTF_8));
            byte[] supplied = Base64.getUrlDecoder().decode(signature);
            if (!MessageDigest.isEqual(expected, supplied)
                    || !Base64.getUrlEncoder().withoutPadding().encodeToString(supplied).equals(signature)) throw forbidden();

            Instant requestedAt = Instant.ofEpochSecond(Long.parseLong(timestamp));
            // Naver 필수 규격이 아닌 앱의 replay 정책이다. timestamp는 실제 unlink가 아닌 요청 시각이다.
            if (requestedAt.isBefore(clock.instant().minusSeconds(300))
                    || requestedAt.isAfter(clock.instant().plusSeconds(300))) {
                throw OAuthSecurityEventException.invalid("invalid_request");
            }
            byte[] bytes = Base64.getUrlDecoder().decode(encrypted);
            if (bytes.length < 32 || (bytes.length - 16) % 16 != 0) {
                throw OAuthSecurityEventException.invalid("invalid_request");
            }
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(protocolKey, "AES"),
                    new IvParameterSpec(Arrays.copyOfRange(bytes, 0, 16)));
            byte[] plaintext = cipher.doFinal(Arrays.copyOfRange(bytes, 16, bytes.length));
            String providerId = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(plaintext)).toString();
            if (providerId.isBlank() || providerId.length() > 255 || providerId.chars().anyMatch(Character::isISOControl)) {
                throw OAuthSecurityEventException.invalid("invalid_request");
            }
            // 별도 jti가 없는 규격이다. 같은 서명 요청의 재생을 식별하며 원문/식별자를 저장하지 않는다.
            String eventId = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((clientId + "\0" + signature).getBytes(StandardCharsets.UTF_8)));
            return new VerifiedOAuthSecurityEvent(AuthProvider.NAVER, eventId, requestedAt,
                    List.of(new VerifiedOAuthSecurityEvent.Action(providerId, true)));
        } catch (OAuthSecurityEventException exception) {
            throw exception;
        } catch (Exception exception) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
    }

    private OAuthSecurityEventException forbidden() {
        return new OAuthSecurityEventException("invalid_signature", HttpStatus.FORBIDDEN);
    }
}
