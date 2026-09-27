package kr.it.reserve.chat.service;

import kr.it.reserve.global.error.ChatException;
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

/** S3/공개 CDN은 암호문만 받는다. 전용 키는 JWT/AWS 키와 분리하고 바꾸기 전 기존 사진을 재암호화한다. */
@Component
public class ChatImageCipher {
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public ChatImageCipher(@Value("${chat.images.encryption-key:}") String encodedKey) {
        if (encodedKey == null || encodedKey.isBlank()) {
            key = null;
        } else {
            byte[] bytes = Base64.getDecoder().decode(encodedKey);
            if (bytes.length != 32) throw new IllegalArgumentException("Chat image key must contain 32 decoded bytes");
            key = new SecretKeySpec(bytes, "AES");
        }
    }

    public boolean isEnabled() { return key != null; }

    public byte[] encrypt(byte[] plaintext, String context) {
        requireKey();
        byte[] iv = new byte[12];
        random.nextBytes(iv);
        try {
            byte[] encrypted = cipher(Cipher.ENCRYPT_MODE, iv, context).doFinal(plaintext);
            return ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Chat image encryption failed", exception);
        }
    }

    public byte[] decrypt(byte[] encrypted, String context) {
        requireKey();
        if (encrypted == null || encrypted.length < 28) throw new IllegalArgumentException("Invalid encrypted chat image");
        try {
            ByteBuffer buffer = ByteBuffer.wrap(encrypted);
            byte[] iv = new byte[12];
            buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);
            return cipher(Cipher.DECRYPT_MODE, iv, context).doFinal(ciphertext);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Chat image authentication failed", exception);
        }
    }

    private Cipher cipher(int mode, byte[] iv, String context) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, iv));
        cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
        return cipher;
    }

    public void requireKey() {
        if (key == null) throw new ChatException("사진 첨부 기능을 준비 중입니다.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
