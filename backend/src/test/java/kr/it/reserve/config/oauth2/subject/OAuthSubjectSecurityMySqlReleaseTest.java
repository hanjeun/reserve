package kr.it.reserve.config.oauth2.subject;

import jakarta.persistence.EntityManager;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.CustomOAuth2User;
import kr.it.reserve.config.oauth2.CustomOAuth2UserService;
import kr.it.reserve.config.oauth2.OAuthProviderTokenCipher;
import kr.it.reserve.config.oauth2.OAuthProviderTokenConverter;
import kr.it.reserve.config.oauth2.OAuthSessionIssuer;
import kr.it.reserve.config.oauth2.outbox.OAuthUnlinkOutboxService;
import kr.it.reserve.config.oauth2.outbox.OAuthUnlinkTokenCipher;
import kr.it.reserve.config.oauth2.outbox.OAuthUnlinkTaskRepository;
import kr.it.reserve.config.oauth2.events.OAuthSecurityEventRepository;
import kr.it.reserve.config.oauth2.events.OAuthSecurityEventService;
import kr.it.reserve.config.oauth2.events.OAuthSecurityEventTransaction;
import kr.it.reserve.config.oauth2.events.VerifiedOAuthSecurityEvent;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import kr.it.reserve.member.service.MemberWithdrawalService;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.repository.FileDeletionTaskRepository;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.util.AopTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** One disposable, synthetic MySQL fixture. No restored data, provider API or real account is accepted. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_OAUTH_TEST_ISOLATED", matches = "1")
@DataJpaTest(showSql = false, properties = {
        "oauth.provider-tokens.encryption-enabled=true",
        "oauth.provider-tokens.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({OAuthProviderTokenCipher.class, OAuthProviderTokenConverter.class, CustomOAuth2UserService.class,
        OAuthSessionIssuer.class, TokenProvider.class, OAuthSecurityEventTransaction.class,
        OAuthSecurityEventService.class, MemberService.class, MemberWithdrawalService.class,
        OAuthUnlinkOutboxService.class, OAuthUnlinkTokenCipher.class, FileDeletionOutboxService.class,
        OAuthSubjectSecurityMySqlReleaseTest.Fixture.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class OAuthSubjectSecurityMySqlReleaseTest {
    private static final Instant NOW = Instant.parse("2026-10-16T01:00:00Z");
    private static final String SUBJECT = "synthetic-oauth-subject";
    @Autowired CustomOAuth2UserService login;
    @Autowired OAuthSessionIssuer issuer;
    @Autowired OAuthSecurityEventService receiver;
    @Autowired OAuthSecurityEventRepository events;
    @Autowired OAuthSubjectSecurityRepository subjects;
    @Autowired CoordinatedSubjects subjectLocks;
    @Autowired MutableClock clock;
    @Autowired RefreshTokenRepository refreshTokens;
    @Autowired TokenProvider tokens;
    @Autowired MemberWithdrawalService withdrawal;
    @Autowired OAuthUnlinkTaskRepository unlinkTasks;
    @Autowired FileDeletionTaskRepository fileTasks;
    @MockitoSpyBean MemberService core;
    @MockitoSpyBean MemberRepository members;
    @MockitoBean PasswordEncoder passwordEncoder;
    @MockitoBean EmailVerificationService emailVerification;
    @MockitoBean FileStorageService storage;
    @MockitoBean DataLifecycleGuard lifecycle;
    @MockitoBean PwnedPasswordChecker compromisedPasswords;
    @Autowired PlatformTransactionManager transactions;
    @Autowired EntityManager entityManager;
    @Autowired JdbcTemplate jdbc;
    private final AtomicReference<Runnable> afterNextFlush = new AtomicReference<>();
    private MockRestServiceServer provider;

    @TestConfiguration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JwtProperties.class)
    static class Fixture {
        @Bean MutableClock oauthFixtureClock() { return new MutableClock(); }
        @Bean CoordinatedSubjects oauthFixtureSubjects(OAuthSubjectSecurityRepository repository, MutableClock clock) {
            return new CoordinatedSubjects(repository, clock);
        }
    }

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_OAUTH_TEST_URL");
        String user = required("RESERVE_MYSQL_OAUTH_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_oauth_[a-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalArgumentException("OAuth tests require a loopback disposable database with the reserved prefix");
        }
        if (!user.matches("reserve_oauth_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("OAuth tests require a dedicated restricted synthetic test account");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_OAUTH_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @BeforeEach
    void setUp() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.45");
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() "
                + "AND table_name = 'member' AND index_name = 'idx_member_oauth_subject'", Integer.class)).isEqualTo(3);
        subjectLocks.beforeNextLock(null);
        subjectLocks.afterNextLock(null);
        afterNextFlush.set(null);
        reset(members, core);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            unlinkTasks.deleteAllInBatch();
            fileTasks.deleteAllInBatch();
            refreshTokens.deleteAllInBatch();
            events.deleteAllInBatch();
            subjects.deleteAllInBatch();
            members.deleteAllInBatch();
        });
        clock.time.set(NOW);
        doAnswer(invocation -> {
            // The actual SimpleJpaRepository.flush operation, with a post-INSERT coordination point.
            entityManager.flush();
            Runnable action = afterNextFlush.getAndSet(null);
            if (action != null) action.run();
            return null;
        }).when(members).flush();
        RestTemplate rest = new RestTemplate();
        provider = MockRestServiceServer.createServer(rest);
        provider.expect(ExpectedCount.manyTimes(), requestTo("https://provider.invalid/userinfo"))
                .andRespond(withSuccess("{\"sub\":\"" + SUBJECT + "\",\"email\":\"synthetic-oauth@example.invalid\",\"name\":\"fixture\"}", APPLICATION_JSON));
        // DefaultOAuth2UserService's final setter cannot be intercepted on the transaction proxy.
        CustomOAuth2UserService target = AopTestUtils.getUltimateTargetObject(login);
        target.setRestOperations(rest);
    }

    @AfterEach void noProviderNetworkWasUsed() { if (provider != null) provider.verify(); }

    @Test
    void eventHoldingTheMissingSubjectFirstRejectsTheInflightSignupButAllowsASameSecondFreshAuthentication() throws Exception {
        BlockingPoint eventHeld = new BlockingPoint();
        CountDownLatch loginAttempted = new CountDownLatch(1);
        subjectLocks.afterNextLock(eventHeld::pause);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Future<?> event = pool.submit(() -> receiver.receive(event("event-first", NOW)));
            try {
                reached(eventHeld.reached, event);
                subjectLocks.beforeNextLock(loginAttempted::countDown);
                Future<CustomOAuth2User> inflight = pool.submit(() -> authenticate(NOW.minusSeconds(30), NOW.plusSeconds(3600)));
                reached(loginAttempted, inflight);
                assertThat(inflight.isDone()).isFalse();
                eventHeld.release.countDown();
                event.get(10, TimeUnit.SECONDS);
                assertThatThrownBy(() -> inflight.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(OAuth2AuthenticationException.class);
            } finally { eventHeld.release.countDown(); }
        }
        assertThat(members.count()).isZero();
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> {
            assertThat(subject.getRevokedAt()).isEqualTo(time(NOW));
            assertThat(subject.getLastAuthenticatedAt()).isNull();
        });
        CustomOAuth2User fresh = authenticate(NOW.plusMillis(500), NOW.plusSeconds(3600));
        var pair = issuer.issue(fresh);
        assertThat(tokens.getOAuthAuthenticationAt(pair.accessToken())).isEqualTo(time(NOW.plusMillis(500)));
        assertThat(tokens.getActiveMemberFromToken(pair.accessToken()).getId()).isEqualTo(fresh.getId());
        assertThat(members.count()).isEqualTo(1);
    }

    @Test
    void anUncommittedMemberInsertHoldingTheSubjectIsSeenAndRevokedByTheWaitingEvent() throws Exception {
        BlockingPoint inserted = new BlockingPoint();
        CountDownLatch eventAttempted = new CountDownLatch(1);
        afterNextFlush.set(inserted::pause);
        CustomOAuth2User principal;
        try (var pool = Executors.newFixedThreadPool(2)) {
            Future<CustomOAuth2User> signup = pool.submit(() -> authenticate(NOW.minusSeconds(30), NOW.plusSeconds(3600)));
            try {
                reached(inserted.reached, signup);
                subjectLocks.beforeNextLock(eventAttempted::countDown);
                Future<?> event = pool.submit(() -> receiver.receive(event("login-first", NOW)));
                reached(eventAttempted, event);
                assertThat(event.isDone()).isFalse();
                inserted.release.countDown();
                principal = signup.get(10, TimeUnit.SECONDS);
                event.get(10, TimeUnit.SECONDS);
            } finally { inserted.release.countDown(); }
        }
        Member retained = members.findById(principal.getId()).orElseThrow();
        assertThat(retained.getOauthAccessToken()).isNull();
        assertThat(retained.getAuthVersion()).isEqualTo(1);
        assertThat(retained.getOauthSecurityRevokedAt()).isEqualTo(time(NOW));
        assertThat(retained.getDeletedAt()).isNull();
        // The success handler may run after loadUser committed; it must not recreate a refresh row.
        assertThatThrownBy(() -> issuer.issue(principal)).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(refreshTokens.count()).isZero();
        assertThat(events.count()).isEqualTo(1);
    }

    @Test
    void tokenExpiringAfterInsertFlushRollsBackTheMemberAndNewSubjectStateTogether() {
        afterNextFlush.set(() -> clock.time.set(NOW.plusSeconds(2)));

        assertThatThrownBy(() -> authenticate(NOW, NOW.plusSeconds(1))).isInstanceOf(OAuth2AuthenticationException.class);

        assertThat(members.count()).isZero();
        assertThat(subjects.count()).isZero();
        assertThat(events.count()).isZero();
        assertThat(refreshTokens.count()).isZero();
    }

    @Test
    void lockWaitCannotExtendTheTenMinuteTokenExchangeLimit() throws Exception {
        BlockingPoint eventHeld = new BlockingPoint();
        CountDownLatch loginAttempted = new CountDownLatch(1);
        subjectLocks.afterNextLock(eventHeld::pause);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Future<?> event = pool.submit(() -> receiver.receive(event("age-boundary", NOW.minusSeconds(1200))));
            try {
                reached(eventHeld.reached, event);
                subjectLocks.beforeNextLock(loginAttempted::countDown);
                Future<?> loginResult = pool.submit(() -> authenticate(NOW.minusSeconds(599), NOW.plusSeconds(3600)));
                reached(loginAttempted, loginResult);
                clock.time.set(NOW.plusSeconds(2));
                eventHeld.release.countDown();
                event.get(10, TimeUnit.SECONDS);
                assertThatThrownBy(() -> loginResult.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(OAuth2AuthenticationException.class);
            } finally { eventHeld.release.countDown(); }
        }
        assertThat(members.count()).isZero();
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> assertThat(subject.getLastAuthenticatedAt()).isNull());
    }

    @Test
    void aNewerLegacyAuthenticationHydratesAnEmptySubjectAndThePrincipalCannotBorrowALaterAuthentication() {
        CustomOAuth2User old = authenticate(NOW.minusSeconds(30), NOW.plusSeconds(3600));
        // Simulate the lazy cutover from a pre-subject state using only synthetic data.
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            subjects.deleteAllInBatch();
            Member member = members.findActiveByIdForUpdate(old.getId()).orElseThrow();
            member.setOauthAuthenticatedAt(time(NOW.plusMillis(500)));
            member.setOauthAccessToken("fresh-provider-token");
        });
        receiver.receive(event("late-before-fresh-login", NOW));

        Member fresh = members.findById(old.getId()).orElseThrow();
        assertThat(fresh.getAuthVersion()).isZero();
        assertThat(fresh.getOauthAccessToken()).isEqualTo("fresh-provider-token");
        assertThat(fresh.getOauthSecurityRevokedAt()).isEqualTo(time(NOW));
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> {
            assertThat(subject.getLastAuthenticatedAt()).isEqualTo(time(NOW.plusMillis(500)));
            assertThat(subject.getRevokedAt()).isEqualTo(time(NOW));
        });
        old.getMember().setOauthAuthenticatedAt(time(NOW.plusMillis(500)));
        assertThatThrownBy(() -> issuer.issue(old)).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(refreshTokens.count()).isZero();
    }

    @Test
    void ownWithdrawalPersistsIdentityErasureAndBlocksTheOldAuthenticationFromRecreatingAMember() {
        CustomOAuth2User principal = authenticate(NOW.minusSeconds(30), NOW.plusSeconds(3600));
        addSyntheticProfile(principal.getId());

        withdrawal.withdraw(principal.getMember(), principal.getOauthAuthentication().authenticatedAt());

        Member retained = members.findById(principal.getId()).orElseThrow();
        assertThat(retained.getDeletedAt()).isNotNull();
        assertThat(retained.getProviderId()).isNull();
        assertThat(retained.getOauthAccessToken()).isNull();
        assertThat(retained.getEmail()).isEqualTo("withdrawn-" + principal.getId() + "@reserve.invalid");
        assertThat(unlinkTasks.count()).isEqualTo(1);
        assertThat(fileTasks.count()).isEqualTo(1);
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> assertThat(subject.getRevokedAt()).isEqualTo(time(NOW)));
        assertThatThrownBy(() -> authenticate(NOW.minusSeconds(1), NOW.plusSeconds(3600)))
                .isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(members.count()).isEqualTo(1);
        CustomOAuth2User fresh = authenticate(NOW.plusMillis(500), NOW.plusSeconds(3600));
        assertThat(fresh.getId()).isNotEqualTo(principal.getId());
        assertThat(members.count()).isEqualTo(2);
    }

    @Test
    void failureAfterTheRealWithdrawalBodyRollsBackIdentityCutoffAndBothOutboxesTogether() {
        CustomOAuth2User principal = authenticate(NOW.minusSeconds(30), NOW.plusSeconds(3600));
        addSyntheticProfile(principal.getId());
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("Synthetic failure after the real withdrawal body");
        }).when(core).deleteMember(principal.getId());

        assertThatThrownBy(() -> withdrawal.withdraw(principal.getMember(), principal.getOauthAuthentication().authenticatedAt()))
                .isInstanceOf(IllegalStateException.class).hasMessage("Synthetic failure after the real withdrawal body");

        Member retained = members.findById(principal.getId()).orElseThrow();
        assertThat(retained.getDeletedAt()).isNull();
        assertThat(retained.getProviderId()).isEqualTo(SUBJECT);
        assertThat(retained.getOauthAccessToken()).isEqualTo("synthetic-provider-token");
        assertThat(unlinkTasks.count()).isZero();
        assertThat(fileTasks.count()).isZero();
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> assertThat(subject.getRevokedAt()).isNull());
    }

    private void addSyntheticProfile(Long memberId) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> members.findActiveByIdForUpdate(memberId)
                .orElseThrow().setProfileImage("https://cdn.invalid/synthetic/profile.webp"));
    }

    private CustomOAuth2User authenticate(Instant issuedAt, Instant expiresAt) {
        ClientRegistration client = ClientRegistration.withRegistrationId("google").clientId("synthetic-client")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://127.0.0.1/unused-callback").authorizationUri("https://provider.invalid/authorize")
                .tokenUri("https://provider.invalid/token").userInfoUri("https://provider.invalid/userinfo")
                .userNameAttributeName("sub").scope("profile").build();
        return (CustomOAuth2User) login.loadUser(new OAuth2UserRequest(client,
                new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "synthetic-provider-token", issuedAt, expiresAt)));
    }

    private VerifiedOAuthSecurityEvent event(String id, Instant time) {
        return new VerifiedOAuthSecurityEvent(AuthProvider.GOOGLE, id, time,
                List.of(new VerifiedOAuthSecurityEvent.Action(SUBJECT, true)));
    }

    private static LocalDateTime time(Instant time) { return LocalDateTime.ofInstant(time, ZoneOffset.UTC); }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated OAuth test setting: " + key);
        return value;
    }

    private static void reached(CountDownLatch point, Future<?> task) throws Exception {
        if (!point.await(5, TimeUnit.SECONDS)) {
            task.get(1, TimeUnit.SECONDS);
            throw new IllegalStateException("OAuth fixture did not reach its coordination point");
        }
    }

    static final class BlockingPoint {
        final CountDownLatch reached = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        void pause() {
            reached.countDown();
            try {
                if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("OAuth fixture timed out holding its lock");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("OAuth fixture was interrupted", exception);
            }
        }
    }

    static class CoordinatedSubjects extends OAuthSubjectSecurityService {
        final AtomicReference<Runnable> beforeNextLock = new AtomicReference<>();
        final AtomicReference<Runnable> afterNextLock = new AtomicReference<>();
        CoordinatedSubjects(OAuthSubjectSecurityRepository repository, Clock clock) { super(repository, clock); }
        void beforeNextLock(Runnable callback) { beforeNextLock.set(callback); }
        void afterNextLock(Runnable callback) { afterNextLock.set(callback); }
        @Override @Transactional(propagation = Propagation.MANDATORY)
        public OAuthSubjectSecurity lock(AuthProvider provider, String providerId) {
            Runnable before = beforeNextLock.getAndSet(null);
            if (before != null) before.run();
            OAuthSubjectSecurity subject = super.lock(provider, providerId);
            Runnable after = afterNextLock.getAndSet(null);
            if (after != null) after.run();
            return subject;
        }
    }

    static class MutableClock extends Clock {
        final AtomicReference<Instant> time = new AtomicReference<>(NOW);
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) {
            if (!ZoneOffset.UTC.equals(zone)) throw new IllegalArgumentException("The OAuth fixture uses UTC only");
            return this;
        }
        @Override public Instant instant() { return time.get(); }
    }
}
