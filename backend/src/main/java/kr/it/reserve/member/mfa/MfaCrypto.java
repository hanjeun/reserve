package kr.it.reserve.member.mfa;

import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;

@Component
public final class MfaCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private final MfaProperties properties;
    public MfaCrypto(MfaProperties properties) { this.properties = properties; }

    public String randomToken() {
        byte[] value = new byte[32];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
    public static String digest(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(hash);
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("SHA-256 unavailable", e); }
    }
    public String newTotpSecret() {
        byte[] value = new byte[20];
        RANDOM.nextBytes(value);
        StringBuilder encoded = new StringBuilder(32);
        int buffer = 0, bits = 0;
        for (byte b : value) {
            buffer = buffer << 8 | b & 255;
            bits += 8;
            while (bits >= 5) { bits -= 5; encoded.append(BASE32.charAt(buffer >>> bits & 31)); }
        }
        return encoded.toString();
    }
    private static byte[] decode(String secret) {
        if (secret == null || !secret.matches("[A-Z2-7]{32}")) throw new IllegalArgumentException("Invalid TOTP secret");
        byte[] result = new byte[20];
        int buffer = 0, bits = 0, offset = 0;
        for (char c : secret.toCharArray()) {
            buffer = buffer << 5 | BASE32.indexOf(c);
            bits += 5;
            if (bits >= 8) { bits -= 8; result[offset++] = (byte) (buffer >>> bits); }
        }
        return result;
    }
    static String code(String secret, long step, int digits) {
        if (step < 0 || digits != 6 && digits != 8) throw new IllegalArgumentException("Invalid TOTP parameters");
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(decode(secret), "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 15;
            int number = (hash[offset] & 127) << 24 | (hash[offset + 1] & 255) << 16
                    | (hash[offset + 2] & 255) << 8 | hash[offset + 3] & 255;
            int modulus = digits == 6 ? 1_000_000 : 100_000_000;
            return String.format(Locale.ROOT, "%0" + digits + "d", number % modulus);
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("TOTP unavailable", e); }
    }
    public long match(String secret, String supplied, Instant now, long consumedStep) {
        if (supplied == null || !supplied.matches("[0-9]{6}")) return -1;
        long current = Math.floorDiv(now.getEpochSecond(), 30);
        for (long step = current + 1; step >= Math.max(0, current - 1); step--) {
            if (step > consumedStep && MessageDigest.isEqual(code(secret, step, 6).getBytes(StandardCharsets.US_ASCII),
                    supplied.getBytes(StandardCharsets.US_ASCII))) return step;
        }
        return -1;
    }
    private byte[] key() {
        try {
            byte[] key = Base64.getDecoder().decode(properties.getEncryptionKey());
            if (key.length != 32) throw new IllegalArgumentException();
            return key;
        } catch (IllegalArgumentException e) { throw new IllegalStateException("MFA encryption key is not configured"); }
    }
    public String encrypt(String plaintext, Long memberId) {
        try {
            byte[] nonce = new byte[12];
            RANDOM.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(("RESERVE:MFA:" + memberId).getBytes(StandardCharsets.UTF_8));
            byte[] body = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + body.length).put(nonce).put(body).array());
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("MFA encryption failed"); }
    }
    public String decrypt(String ciphertext, Long memberId) {
        try {
            byte[] packed = Base64.getDecoder().decode(ciphertext);
            if (packed.length < 29 || packed.length > 256) throw new IllegalArgumentException();
            byte[] nonce = java.util.Arrays.copyOfRange(packed, 0, 12);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(("RESERVE:MFA:" + memberId).getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(packed, 12, packed.length - 12), StandardCharsets.UTF_8);
        } catch (java.security.GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("MFA decryption failed");
        }
    }
}
