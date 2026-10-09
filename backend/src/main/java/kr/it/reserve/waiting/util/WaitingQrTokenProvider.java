package kr.it.reserve.waiting.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.waiting.dto.WaitingQrResponse;
import kr.it.reserve.waiting.error.WaitingException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.Date;

/** 로그인·예약 QR 키와 격리한다. 현장 접수 링크와 입장 QR도 서로의 검증기에 사용할 수 없다. */
@Component
public class WaitingQrTokenProvider {
    private final SecretKey key;
    private final Clock clock;

    @Autowired
    public WaitingQrTokenProvider(JwtProperties properties) { this(properties, Clock.systemUTC()); }

    public WaitingQrTokenProvider(JwtProperties properties, Clock clock) {
        String secret = properties.getSecretKey();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("Waiting QR secret must contain at least 32 bytes");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            key = Keys.hmacShaKeyFor(mac.doFinal("reserve/waiting/v1".getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException failure) {
            throw new IllegalStateException("Failed to derive waiting QR key", failure);
        }
        this.clock = clock;
    }

    public WaitingQrResponse issueOnsite(Long storeId) { return issue("j", storeId, null, Duration.ofMinutes(15)); }
    public WaitingQrResponse issueEntry(Long entryId, Long memberId) { return issue("e", entryId, memberId, Duration.ofMinutes(5)); }
    public Long parseOnsite(String token) { return id(parse(token, "j")); }
    public EntryIdentity parseEntry(String token) {
        Claims claims = parse(token, "e");
        return new EntryIdentity(id(claims), positive(claims.get("m", Long.class)));
    }
    public record EntryIdentity(Long entryId, Long memberId) {}

    private WaitingQrResponse issue(String purpose, Long id, Long memberId, Duration lifetime) {
        positive(id);
        var now = clock.instant();
        var expires = now.plus(lifetime);
        var builder = Jwts.builder().claim("p", purpose).claim("w", id)
                .issuedAt(Date.from(now)).expiration(Date.from(expires));
        if (memberId != null) builder.claim("m", positive(memberId));
        String token = "rw1." + purpose + "." + builder.signWith(key).compact();
        return new WaitingQrResponse(token, expires.atOffset(ZoneOffset.UTC));
    }

    private Claims parse(String token, String purpose) {
        String prefix = "rw1." + purpose + ".";
        if (token == null || token.length() > 2048 || !token.startsWith(prefix)) throw invalid();
        try {
            Claims claims = Jwts.parser().verifyWith(key).clock(() -> Date.from(clock.instant())).build()
                    .parseSignedClaims(token.substring(prefix.length())).getPayload();
            if (!purpose.equals(claims.get("p", String.class)) || claims.getExpiration() == null
                    || !claims.getExpiration().toInstant().isAfter(clock.instant())) throw invalid();
            return claims;
        } catch (io.jsonwebtoken.JwtException | IllegalArgumentException invalid) {
            throw invalid();
        }
    }

    private Long id(Claims claims) { return positive(claims.get("w", Long.class)); }
    private Long positive(Long value) {
        if (value == null || value < 1) throw invalid();
        return value;
    }
    private WaitingException invalid() {
        return new WaitingException("웨이팅 QR이 올바르지 않거나 유효 시간이 지났어요. 새 QR을 확인해주세요.", HttpStatus.BAD_REQUEST);
    }
}
