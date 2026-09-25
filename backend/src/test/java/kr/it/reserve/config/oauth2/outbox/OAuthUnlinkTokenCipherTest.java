package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.config.jwt.JwtProperties;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuthUnlinkTokenCipherTest {

    @Test
    void encryptsWithoutLeavingThePlainTokenAndDetectsTampering() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecretKey("test-secret-key-that-is-long-enough-for-a-stable-derived-outbox-key-1234567890");
        OAuthUnlinkTokenCipher cipher = new OAuthUnlinkTokenCipher(jwtProperties, "dedicated-test-key");
        cipher.initialize();

        String encrypted = cipher.encrypt("provider-access-token");

        assertThat(encrypted).doesNotContain("provider-access-token");
        assertThat(cipher.decrypt(encrypted)).isEqualTo("provider-access-token");

        String[] parts = encrypted.split("\\.");
        byte[] tamperedCiphertext = Base64.getUrlDecoder().decode(parts[2]);
        tamperedCiphertext[0] ^= 1;
        String tampered = parts[0] + "." + parts[1] + "."
                + Base64.getUrlEncoder().withoutPadding().encodeToString(tamperedCiphertext);

        assertThatThrownBy(() -> cipher.decrypt(tampered))
                .isInstanceOf(RuntimeException.class);
    }
}
