package kr.it.reserve.config.oauth2;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuthProviderTokenCipherTest {
    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void encryptsTheExistingMaximumTokenWithRandomNoncesAndAuthenticatesIt() {
        OAuthProviderTokenCipher cipher = new OAuthProviderTokenCipher(true, KEY);
        String token = "s".repeat(2048);
        String first = cipher.encryptForStorage(token);
        String second = cipher.encryptForStorage(token);

        assertThat(first).startsWith(OAuthProviderTokenCipher.PREFIX).doesNotContain(token).isNotEqualTo(second);
        assertThat(first.length()).isGreaterThan(2048);
        assertThat(cipher.decryptFromStorage(first)).isEqualTo(token);
        assertThat(cipher.decryptFromStorage(second)).isEqualTo(token);
        assertThat(cipher.decryptFromStorage("legacy-plain-token")).isEqualTo("legacy-plain-token");
    }

    @Test
    void disabledPreparationModePreservesTheCurrentLoginStorageContract() {
        OAuthProviderTokenCipher cipher = new OAuthProviderTokenCipher(false, "");
        assertThat(cipher.encryptForStorage("legacy-token")).isEqualTo("legacy-token");
        assertThat(cipher.decryptFromStorage("legacy-token")).isEqualTo("legacy-token");
        assertThat(cipher.encryptForStorage(null)).isNull();
    }

    @Test
    void enabledModeRequiresAnIndependentValidKey() {
        assertThatThrownBy(() -> new OAuthProviderTokenCipher(true, "")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new OAuthProviderTokenCipher(true, "not-base64")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new OAuthProviderTokenCipher(true, Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tamperingWrongKeyMissingKeyAndDisablingAfterMigrationFailClosed() {
        OAuthProviderTokenCipher cipher = new OAuthProviderTokenCipher(true, KEY);
        String encrypted = cipher.encryptForStorage("token");
        byte[] otherKey = new byte[32];
        otherKey[0] = 1;
        assertThatThrownBy(() -> new OAuthProviderTokenCipher(true, Base64.getEncoder().encodeToString(otherKey))
                .decryptFromStorage(encrypted)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new OAuthProviderTokenCipher(false, "").decryptFromStorage(encrypted))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new OAuthProviderTokenCipher(false, KEY).decryptFromStorage(encrypted))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> cipher.decryptFromStorage(encrypted.substring(0, encrypted.length() - 3) + "XYZ"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> cipher.decryptFromStorage("reserve-oauth:v2:unknown"))
                .isInstanceOf(IllegalStateException.class);
    }
}
