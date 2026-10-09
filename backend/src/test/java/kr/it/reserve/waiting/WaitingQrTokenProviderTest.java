package kr.it.reserve.waiting;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.util.WaitingQrTokenProvider;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;

class WaitingQrTokenProviderTest {
    private final JwtProperties properties = properties();
    private final Instant now = Instant.parse("2026-10-07T10:00:00Z");
    private JwtProperties properties() { var p = new JwtProperties(); p.setSecretKey("test-waiting-key-is-not-a-production-secret-".repeat(3)); return p; }
    private WaitingQrTokenProvider provider(Instant time) { return new WaitingQrTokenProvider(properties, Clock.fixed(time, ZoneOffset.UTC)); }
    @Test void joinAndEntryTokensCarryDifferentPurposesAndLifetimes() {
        var p = provider(now); var join = p.issueOnsite(31L); var entry = p.issueEntry(91L, 7L);
        assertThat(p.parseOnsite(join.token())).isEqualTo(31L);
        assertThat(p.parseEntry(entry.token()).memberId()).isEqualTo(7L);
        assertThat(join.expiresAt().toInstant()).isEqualTo(now.plusSeconds(900));
        assertThat(entry.expiresAt().toInstant()).isEqualTo(now.plusSeconds(300));
        assertThatThrownBy(() -> p.parseEntry(join.token())).isInstanceOf(WaitingException.class);
        assertThatThrownBy(() -> p.parseOnsite(entry.token())).isInstanceOf(WaitingException.class);
    }
    @Test void expiryAndSignatureTamperingFailClosed() {
        String token = provider(now).issueEntry(91L, 7L).token();
        assertThatThrownBy(() -> provider(now.plusSeconds(300)).parseEntry(token)).isInstanceOf(WaitingException.class);
        int index = token.lastIndexOf('.') + 1;
        String changed = token.substring(0, index) + (token.charAt(index) == 'a' ? 'b' : 'a') + token.substring(index + 1);
        assertThatThrownBy(() -> provider(now).parseEntry(changed)).isInstanceOf(WaitingException.class);
    }
    @Test void loginSignedTokensAndPurposePrefixSwapsCannotBeUsedAsWaitingQr() {
        var p = provider(now); var join = p.issueOnsite(31L).token();
        assertThatThrownBy(() -> p.parseEntry(join.replace("rw1.j.", "rw1.e."))).isInstanceOf(WaitingException.class);
        String loginSigned = Jwts.builder().claim("p", "e").claim("w", 91L).claim("m", 7L)
                .expiration(java.util.Date.from(now.plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor(properties.getSecretKey().getBytes(StandardCharsets.UTF_8))).compact();
        assertThatThrownBy(() -> p.parseEntry("rw1.e." + loginSigned)).isInstanceOf(WaitingException.class);
    }
}
