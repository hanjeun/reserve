package kr.it.reserve.member.mfa;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.time.Clock;
import java.time.Instant;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalAdminMfaResetTest {
    private MockEnvironment environment() {
        var environment = new MockEnvironment().withProperty("reserve.preview.admin-mfa-reset-once", "true")
                .withProperty("reserve.mfa.enabled", "true").withProperty("reserve.scheduling.enabled", "false")
                .withProperty("server.address", "127.0.0.1").withProperty("spring.jpa.hibernate.ddl-auto", "validate");
        environment.setActiveProfiles("local");
        return environment;
    }

    private DataSource source(String url) throws Exception {
        var source = mock(DataSource.class);
        var connection = mock(Connection.class);
        var metadata = mock(DatabaseMetaData.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getURL()).thenReturn(url);
        return source;
    }

    @Test void oneClaimRestoresTheLastCredentialGuard() throws Exception {
        var reset = new LocalAdminMfaReset(source("jdbc:mysql://127.0.0.1:3306/reserve?useSSL=false"), environment());
        assertThat(reset.available()).isTrue();
        assertThat(reset.claim()).isTrue();
        assertThat(reset.available()).isFalse();
        assertThat(reset.claim()).isFalse();
    }

    @Test void tenMinutesRestoreTheGuardWithoutAnyRequest() throws Exception {
        var clock = mock(Clock.class);
        var start = Instant.parse("2026-11-01T00:00:00Z");
        when(clock.instant()).thenReturn(start);
        var reset = new LocalAdminMfaReset(source("jdbc:mysql://localhost/reserve"), environment(), clock);
        when(clock.instant()).thenReturn(start.plusSeconds(600));
        assertThat(reset.available()).isFalse();
        assertThat(reset.claim()).isFalse();
    }

    @Test void localConfigurationGroupsDoNotEnableOtherRuntimeProfiles() throws Exception {
        var environment = environment();
        environment.setActiveProfiles("local", "secret", "common");
        assertThat(new LocalAdminMfaReset(source("jdbc:mysql://localhost/reserve"), environment).available()).isTrue();
        environment.setActiveProfiles("local", "secret", "common", "prod");
        var source = mock(DataSource.class);
        assertThatThrownBy(() -> new LocalAdminMfaReset(source, environment)).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(source);
    }

    @ParameterizedTest
    @ValueSource(strings = {"jdbc:mysql://db.internal/reserve", "jdbc:mysql://127.0.0.1/production", "jdbc:h2:mem:reserve"})
    void otherDatabasesCannotEnableTheException(String url) throws Exception {
        var source = source(url);
        assertThatThrownBy(() -> new LocalAdminMfaReset(source, environment())).isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"reserve.preview.admin-mfa-reset-once", "reserve.mfa.enabled", "server.address",
            "spring.jpa.hibernate.ddl-auto", "reserve.scheduling.enabled", "profiles"})
    void missingOrUnsafeRuntimeConditionsFailBeforeDatabaseAccess(String setting) {
        var source = mock(DataSource.class);
        var environment = environment();
        if (setting.equals("profiles")) environment.setActiveProfiles("local", "prod");
        else environment.setProperty(setting, switch (setting) {
            case "reserve.preview.admin-mfa-reset-once", "reserve.mfa.enabled" -> "false";
            case "reserve.scheduling.enabled" -> "true";
            case "server.address" -> "0.0.0.0";
            default -> "update";
        });
        assertThatThrownBy(() -> new LocalAdminMfaReset(source, environment)).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(source);
    }
}
