package kr.it.reserve.tools;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** Fork the standalone helper so its logging and fixture state never affect other application tests. */
@Timeout(90)
class ServiceAdmissionPreparationToolTest {
    @Test
    void previewAndInputContractsNeverRequireRedis() throws Exception {
        run(false);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "RESERVE_SERVICE_ADMISSION_HELPER_REDIS_TEST", matches = "1")
    void ownedRedisPreservesLiveStateAndRefusesUnsafePreparation() throws Exception {
        run(true);
    }

    private void run(boolean ownedRedis) throws Exception {
        var command = new java.util.ArrayList<String>();
        command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        command.add("-Xmx256m");
        command.add("--class-path");
        command.add(System.getProperty("reserve.toolTestClasspath", System.getProperty("java.class.path")));
        command.add("kr.it.reserve.tools.PrepareServiceAdmissionTest");
        if (ownedRedis) command.add("--owned-redis");
        var builder = new ProcessBuilder(command).redirectErrorStream(true);
        var environment = builder.environment();
        var inherited = new java.util.HashMap<>(environment);
        environment.clear();
        for (String key : java.util.List.of("PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA")) {
            if (inherited.containsKey(key)) environment.put(key, inherited.get(key));
        }
        // The opt-in fixture uses the local default Docker engine; remote connection variables are excluded.
        if (ownedRedis) {
            environment.put("DOCKER_CONTEXT", "default");
            String owner = inherited.get("RESERVE_ISOLATED_TEST_OWNER");
            if (owner != null) {
                if (!owner.matches("[0-9a-f]{32}")) throw new IllegalArgumentException("Invalid isolated fixture owner");
                environment.put("RESERVE_ISOLATED_TEST_OWNER", owner);
            }
        }
        Process process = builder.start();
        var output = CompletableFuture.supplyAsync(() -> {
            try { return process.getInputStream().readNBytes(8193); }
            catch (java.io.IOException exception) { throw new IllegalStateException("Helper output unavailable"); }
        });
        try {
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).as("Standalone helper contract timeout").isTrue();
            byte[] bytes = output.get(5, TimeUnit.SECONDS);
            assertThat(bytes.length).as("Bounded standalone helper output").isLessThanOrEqualTo(8192);
            assertThat(process.exitValue()).as("Standalone helper contracts; raw output withheld").isZero();
            String result = new String(bytes, StandardCharsets.UTF_8).trim();
            assertThat(result).matches("SERVICE_ADMISSION_HELPER_CONTRACTS checks=[1-9][0-9]* ownedRedis=" + ownedRedis);
        } finally {
            // Let an owned Redis fixture run its finally block before terminating a stalled child.
            if (process.isAlive() && !process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroy();
                if (!process.waitFor(5, TimeUnit.SECONDS)) process.destroyForcibly();
            }
        }
    }
}
