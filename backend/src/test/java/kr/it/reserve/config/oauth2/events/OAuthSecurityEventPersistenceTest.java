package kr.it.reserve.config.oauth2.events;

import jakarta.persistence.EntityManager;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.OAuthProviderTokenCipher;
import kr.it.reserve.config.oauth2.OAuthProviderTokenConverter;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** 실제 H2 트랜잭션/unique/행 잠금 및 Hibernate converter 경계. 외부 공급자는 호출하지 않는다. */
@DataJpaTest(showSql = false, properties = {
        "oauth.provider-tokens.encryption-enabled=true",
        "oauth.provider-tokens.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.jpa.show-sql=false",
        "spring.datasource.url=jdbc:h2:mem:oauth-security-events;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({OAuthProviderTokenCipher.class, OAuthProviderTokenConverter.class,
        OAuthSecurityEventTransaction.class, OAuthSecurityEventService.class, OAuthSubjectSecurityService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class OAuthSecurityEventPersistenceTest {
    private static final Instant NOW = Instant.parse("2026-10-16T01:00:00Z");
    @Autowired private OAuthSecurityEventService service;
    @Autowired private OAuthSecurityEventRepository events;
    @Autowired private OAuthSubjectSecurityRepository subjects;
    @MockitoSpyBean private MemberRepository members;
    @MockitoBean private RefreshTokenRepository refreshTokens;
    @Autowired private EntityManager entityManager;
    @Autowired private PlatformTransactionManager transactionManager;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        reset(refreshTokens, members);
        tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            events.deleteAllInBatch();
            subjects.deleteAllInBatch();
            members.deleteAllInBatch();
        });
    }

    @Test
    void hibernateStoresTheFullTokenEncryptedAndReadsLegacyPlaintextWithoutLosingIt() {
        Long id = create(AuthProvider.GOOGLE, "same-subject", "t".repeat(2048), NOW.minusSeconds(60));
        assertThat(storedToken(id)).startsWith("reserve-oauth:v1:").hasSizeGreaterThan(2048);
        assertThat(members.findById(id).orElseThrow().getOauthAccessToken()).isEqualTo("t".repeat(2048));

        tx.executeWithoutResult(status -> entityManager.createNativeQuery(
                "UPDATE member SET oauth_access_token = 'legacy-token' WHERE member_id = :id").setParameter("id", id).executeUpdate());
        assertThat(members.findById(id).orElseThrow().getOauthAccessToken()).isEqualTo("legacy-token");
        tx.executeWithoutResult(status -> members.findActiveByIdForUpdate(id).orElseThrow().setName("updated"));
        assertThat(storedToken(id)).startsWith("reserve-oauth:v1:");
        assertThat(members.findById(id).orElseThrow().getOauthAccessToken()).isEqualTo("legacy-token");
    }

    @Test
    void revocationKeepsTheMemberAndIdentityWhileDuplicateDeliveryIsANoop() {
        Long id = create(AuthProvider.KAKAO, "same-subject", "kakao-token", NOW.minusSeconds(60));
        VerifiedOAuthSecurityEvent event = event(AuthProvider.KAKAO, "one-event", NOW);

        service.receive(event);
        service.receive(event);

        Member member = members.findById(id).orElseThrow();
        assertThat(member.getAuthVersion()).isEqualTo(8);
        assertThat(member.getOauthSecurityRevokedAt()).isEqualTo(LocalDateTime.ofInstant(NOW, ZoneOffset.UTC));
        assertThat(member.getOauthAccessToken()).isNull();
        assertThat(member.getProvider()).isEqualTo(AuthProvider.KAKAO);
        assertThat(member.getProviderId()).isEqualTo("same-subject");
        assertThat(member.getEmail()).isEqualTo("KAKAO-same-subject@example.test");
        assertThat(member.getRole()).isEqualTo(Role.BUSINESS);
        assertThat(member.getDeletedAt()).isNull();
        assertThat(events.findAll()).singleElement().extracting(OAuthSecurityEventRecord::getOutcome).isEqualTo("APPLIED");
        verify(refreshTokens, times(1)).deleteByMemberId(id);
    }

    @Test
    void providerAndExactSubjectDoNotMatchOtherMembersWithTheSameProviderOrSubject() {
        Long target = create(AuthProvider.GOOGLE, "same-subject", "target-token", NOW.minusSeconds(60));
        Long otherProvider = create(AuthProvider.KAKAO, "same-subject", "other-provider-token", NOW.minusSeconds(60));
        Long otherSubject = create(AuthProvider.GOOGLE, "other-subject", "other-member-token", NOW.minusSeconds(60));

        service.receive(event(AuthProvider.GOOGLE, "targeted", NOW));

        assertThat(members.findById(target).orElseThrow().getAuthVersion()).isEqualTo(8);
        assertThat(members.findById(otherProvider).orElseThrow().getAuthVersion()).isEqualTo(7);
        assertThat(members.findById(otherSubject).orElseThrow().getAuthVersion()).isEqualTo(7);
        assertThat(members.findById(otherProvider).orElseThrow().getOauthAccessToken()).isEqualTo("other-provider-token");
        assertThat(members.findById(otherSubject).orElseThrow().getOauthAccessToken()).isEqualTo("other-member-token");
        verify(refreshTokens, times(1)).deleteByMemberId(target);
    }

    @Test
    void aFailureRollsBackBothTheInboxAndTheAuthVersionSoRedeliveryCanSucceed() {
        Long id = create(AuthProvider.GOOGLE, "same-subject", "provider-token", NOW.minusSeconds(60));
        VerifiedOAuthSecurityEvent event = event(AuthProvider.GOOGLE, "retry-after-database-failure", NOW);
        doThrow(new DataAccessResourceFailureException("Database temporarily unavailable"))
                .when(refreshTokens).deleteByMemberId(id);

        assertThatThrownBy(() -> service.receive(event)).isInstanceOf(DataAccessResourceFailureException.class);
        assertThat(events.count()).isZero();
        assertThat(subjects.count()).isZero();
        assertThat(members.findById(id).orElseThrow().getAuthVersion()).isEqualTo(7);
        assertThat(members.findById(id).orElseThrow().getOauthAccessToken()).isEqualTo("provider-token");

        reset(refreshTokens);
        service.receive(event);
        assertThat(events.count()).isEqualTo(1);
        assertThat(members.findById(id).orElseThrow().getAuthVersion()).isEqualTo(8);
    }

    @Test
    void concurrentDuplicateDeliveryCommitsOneRevocation() throws Exception {
        Long id = create(AuthProvider.GOOGLE, "same-subject", "provider-token", NOW.minusSeconds(60));
        VerifiedOAuthSecurityEvent event = event(AuthProvider.GOOGLE, "concurrent-event", NOW);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { await(start); service.receive(event); });
            var second = pool.submit(() -> { await(start); service.receive(event); });
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        }
        assertThat(events.count()).isEqualTo(1);
        assertThat(members.findById(id).orElseThrow().getAuthVersion()).isEqualTo(8);
        verify(refreshTokens, times(1)).deleteByMemberId(id);
    }

    @Test
    void aLegacyMemberAuthenticationNewerThanTheEmptySubjectStateProtectsItFromAnOldEvent() {
        Long id = create(AuthProvider.GOOGLE, "same-subject", "fresh-token", NOW);

        service.receive(event(AuthProvider.GOOGLE, "late-old-event", NOW.minusSeconds(60)));

        Member member = members.findById(id).orElseThrow();
        assertThat(member.getAuthVersion()).isEqualTo(7);
        assertThat(member.getOauthAccessToken()).isEqualTo("fresh-token");
        assertThat(events.findAll()).singleElement().extracting(OAuthSecurityEventRecord::getOutcome).isEqualTo("APPLIED");
        assertThat(member.getOauthSecurityRevokedAt()).isEqualTo(LocalDateTime.ofInstant(NOW.minusSeconds(60), ZoneOffset.UTC));
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> {
            assertThat(subject.getLastAuthenticatedAt()).isEqualTo(LocalDateTime.ofInstant(NOW, ZoneOffset.UTC));
            assertThat(subject.getRevokedAt()).isEqualTo(LocalDateTime.ofInstant(NOW.minusSeconds(60), ZoneOffset.UTC));
        });
        verifyNoInteractions(refreshTokens);
    }

    @Test
    void anEventBeforeTheFirstMemberExistsPersistsTheCutoffWithoutCreatingOrDeletingAccounts() {
        service.receive(event(AuthProvider.NAVER, "first-unlink", NOW));
        service.receive(event(AuthProvider.NAVER, "first-unlink", NOW));

        assertThat(members.count()).isZero();
        assertThat(subjects.findAll()).singleElement().satisfies(subject -> {
            assertThat(subject.getProvider()).isEqualTo("NAVER");
            assertThat(subject.getSubjectKey()).doesNotContain("same-subject").hasSize(64);
            assertThat(subject.getLastAuthenticatedAt()).isNull();
            assertThat(subject.getRevokedAt()).isEqualTo(LocalDateTime.ofInstant(NOW, ZoneOffset.UTC));
            assertThat(subject.acceptsAuthentication(LocalDateTime.ofInstant(NOW, ZoneOffset.UTC))).isFalse();
        });
        assertThat(events.findAll()).singleElement().extracting(OAuthSecurityEventRecord::getOutcome).isEqualTo("APPLIED");
        verifyNoInteractions(refreshTokens);
    }

    private Long create(AuthProvider provider, String subject, String token, Instant authenticatedAt) {
        return tx.execute(status -> members.saveAndFlush(Member.builder()
                .name("retained member").email(provider + "-" + subject + "@example.test")
                .role(Role.BUSINESS).provider(provider).providerId(subject).oauthAccessToken(token)
                .oauthAuthenticatedAt(LocalDateTime.ofInstant(authenticatedAt, ZoneOffset.UTC)).authVersion(7).build()).getId());
    }

    private String storedToken(Long memberId) {
        return (String) entityManager.createNativeQuery("SELECT oauth_access_token FROM member WHERE member_id = :id")
                .setParameter("id", memberId).getSingleResult();
    }

    private VerifiedOAuthSecurityEvent event(AuthProvider provider, String id, Instant occurredAt) {
        return new VerifiedOAuthSecurityEvent(provider, id, occurredAt,
                List.of(new VerifiedOAuthSecurityEvent.Action("same-subject", true)));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for the fixture");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Fixture interrupted", exception);
        }
    }
}
