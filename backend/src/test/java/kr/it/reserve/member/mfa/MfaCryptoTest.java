package kr.it.reserve.member.mfa;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class MfaCryptoTest {
    private static final String RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    @Test void validatesDedicatedKeyAndExactTrustedOrigin() {
        var properties = new MfaProperties();
        properties.setEnabled(true);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
        properties.setEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        properties.validate();
        properties.setOrigins(java.util.List.of("http://app.reserve.it.kr"));
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
        properties.setOrigins(java.util.List.of("https://other.invalid"));
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
        properties.setRpId("localhost"); properties.setOrigins(java.util.List.of("http://localhost:5173"));
        properties.validate();
    }
    @Test void diagnosticStringsDoNotContainAuthenticationProofs() {
        assertThat(new MfaController.Manage("fixture-password").toString()).doesNotContain("fixture-password");
        assertThat(new MfaController.Proof("BACKUP","fixture-recovery").toString()).doesNotContain("fixture-recovery");
        assertThat(new MfaController.Code("123456").toString()).doesNotContain("123456");
    }

    @Test void matchesRfc6238Sha1Vectors() {
        long[] seconds = {59, 1111111109L, 1111111111L, 1234567890L, 2000000000L, 20000000000L};
        String[] expected = {"94287082", "07081804", "14050471", "89005924", "69279037", "65353130"};
        for (int i = 0; i < seconds.length; i++) assertThat(MfaCrypto.code(RFC_SECRET, seconds[i] / 30, 8)).isEqualTo(expected[i]);
    }
    @Test void acceptsOnlyWindowAndRejectsConsumedStep() {
        var crypto = new MfaCrypto(new MfaProperties());
        Instant now = Instant.ofEpochSecond(1234567890L);
        long step = now.getEpochSecond() / 30;
        String code = MfaCrypto.code(RFC_SECRET, step, 6);
        assertThat(crypto.match(RFC_SECRET, code, now, -1)).isEqualTo(step);
        assertThat(crypto.match(RFC_SECRET, code, now, step)).isEqualTo(-1);
        assertThat(crypto.match(RFC_SECRET, MfaCrypto.code(RFC_SECRET, step - 2, 6), now, -1)).isEqualTo(-1);
        assertThat(crypto.match(RFC_SECRET, "12345", now, -1)).isEqualTo(-1);
    }
    @Test void ciphertextIsRandomizedAndBoundToMemberAndKey() {
        var properties = new MfaProperties();
        properties.setEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        var crypto = new MfaCrypto(properties);
        String encrypted = crypto.encrypt(RFC_SECRET, 4L);
        assertThat(encrypted).isNotEqualTo(crypto.encrypt(RFC_SECRET, 4L)).doesNotContain(RFC_SECRET);
        assertThat(crypto.decrypt(encrypted, 4L)).isEqualTo(RFC_SECRET);
        assertThatThrownBy(() -> crypto.decrypt(encrypted, 5L)).isInstanceOf(IllegalStateException.class);
        byte[] tampered = Base64.getDecoder().decode(encrypted); tampered[tampered.length - 1] ^= 1;
        assertThatThrownBy(() -> crypto.decrypt(Base64.getEncoder().encodeToString(tampered), 4L)).isInstanceOf(IllegalStateException.class);
        properties.setEncryptionKey("");
        assertThatThrownBy(() -> crypto.encrypt(RFC_SECRET, 4L)).isInstanceOf(IllegalStateException.class);
    }
}
