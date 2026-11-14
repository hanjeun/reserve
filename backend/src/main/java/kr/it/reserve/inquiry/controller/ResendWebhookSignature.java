package kr.it.reserve.inquiry.controller;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.regex.Pattern;

final class ResendWebhookSignature {
    private static final String KEY_PREFIX = "whsec_";
    private static final String HMAC = "HmacSHA256";
    private static final Pattern MESSAGE_ID = Pattern.compile("[A-Za-z0-9_-]{1,128}");
    private static final Pattern TIMESTAMP = Pattern.compile("[0-9]{1,16}");
    private static final long MAX_DRIFT_SECONDS = 300;
    private final SecretKeySpec key;

    ResendWebhookSignature(String secret) {
        byte[] bytes = decodeSecret(secret);
        if (bytes.length < 16) throw new IllegalStateException("A valid Resend webhook signing secret is required");
        key = new SecretKeySpec(bytes, HMAC);
    }

    private static byte[] decodeSecret(String secret) {
        if (!secret.startsWith(KEY_PREFIX)) return new byte[0];
        try {
            return Base64.getDecoder().decode(secret.substring(KEY_PREFIX.length()));
        } catch (IllegalArgumentException invalid) {
            return new byte[0];
        }
    }

    boolean matches(String id, String timestamp, String signature, byte[] body) {
        if (id == null || !MESSAGE_ID.matcher(id).matches()
                || timestamp == null || !TIMESTAMP.matcher(timestamp).matches()
                || signature == null || signature.length() > 1024) return false;
        if (Math.abs(Instant.now().getEpochSecond() - Long.parseLong(timestamp)) > MAX_DRIFT_SECONDS) return false;

        byte[] expected = sign(id + "." + timestamp + ".", body);
        for (String candidate : signature.strip().split("\\s+")) {
            if (candidate.startsWith("v1,") && MessageDigest.isEqual(expected,
                    candidate.substring(3).getBytes(StandardCharsets.US_ASCII))) return true;
        }
        return false;
    }

    // Svix는 재직렬화한 JSON이 아닌 원본 바이트를 서명한다.
    private byte[] sign(String prefix, byte[] body) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(key);
            mac.update(prefix.getBytes(StandardCharsets.US_ASCII));
            return Base64.getEncoder().encode(mac.doFinal(body));
        } catch (GeneralSecurityException unavailable) {
            throw new IllegalStateException("Resend webhook signature verification is unavailable");
        }
    }
}
