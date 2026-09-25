package kr.it.reserve.config.oauth2.outbox;

import jakarta.annotation.PostConstruct;
import kr.it.reserve.config.jwt.JwtProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** outbox에 잠시 보관할 OAuth 토큰을 목적 분리 키로 AES-GCM 암호화한다. */
@Component
public class OAuthUnlinkTokenCipher {

    private static final String VERSION = "v1";
    private static final byte[] PURPOSE = "reserve-oauth-unlink-outbox-v1".getBytes(StandardCharsets.UTF_8);
    private static final int NONCE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    private final JwtProperties jwtProperties;
    private final String configuredKey;
    private final SecureRandom secureRandom = new SecureRandom();
    private SecretKeySpec secretKey;

    public OAuthUnlinkTokenCipher(
            JwtProperties jwtProperties,
            @Value("${oauth.unlink.encryption-key:}") String configuredKey) {
        this.jwtProperties = jwtProperties;
        this.configuredKey = configuredKey;
    }

    @PostConstruct
    public void initialize() {
        try {
            String source = configuredKey == null || configuredKey.isBlank()
                    ? jwtProperties.getSecretKey()
                    : configuredKey;
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(source.getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(PURPOSE);
            secretKey = new SecretKeySpec(digest.digest(), "AES");
        } catch (Exception exception) {
            throw new IllegalStateException("OAuth unlink encryption could not be initialized", exception);
        }
    }

    public String encrypt(String value) {
        if (value == null || value.isBlank()) return null;
        ensureInitialized();
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            secureRandom.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(PURPOSE);
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return VERSION + "." + encoder.encodeToString(nonce) + "." + encoder.encodeToString(ciphertext);
        } catch (Exception exception) {
            throw new IllegalStateException("OAuth unlink token encryption failed", exception);
        }
    }

    public String decrypt(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            throw new IllegalArgumentException("Encrypted OAuth unlink token is missing");
        }
        ensureInitialized();
        try {
            String[] parts = encoded.split("\\.", -1);
            if (parts.length != 3 || !VERSION.equals(parts[0])) {
                throw new IllegalArgumentException("Unsupported OAuth unlink token format");
            }
            Base64.Decoder decoder = Base64.getUrlDecoder();
            byte[] nonce = decoder.decode(parts[1]);
            byte[] ciphertext = decoder.decode(parts[2]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(PURPOSE);
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("OAuth unlink token decryption failed", exception);
        }
    }

    private void ensureInitialized() {
        if (secretKey == null) throw new IllegalStateException("OAuth unlink encryption is not initialized");
    }
}
