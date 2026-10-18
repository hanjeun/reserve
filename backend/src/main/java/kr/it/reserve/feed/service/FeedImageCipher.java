package kr.it.reserve.feed.service;

import kr.it.reserve.feed.FeedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/** 피드 전용 키와 AAD. 채팅/JWT 키를 폴백으로 사용하지 않는다. */
@Component
public class FeedImageCipher {
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();
    public FeedImageCipher(@Value("${FEED_IMAGE_ENCRYPTION_KEY:}") String encodedKey) {
        if (encodedKey == null || encodedKey.isBlank()) key = null;
        else {
            byte[] bytes = Base64.getDecoder().decode(encodedKey);
            if (bytes.length != 32) throw new IllegalArgumentException("Feed image key must contain 32 decoded bytes");
            key = new SecretKeySpec(bytes, "AES");
        }
    }
    public boolean isEnabled() { return key != null; }
    public void requireKey() {
        if (key == null) throw new FeedException("피드 사진 첨부를 준비 중이에요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    public byte[] encrypt(byte[] bytes, String context) {
        requireKey(); byte[] iv = new byte[12]; random.nextBytes(iv);
        try {
            byte[] encrypted = cipher(Cipher.ENCRYPT_MODE, iv, context).doFinal(bytes);
            return ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array();
        } catch (GeneralSecurityException exception) { throw new IllegalStateException("Feed image encryption failed", exception); }
    }
    public byte[] decrypt(byte[] bytes, String context) {
        requireKey();
        if (bytes == null || bytes.length < 28) throw new IllegalArgumentException("Invalid encrypted feed image");
        ByteBuffer buffer = ByteBuffer.wrap(bytes); byte[] iv = new byte[12]; buffer.get(iv);
        byte[] encrypted = new byte[buffer.remaining()]; buffer.get(encrypted);
        try { return cipher(Cipher.DECRYPT_MODE, iv, context).doFinal(encrypted); }
        catch (GeneralSecurityException exception) { throw new IllegalStateException("Feed image authentication failed", exception); }
    }
    private Cipher cipher(int mode, byte[] iv, String context) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, iv)); cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8)); return cipher;
    }
}
