package kr.it.reserve.tools;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.GeneralSecurityException;
import java.security.NoSuchAlgorithmException;
import java.io.IOException;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.function.Supplier;

/** Offline recovery verification. Reads the key only from a person's hidden console input. */
public final class VerifyChatImageRecovery {
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final int IV_BYTES = 12;
    private static final int TAG_BYTES = 16;

    record ExpectedImage(int bytes, int width, int height, String mime) {}

    record Result(int bytes, int width, int height, String mime, String plaintextSha256) {}

    private VerifyChatImageRecovery() {}

    public static void main(String[] args) {
        System.exit(run(args, VerifyChatImageRecovery::readHiddenKey));
    }

    private static char[] readHiddenKey() {
        var console = System.console();
        if (console == null) {
            throw new IllegalStateException("An interactive console is required; no key was read");
        }
        return console.readPassword("Paste the separately stored CHAT_IMAGE_ENCRYPTION_KEY (hidden): ");
    }

    static int run(String[] args, Supplier<char[]> hiddenKeyInput) {
        try {
            if (args.length != 7) {
                System.err.println("Usage: java scripts/java/kr/it/reserve/tools/VerifyChatImageRecovery.java <cipher-file> <AAD> <cipher-SHA256> <plain-bytes> <width> <height> <image/png|image/jpeg>");
                return 2;
            }
            Path path = Path.of(args[0]);
            if (Files.size(path) > MAX_BYTES + IV_BYTES + TAG_BYTES) {
                throw new IllegalArgumentException("Ciphertext exceeds the recovery limit");
            }
            byte[] ciphertext = Files.readAllBytes(path);
            int bytes = Integer.parseInt(args[3]);
            int width = Integer.parseInt(args[4]);
            int height = Integer.parseInt(args[5]);
            ExpectedImage expected = new ExpectedImage(bytes, width, height, args[6]);
            validateInput(ciphertext, args[1], args[2], expected);
            char[] encodedKey = hiddenKeyInput.get();
            byte[] ascii = null;
            byte[] key = null;
            try {
                if (encodedKey == null) throw new IllegalArgumentException("Key input was cancelled");
                ascii = new byte[encodedKey.length];
                for (int i = 0; i < encodedKey.length; i++) {
                    if (encodedKey[i] > 127) throw new IllegalArgumentException("Key must be base64 ASCII");
                    ascii[i] = (byte) encodedKey[i];
                }
                key = Base64.getDecoder().decode(ascii);
                Result result = verify(ciphertext, key, args[1], args[2], expected);
                System.out.printf("PASS: S3 ciphertext hash, AES-256-GCM authentication, and decoded image match.%nbytes=%d width=%d height=%d mime=%s plaintext_sha256=%s%nNo plaintext image or key file was written.%n",
                        result.bytes(), result.width(), result.height(), result.mime(), result.plaintextSha256());
            } finally {
                if (encodedKey != null) Arrays.fill(encodedKey, '\0');
                if (ascii != null) Arrays.fill(ascii, (byte) 0);
                if (key != null) Arrays.fill(key, (byte) 0);
            }
            return 0;
        } catch (Exception failure) {
            // Do not print exception messages: input or provider messages could contain a secret.
            System.err.printf("FAIL (%s): recovery verification did not complete. No plaintext was written.%n", failure.getClass().getSimpleName());
            return 1;
        }
    }

    static Result verify(byte[] ciphertext, byte[] key, String aad, String expectedSha256,
                         ExpectedImage expected) throws GeneralSecurityException, IOException {
        validateInput(ciphertext, aad, expectedSha256, expected);
        int expectedBytes = expected.bytes();
        int width = expected.width();
        int height = expected.height();
        String mime = expected.mime();
        if (key.length != 32) throw new IllegalArgumentException("AES-256 requires a 32-byte decoded key");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(TAG_BYTES * 8, Arrays.copyOf(ciphertext, IV_BYTES)));
        cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
        byte[] plaintext = cipher.doFinal(ciphertext, IV_BYTES, ciphertext.length - IV_BYTES);
        ImageIO.setUseCache(false);
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(plaintext))) {
            if (plaintext.length != expectedBytes) throw new IllegalArgumentException("Plaintext length mismatch");
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IllegalArgumentException("No supported image decoder");
            ImageReader reader = readers.next();
            BufferedImage image = null;
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                String decodedMime = switch (format) {
                    case "png" -> "image/png";
                    case "jpeg", "jpg" -> "image/jpeg";
                    default -> throw new IllegalArgumentException("Unsupported image format");
                };
                if (!decodedMime.equals(mime) || reader.getWidth(0) != width || reader.getHeight(0) != height) {
                    throw new IllegalArgumentException("Decoded image metadata mismatch");
                }
                image = reader.read(0);
                if (image == null) throw new IllegalArgumentException("Image decoding failed");
                return new Result(plaintext.length, image.getWidth(), image.getHeight(), decodedMime, sha256(plaintext));
            } finally {
                if (image != null) image.flush();
                reader.dispose();
            }
        } finally {
            Arrays.fill(plaintext, (byte) 0);
        }
    }

    private static void validateInput(byte[] ciphertext, String aad, String hash, ExpectedImage expected)
            throws NoSuchAlgorithmException {
        int bytes = expected.bytes();
        int width = expected.width();
        int height = expected.height();
        String mime = expected.mime();
        if (!aad.matches("users/\\d+/chat/\\d+") || !hash.matches("[a-fA-F0-9]{64}")) {
            throw new IllegalArgumentException("Invalid expected context or hash");
        }
        if (bytes < 1 || bytes > MAX_BYTES || ciphertext.length != bytes + IV_BYTES + TAG_BYTES) {
            throw new IllegalArgumentException("Ciphertext and declared plaintext lengths do not match");
        }
        if (width < 1 || height < 1 || (long) width * height > 16_000_000L
                || !(mime.equals("image/png") || mime.equals("image/jpeg"))) {
            throw new IllegalArgumentException("Unsupported or excessive image metadata");
        }
        if (!sha256(ciphertext).equalsIgnoreCase(hash)) throw new IllegalArgumentException("Ciphertext hash mismatch");
    }

    static String sha256(byte[] bytes) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
}
