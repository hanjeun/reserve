package kr.it.reserve.config.oauth2;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/** 활성 회원 토큰용 키와 형식은 탈퇴 outbox/JWT/사진 키와 별개다. */
@Component
public class OAuthProviderTokenCipher {
    static final String PREFIX = "reserve-oauth:v1:";
    private static final byte[] AAD = "reserve-member-oauth-token-v1".getBytes(StandardCharsets.UTF_8);
    private final boolean encryptionEnabled;
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public OAuthProviderTokenCipher(
            @Value("${oauth.provider-tokens.encryption-enabled:false}") boolean encryptionEnabled,
            @Value("${oauth.provider-tokens.encryption-key:}") String encodedKey) {
        this.encryptionEnabled = encryptionEnabled;
        if (encodedKey == null || encodedKey.isBlank()) {
            if (encryptionEnabled) throw new IllegalStateException("OAuth provider token encryption key is required");
            key = null;
        } else {
            byte[] bytes;
            try {
                bytes = Base64.getDecoder().decode(encodedKey);
            } catch (IllegalArgumentException exception) {
                throw new IllegalStateException("OAuth provider token key must be Base64", exception);
            }
            if (bytes.length != 32) throw new IllegalStateException("OAuth provider token key must contain 32 bytes");
            key = new SecretKeySpec(bytes, "AES");
        }
    }

    public String encryptForStorage(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) return plaintext;
        // 준비 모드는 기존 로그인/탈퇴 흐름을 유지한다. 활성화는 DDL·키·복구 준비 뒤 수행한다.
        if (!encryptionEnabled) return plaintext;
        byte[] nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            byte[] ciphertext = cipher(Cipher.ENCRYPT_MODE, nonce).doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return PREFIX + encoder.encodeToString(nonce) + ":" + encoder.encodeToString(ciphertext);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("OAuth provider token encryption failed", exception);
        }
    }

    public String decryptFromStorage(String stored) {
        if (stored == null || !stored.startsWith("reserve-oauth:")) return stored;
        if (!encryptionEnabled) throw new IllegalStateException("OAuth provider token encryption cannot be disabled with encrypted rows");
        if (key == null) throw new IllegalStateException("OAuth provider token decryption key is required");
        if (!stored.startsWith(PREFIX)) throw new IllegalStateException("Unsupported OAuth provider token format");
        String[] parts = stored.substring(PREFIX.length()).split(":", -1);
        if (parts.length != 2) throw new IllegalStateException("Invalid OAuth provider token format");
        try {
            byte[] nonce = Base64.getUrlDecoder().decode(parts[0]);
            byte[] ciphertext = Base64.getUrlDecoder().decode(parts[1]);
            if (nonce.length != 12 || ciphertext.length < 16) {
                throw new IllegalArgumentException("Invalid OAuth provider token envelope");
            }
            return new String(cipher(Cipher.DECRYPT_MODE, nonce).doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw new IllegalStateException("OAuth provider token authentication failed", exception);
        }
    }

    private Cipher cipher(int mode, byte[] nonce) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(AAD);
        return cipher;
    }
}
