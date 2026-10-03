import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;

/** Synthetic images and random test-only keys; never loads a real secret. */
public final class VerifyChatImageRecoveryTest {
    private interface Checked { void run() throws Exception; }

    private static void rejects(Class<? extends Exception> expected, Checked operation) throws Exception {
        try { operation.run(); }
        catch (Exception failure) {
            if (expected.isInstance(failure)) return;
            throw failure;
        }
        throw new AssertionError("Expected verification to reject the input");
    }

    public static void main(String[] args) throws Exception {
        byte[] key = new byte[32];
        byte[] iv = new byte[12];
        SecureRandom random = new SecureRandom();
        random.nextBytes(key); random.nextBytes(iv);
        String aad = "users/7/chat/9";
        var image = new BufferedImage(2, 3, BufferedImage.TYPE_INT_RGB);
        image.setRGB(1, 2, 0x3399ff);
        var output = new ByteArrayOutputStream();
        if (!ImageIO.write(image, "png", output)) throw new AssertionError("PNG writer unavailable");
        byte[] plaintext = output.toByteArray();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
        byte[] body = cipher.doFinal(plaintext);
        byte[] encrypted = new byte[iv.length + body.length];
        System.arraycopy(iv, 0, encrypted, 0, iv.length);
        System.arraycopy(body, 0, encrypted, iv.length, body.length);
        String hash = VerifyChatImageRecovery.sha256(encrypted);
        var result = VerifyChatImageRecovery.verify(encrypted, key, aad, hash, plaintext.length, 2, 3, "image/png");
        if (!result.plaintextSha256().equals(VerifyChatImageRecovery.sha256(plaintext))) throw new AssertionError("Recovered bytes differ");
        byte[] wrongKey = key.clone(); wrongKey[0] ^= 1;
        rejects(AEADBadTagException.class, () -> VerifyChatImageRecovery.verify(encrypted, wrongKey, aad, hash, plaintext.length, 2, 3, "image/png"));
        rejects(AEADBadTagException.class, () -> VerifyChatImageRecovery.verify(encrypted, key, "users/8/chat/9", hash, plaintext.length, 2, 3, "image/png"));
        byte[] tampered = encrypted.clone(); tampered[tampered.length - 1] ^= 1;
        rejects(AEADBadTagException.class, () -> VerifyChatImageRecovery.verify(tampered, key, aad, VerifyChatImageRecovery.sha256(tampered), plaintext.length, 2, 3, "image/png"));
        rejects(IllegalArgumentException.class, () -> VerifyChatImageRecovery.verify(encrypted, key, aad, "0".repeat(64), plaintext.length, 2, 3, "image/png"));
        rejects(IllegalArgumentException.class, () -> VerifyChatImageRecovery.verify(encrypted, key, aad, hash, plaintext.length + 1, 2, 3, "image/png"));
        rejects(IllegalArgumentException.class, () -> VerifyChatImageRecovery.verify(encrypted, key, aad, hash, plaintext.length, 3, 3, "image/png"));
        rejects(IllegalArgumentException.class, () -> VerifyChatImageRecovery.verify(encrypted, key, aad, hash, plaintext.length, 2, 3, "image/jpeg"));
        Arrays.fill(key, (byte) 0); Arrays.fill(wrongKey, (byte) 0); Arrays.fill(plaintext, (byte) 0);
        System.out.println("PASS: recovered pixels/bytes and seven rejection cases (key, AAD, tag, hash, length, dimensions, MIME)");
    }
}
