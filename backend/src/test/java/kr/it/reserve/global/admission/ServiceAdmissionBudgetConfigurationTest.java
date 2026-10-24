package kr.it.reserve.global.admission;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pure configuration contracts; never opens an application context, Redis, DB, or worker. */
class ServiceAdmissionBudgetConfigurationTest {
    @Test
    void commonAndProductionBindingsRemainDisabledAndUseTheSameConservativeDefaults() throws Exception {
        var environment = environment();
        var properties = bind(environment);
        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.getAutomatic().isEnabled()).isFalse();
        assertThat(properties.getAutomatic().getMemoryPressureMib()).isEqualTo(128);
        assertThat(properties.getAutomatic().getRecoverySeconds()).isEqualTo(120);
        assertThat(properties.getCapacity()).isEqualTo(20);
        assertThat(properties.getMaxWaiting()).isEqualTo(1000);
        assertThat(properties.getSessionSeconds()).isEqualTo(900);
        assertThat(properties.getMaxSessionSeconds()).isEqualTo(7200);
        assertThat(properties.getHeartbeatTimeoutSeconds()).isEqualTo(90);
        properties.validate();
        properties.setEnabled(true);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);

        // Only controlled in-memory values resolve placeholders; real process secrets are never read.
        environment.getPropertySources().addFirst(new MapPropertySource("explicit-operator-input", Map.of(
                "RESERVE_SERVICE_ADMISSION_ENABLED", "true", "RESERVE_SERVICE_ADMISSION_CAPACITY", "7",
                "RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED", "true",
                "RESERVE_SERVICE_ADMISSION_MAX_WAITING", "77", "RESERVE_SERVICE_ADMISSION_EPOCH", "11111111-1111-4111-8111-111111111111")));
        var explicit = bind(environment);
        explicit.validate();
        assertThat(explicit.isEnabled()).isTrue();
        assertThat(explicit.getAutomatic().isEnabled()).isTrue();
        assertThat(explicit.getCapacity()).isEqualTo(7);
        assertThat(explicit.getMaxWaiting()).isEqualTo(77);
    }

    @Test
    void redisComposePinsMemoryPolicyAndPreservesCredentialAndNetworkFences() throws Exception {
        for (String file : List.of("docker-compose-redis.yml", "docker-compose-local-redis.yml")) {
            Map<String, Object> service = composeService(file, "redis");
            assertThat(service.get("command")).isEqualTo(List.of("redis-server", "/usr/local/etc/redis/redis.conf",
                    "--maxmemory", "64mb", "--maxmemory-policy", "noeviction"));
            assertThat(service.get("mem_limit")).isEqualTo("128m");
            assertThat(service.get("memswap_limit")).isEqualTo("128m");
            assertThat(service.get("image").toString()).matches("redis:8\\.2\\.9-alpine@sha256:[0-9a-f]{64}");
            assertThat(service.get("read_only")).isEqualTo(true);
            var volume = (Map<?, ?>) ((List<?>) service.get("volumes")).getFirst();
            assertThat(volume.get("source").toString()).contains("${RESERVE_REDIS_CONFIG_PATH:?");
            assertThat(volume.get("target")).isEqualTo("/usr/local/etc/redis/redis.conf");
            assertThat(volume.get("read_only")).isEqualTo(true);
            if (file.equals("docker-compose-redis.yml")) {
                assertThat(service).doesNotContainKey("ports");
                assertThat(((Map<?, ?>) volume.get("bind")).get("create_host_path")).isEqualTo(false);
            } else assertThat(service.get("ports")).isEqualTo(List.of("127.0.0.1:6379:6379"));
        }
    }

    @Test
    void bothDeploymentColorsForwardTheSameDisabledAdmissionInputs() throws Exception {
        for (String color : List.of("blue", "green")) {
            Map<String, Object> service = composeService("docker-compose-" + color + ".yml", color);
            var inputs = ((List<?>) service.get("environment")).stream().map(Object::toString)
                    .filter(value -> value.startsWith("RESERVE_SERVICE_ADMISSION_")).toList();
            assertThat(inputs).containsExactlyInAnyOrder(
                    "RESERVE_SERVICE_ADMISSION_ENABLED=${RESERVE_SERVICE_ADMISSION_ENABLED:-false}",
                    "RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED=${RESERVE_SERVICE_ADMISSION_AUTOMATIC_ENABLED:-false}",
                    "RESERVE_SERVICE_ADMISSION_CAPACITY=${RESERVE_SERVICE_ADMISSION_CAPACITY:-20}",
                    "RESERVE_SERVICE_ADMISSION_SESSION_SECONDS=${RESERVE_SERVICE_ADMISSION_SESSION_SECONDS:-900}",
                    "RESERVE_SERVICE_ADMISSION_MAX_SESSION_SECONDS=${RESERVE_SERVICE_ADMISSION_MAX_SESSION_SECONDS:-7200}",
                    "RESERVE_SERVICE_ADMISSION_HEARTBEAT_TIMEOUT_SECONDS=${RESERVE_SERVICE_ADMISSION_HEARTBEAT_TIMEOUT_SECONDS:-90}",
                    "RESERVE_SERVICE_ADMISSION_MAX_WAITING=${RESERVE_SERVICE_ADMISSION_MAX_WAITING:-1000}",
                    "RESERVE_SERVICE_ADMISSION_EPOCH=${RESERVE_SERVICE_ADMISSION_EPOCH:-}");
        }
    }

    private static MockEnvironment environment() throws Exception {
        var environment = new MockEnvironment();
        var loader = new YamlPropertySourceLoader();
        for (String file : List.of("application-prod.yml", "application-common.yml")) {
            for (var source : loader.load(file, new ClassPathResource(file))) environment.getPropertySources().addLast(source);
        }
        return environment;
    }

    private static ServiceAdmissionProperties bind(MockEnvironment environment) {
        return Binder.get(environment).bind("reserve.service-admission", Bindable.of(ServiceAdmissionProperties.class)).get();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> composeService(String file, String service) throws Exception {
        Path root = Path.of("").toAbsolutePath();
        if (root.getFileName().toString().equals("backend")) root = root.getParent();
        var options = new LoaderOptions(); options.setAllowDuplicateKeys(false);
        try (var input = Files.newInputStream(root.resolve(file))) {
            Map<String, Object> document = new Yaml(new SafeConstructor(options)).load(input);
            return (Map<String, Object>) ((Map<?, ?>) document.get("services")).get(service);
        }
    }
}
