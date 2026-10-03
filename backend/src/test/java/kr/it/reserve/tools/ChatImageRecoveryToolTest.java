package kr.it.reserve.tools;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class ChatImageRecoveryToolTest {
    @TempDir Path temporary;

    @Test
    void verifiesSyntheticPixelsAndRejectsSevenIntegrityFailures() {
        assertThatCode(() -> VerifyChatImageRecoveryTest.main(new String[0])).doesNotThrowAnyException();
    }

    @Test
    void acceptsHiddenKeyInputAndErasesItsCharacters() throws Exception {
        try (Fixture fixture = fixture("png")) {
            char[] input = fixture.encodedKey();
            assertThat(VerifyChatImageRecovery.run(fixture.args(), () -> input)).isZero();
            assertThat(input).containsOnly('\0');
        }
    }

    @Test
    void rejectsCancelledOrMalformedKeysAndErasesReadCharacters() throws Exception {
        try (Fixture fixture = fixture("png")) {
            assertThat(VerifyChatImageRecovery.run(fixture.args(), () -> null)).isEqualTo(1);
            for (char[] input : new char[][] {{'é'}, {'!'}, Base64.getEncoder().encodeToString(new byte[16]).toCharArray()}) {
                assertThat(VerifyChatImageRecovery.run(fixture.args(), () -> input)).isEqualTo(1);
                assertThat(input).containsOnly('\0');
            }
        }
    }

    @Test
    void rejectsUnsafeMetadataAndArgumentsBeforeReadingAnyKey() throws Exception {
        assertThat(VerifyChatImageRecovery.run(new String[0], () -> {
            throw new AssertionError("A key must not be read for usage errors");
        })).isEqualTo(2);
        try (Fixture fixture = fixture("png")) {
            for (String[] change : new String[][] {
                    {"0", temporary.resolve("missing.bin").toString()}, {"1", "invalid-context"},
                    {"2", "invalid-hash"}, {"2", "0".repeat(64)}, {"3", "invalid-number"},
                    {"3", "0"}, {"3", "-1"}, {"3", "8388609"},
                    {"4", "0"}, {"4", "8000001"}, {"5", "0"}, {"6", "image/gif"}}) {
                String[] args = fixture.args().clone();
                args[Integer.parseInt(change[0])] = change[1];
                rejectsBeforeKeyRead(args);
            }
            Path oversized = temporary.resolve("oversized.bin");
            Files.write(oversized, new byte[8 * 1024 * 1024 + 29]);
            String[] args = fixture.args().clone();
            args[0] = oversized.toString();
            rejectsBeforeKeyRead(args);
        }
    }

    @Test
    void acceptsJpegAndRejectsAuthenticatedUnsupportedContent() throws Exception {
        for (String format : new String[] {"jpeg", "gif", "raw"}) {
            try (Fixture fixture = fixture(format)) {
                char[] input = fixture.encodedKey();
                int expected = format.equals("jpeg") ? 0 : 1;
                assertThat(VerifyChatImageRecovery.run(fixture.args(), () -> input)).isEqualTo(expected);
                assertThat(input).containsOnly('\0');
            }
        }
    }

    @Test
    void refusesNoninteractiveKeyInputWithoutReadingAKey() throws Exception {
        try (Fixture fixture = fixture("png")) {
            var command = new java.util.ArrayList<String>();
            command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
            String agent = System.getProperty("reserve.schemaToolAgent");
            if (agent != null) {
                command.add("-javaagent:" + agent + "=includes=kr.it.reserve.tools.VerifyChatImageRecovery*,destfile="
                        + System.getProperty("reserve.schemaToolExecutionData"));
            }
            command.add("--class-path");
            command.add(System.getProperty("reserve.toolTestClasspath"));
            command.add("kr.it.reserve.tools.VerifyChatImageRecovery");
            command.addAll(Arrays.asList(fixture.args()));
            Path log = temporary.resolve("cli.log");
            var process = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            assertThat(process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(process.exitValue()).isEqualTo(1);
            assertThat(Files.readString(log)).contains("FAIL (IllegalStateException)").doesNotContain("PASS:");
        }
    }

    private static void rejectsBeforeKeyRead(String[] args) {
        assertThat(VerifyChatImageRecovery.run(args, () -> {
            throw new AssertionError("A key must not be read for invalid public inputs");
        })).isEqualTo(1);
    }

    private Fixture fixture(String format) throws Exception {
        ImageIO.setUseCache(false);
        byte[] plaintext;
        if (format.equals("raw")) {
            plaintext = new byte[] {1, 2, 3, 4};
        } else {
            var image = new BufferedImage(2, 3, BufferedImage.TYPE_INT_RGB);
            var output = new ByteArrayOutputStream();
            assertThat(ImageIO.write(image, format, output)).isTrue();
            image.flush();
            plaintext = output.toByteArray();
        }
        byte[] key = new byte[32];
        byte[] iv = new byte[12];
        var random = new SecureRandom();
        random.nextBytes(key);
        random.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        String aad = "users/7/chat/9";
        cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
        byte[] body = cipher.doFinal(plaintext);
        byte[] ciphertext = new byte[iv.length + body.length];
        System.arraycopy(iv, 0, ciphertext, 0, iv.length);
        System.arraycopy(body, 0, ciphertext, iv.length, body.length);
        Path file = temporary.resolve("fixture-" + format + ".bin");
        Files.write(file, ciphertext);
        String[] args = {file.toString(), aad, VerifyChatImageRecovery.sha256(ciphertext),
                Integer.toString(plaintext.length), "2", "3", format.equals("jpeg") ? "image/jpeg" : "image/png"};
        Arrays.fill(plaintext, (byte) 0);
        return new Fixture(key, args);
    }

    private record Fixture(byte[] key, String[] args) implements AutoCloseable {
        char[] encodedKey() { return Base64.getEncoder().encodeToString(key).toCharArray(); }
        @Override public void close() { Arrays.fill(key, (byte) 0); }
    }
}
