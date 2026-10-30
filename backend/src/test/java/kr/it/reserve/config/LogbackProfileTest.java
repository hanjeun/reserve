package kr.it.reserve.config;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.core.status.Status;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.LoggingInitializationContext;
import org.springframework.boot.logging.logback.LogbackLoggingSystem;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import static org.assertj.core.api.Assertions.assertThat;

class LogbackProfileTest {
    @TempDir Path directory;

    @ParameterizedTest
    @ValueSource(strings = {"", "local", "prod", "blue", "green"})
    void keepsConsoleEverywhereAndFileLoggingOnlyInProduction(String profile) throws Exception {
        var environment = new MockEnvironment();
        if (!profile.isEmpty()) environment.setActiveProfiles(profile);
        String config;
        try (var source = new ClassPathResource("logback-spring.xml").getInputStream()) {
            config = new String(source.readAllBytes(), StandardCharsets.UTF_8);
        }
        Path configFile = directory.resolve("logback-spring.xml");
        Files.writeString(configFile, config.replace("/var/log/reserve", directory.toString().replace('\\', '/')));
        var context = (LoggerContext) LoggerFactory.getILoggerFactory();
        var system = new LogbackLoggingSystem(getClass().getClassLoader());
        context.reset();
        context.getStatusManager().clear();
        try {
            system.beforeInitialize();
            system.initialize(new LoggingInitializationContext(environment), configFile.toUri().toString(), null);
            Logger root = context.getLogger(Logger.ROOT_LOGGER_NAME);
            var appenders = new ArrayList<String>();
            root.iteratorForAppenders().forEachRemaining(value -> appenders.add(value.getName()));
            boolean production = profile.equals("prod") || profile.equals("blue") || profile.equals("green");
            assertThat(appenders).containsExactlyElementsOf(production ? java.util.List.of("CONSOLE", "FILE") : java.util.List.of("CONSOLE"));
            assertThat(context.getStatusManager().getCopyOfStatusList())
                    .filteredOn(value -> value.getLevel() >= Status.WARN).isEmpty();
            assertThat(Files.exists(directory.resolve("app.log"))).isEqualTo(production);
        } finally {
            system.cleanUp();
            context.stop();
        }
    }
}
