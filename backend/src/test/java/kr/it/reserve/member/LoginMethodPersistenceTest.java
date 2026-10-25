package kr.it.reserve.member;

import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.OAuth2UserInfo;
import kr.it.reserve.config.jwt.TokenProvider;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.*;
import kr.it.reserve.member.service.LoginMethodService;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** H2에서 실제 트랜잭션의 실패 횟수 보존·단일 소비·회원 행 보존을 확인한다. */
@SpringBootTest
class LoginMethodPersistenceTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 22, 1, 0);
    @Autowired private LoginMethodService service;
    @Autowired private MemberRepository members;
    @Autowired private LoginMethodChallengeRepository challenges;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private TokenProvider tokens;
    @Autowired private kr.it.reserve.config.jwt.repository.RefreshTokenRepository sessions;
    @Autowired private org.springframework.context.ApplicationEventPublisher events;
    @MockitoBean private EmailService emails;
    @MockitoBean private PwnedPasswordChecker pwnedPasswords;
    @MockitoBean private OAuthSubjectSecurityService subjects;
    private TransactionTemplate tx;
    private Member member;

    @BeforeEach void setUp() {
        tx = new TransactionTemplate(transactions);
        when(subjects.now()).thenReturn(NOW);
        member = tx.execute(status -> members.saveAndFlush(Member.builder().name("retained owner")
                .email("login-method-" + UUID.randomUUID() + "@example.test").role(Role.BUSINESS)
                .provider(AuthProvider.NAVER).providerId("test-" + UUID.randomUUID()).oauthAuthenticatedAt(NOW).build()));
    }
    @AfterEach void cleanOwnData() {
        tx.executeWithoutResult(status -> {
            for (var purpose : LoginMethodChallenge.Purpose.values())
                challenges.findByMemberIdAndPurpose(member.getId(), purpose).ifPresent(challenges::delete);
            challenges.flush();
            sessions.deleteByMemberId(member.getId());
            members.deleteById(member.getId());
        });
    }
    private record Code(String id, String value) { }
    private Code issue() {
        var challenge = service.sendPasswordCode(member, NOW, member.getEmail());
        ArgumentCaptor<String> value = ArgumentCaptor.forClass(String.class);
        verify(emails).sendLoginMethodVerificationEmail(anyString(), value.capture());
        return new Code(challenge.challengeId(), value.getValue());
    }
    @Test void wrongCodeAttemptsRemainCommittedAndCannotBeResetByTheThrownException() {
        Code code = issue();
        String wrong = code.value().equals("000000") ? "111111" : "000000";
        for (int count = 0; count < 5; count++) assertThatThrownBy(() ->
                service.setPassword(member, NOW, code.id(), wrong, "Password123!", "Password123!"))
                .isInstanceOf(MemberException.class);
        assertThat(challenges.findById(code.id()).orElseThrow().getAttemptCount()).isEqualTo(5);
        assertThatThrownBy(() -> service.setPassword(member, NOW, code.id(), code.value(), "Password123!", "Password123!"))
                .isInstanceOf(MemberException.class);
        assertThat(members.findById(member.getId()).orElseThrow().getPassword()).isNull();
    }
    @Test void concurrentCompletionConsumesOneCodeOnceAndKeepsTheSameBusinessMember() throws Exception {
        Code code = issue();
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> complete = () -> {
            start.await();
            try { service.setPassword(member, NOW, code.id(), code.value(), "Password123!", "Password123!"); return true; }
            catch (MemberException exception) { return false; }
        };
        try {
            Future<Boolean> first = workers.submit(complete);
            Future<Boolean> second = workers.submit(complete);
            start.countDown();
            var outcomes = java.util.List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
            Member current = members.findById(member.getId()).orElseThrow();
            assertThat(outcomes).as("single use: version=%s, password=%s, consumed=%s", current.getAuthVersion(),
                            current.getPassword() != null, challenges.findById(code.id()).orElseThrow().isConsumed())
                    .containsExactlyInAnyOrder(true, false);
        } finally { workers.shutdownNow(); }
        Member stored = members.findById(member.getId()).orElseThrow();
        assertThat(stored.getId()).isEqualTo(member.getId());
        assertThat(stored.getRole()).isEqualTo(Role.BUSINESS);
        assertThat(stored.getName()).isEqualTo("retained owner");
        assertThat(stored.getAuthVersion()).isEqualTo(1);
        assertThat(challenges.findById(code.id()).orElseThrow().isConsumed()).isTrue();
    }
    @Test void socialLinkCommitsTheProviderTokenAndConsumedChallengeAlongWithTheMember() {
        member = tx.execute(status -> {
            Member current = members.findById(member.getId()).orElseThrow();
            current.setProvider(AuthProvider.LOCAL);
            current.setProviderId(null);
            current.setEmail("login-method-" + UUID.randomUUID() + "@naver.com");
            current.setPassword(new BCryptPasswordEncoder(4).encode("Password123!"));
            return members.saveAndFlush(current);
        });
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", tokens.issueSession(member, null).accessToken()));
        String url = service.beginOAuth(member, AuthProvider.NAVER, "Password123!", false, request);
        request.setParameter("account_link", url.substring(url.indexOf('=') + 1));
        service.bindOAuth(request, OAuth2AuthorizationRequest.authorizationCode().authorizationUri("https://nid.naver.com/oauth2.0/authorize")
                .clientId("test-client").redirectUri("http://localhost/login/oauth2/code/naver").state("bound-state")
                .attributes(values -> values.put("registration_id", "naver")).build());
        request.setParameter("state", "bound-state");
        String providerId = "linked-" + UUID.randomUUID();
        var subject = mock(OAuthSubjectSecurity.class);
        when(subjects.lock(AuthProvider.NAVER, providerId)).thenReturn(subject);
        when(subject.acceptsAuthentication(NOW)).thenReturn(true);
        var info = mock(OAuth2UserInfo.class);
        when(info.getProviderId()).thenReturn(providerId);
        when(info.getEmail()).thenReturn(member.getEmail());
        service.completeOAuth(request, AuthProvider.NAVER, info, "test-provider-token", NOW, NOW.plusHours(1).toInstant(ZoneOffset.UTC));
        Member stored = members.findById(member.getId()).orElseThrow();
        assertThat(stored.getProvider()).isEqualTo(AuthProvider.NAVER);
        assertThat(stored.getProviderId()).isEqualTo(providerId);
        assertThat(stored.getOauthAccessToken()).isEqualTo("test-provider-token");
        assertThat(stored.getOauthAuthenticatedAt()).isEqualTo(NOW);
        assertThat(stored.getAuthVersion()).isEqualTo(1);
        assertThat(stored.getRole()).isEqualTo(Role.BUSINESS);
        assertThat(stored.getName()).isEqualTo("retained owner");
        assertThat(challenges.findByMemberIdAndPurpose(member.getId(), LoginMethodChallenge.Purpose.SOCIAL_LINK).orElseThrow().isConsumed()).isTrue();
    }
    @Test void withdrawalRemovesPendingLoginProofAndItsContactEmailInTheSameTransaction() {
        Code code = issue();
        tx.executeWithoutResult(status -> events.publishEvent(new kr.it.reserve.member.event.MemberWithdrawn(member.getId())));
        assertThat(challenges.findById(code.id())).isEmpty();
    }
}
