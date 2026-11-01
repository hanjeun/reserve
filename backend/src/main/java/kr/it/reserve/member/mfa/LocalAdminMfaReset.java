package kr.it.reserve.member.mfa;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/** 격리된 로컬 프리뷰에서 기존 인증을 마친 관리자의 마지막 수단 해제만 한 번 허용해요. */
@Component
@Slf4j
@Profile("local")
@ConditionalOnProperty(name = "reserve.preview.admin-mfa-reset-once", havingValue = "true")
public final class LocalAdminMfaReset {
    private final AtomicBoolean used = new AtomicBoolean();
    private final Clock clock;
    private final Instant expiresAt;

    @Autowired
    public LocalAdminMfaReset(DataSource source, Environment environment) throws SQLException {
        this(source, environment, Clock.systemUTC());
    }

    LocalAdminMfaReset(DataSource source, Environment environment, Clock clock) throws SQLException {
        var profiles = Arrays.asList(environment.getActiveProfiles());
        if (!profiles.contains("local") || !Set.of("local", "secret", "common").containsAll(profiles)
                || !environment.getProperty("reserve.preview.admin-mfa-reset-once", Boolean.class, false)
                || !environment.getProperty("reserve.mfa.enabled", Boolean.class, false)
                || environment.getProperty("reserve.scheduling.enabled", Boolean.class, true)
                || !"127.0.0.1".equals(environment.getProperty("server.address"))
                || !"validate".equals(environment.getProperty("spring.jpa.hibernate.ddl-auto"))) {
            throw new IllegalStateException("One-time admin MFA reset requires an isolated local preview");
        }
        try (var connection = source.getConnection()) {
            if (!connection.getMetaData().getURL().matches("jdbc:mysql://(127\\.0\\.0\\.1|localhost)(:[0-9]+)?/reserve(\\?.*)?"))
                throw new IllegalStateException("One-time admin MFA reset requires the loopback reserve database");
        }
        this.clock = clock;
        this.expiresAt = clock.instant().plus(Duration.ofMinutes(10));
        log.info("One-time local admin MFA reset armed for 10 minutes");
    }

    public boolean available() { return !used.get() && clock.instant().isBefore(expiresAt); }
    public boolean claim() {
        boolean accepted = clock.instant().isBefore(expiresAt) && used.compareAndSet(false, true);
        if (accepted) log.info("One-time local admin MFA reset claimed");
        return accepted;
    }
}
