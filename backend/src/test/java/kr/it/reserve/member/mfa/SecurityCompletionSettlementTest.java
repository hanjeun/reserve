package kr.it.reserve.member.mfa;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.*;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.LoginMethodService;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.entity.*;
import kr.it.reserve.payment.repository.*;
import kr.it.reserve.payment.service.*;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.*;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:security-completion-test;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
        "reserve.mfa.enabled=true", "reserve.mfa.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "reserve.settlement.test-enabled=true"})
class SecurityCompletionSettlementTest {
    private static final String PASSWORD_HASH = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("fixture-password");
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @Autowired MfaService mfa;
    @Autowired MfaCrypto crypto;
    @Autowired MfaProperties properties;
    @Autowired MfaChallengeRepository challenges;
    @Autowired MfaRecoveryCodeRepository recovery;
    @Autowired MfaCredentialRepository credentials;
    @Autowired TokenProvider tokens;
    @Autowired MemberRepository members;
    @Autowired kr.it.reserve.member.service.MemberService memberService;
    @Autowired kr.it.reserve.member.repository.PasswordResetTokenRepository passwordResets;
    @Autowired kr.it.reserve.global.ratelimit.RateLimiter limiter;
    @Autowired LoginMethodService loginMethods;
    @Autowired OAuthSessionIssuer oauthSessions;
    @Autowired OAuth2AuthenticationSuccessHandler oauthSuccess;
    @Autowired OAuthSubjectSecurityService subjects;
    @Autowired TokenService tokenService;
    @Autowired RefreshTokenRepository sessions;
    @Autowired ReservationRepository reservations;
    @Autowired ReservationService reservationService;
    @Autowired ReservationAutoCompletion completion;
    @Autowired PaymentRepository payments;
    @Autowired RefundAttemptRepository attempts;
    @Autowired TestSettlementPayoutRepository payouts;
    @Autowired TestSettlementService settlement;
    @Autowired ObjectMapper json;
    @MockitoBean PortoneService pg;
    @MockitoBean EmailService email;
    @MockitoBean kr.it.reserve.global.security.PwnedPasswordChecker passwordBreaches;
    @MockitoBean LocalAdminMfaReset localAdminReset;
    private TransactionTemplate tx;
    private Member owner, customer;
    private Long storeId, reservationId, paymentId;
    private String merchantUid;
    @BeforeEach void fixture() {
        tx = new TransactionTemplate(transactions);
        tx.executeWithoutResult(ignored -> {
            owner = member(Role.BUSINESS);
            customer = member(Role.USER);
            Store store = Store.builder().name("합성 가게").owner(owner).noShowDeposit(10000).autoCompletionEnabled(true).build();
            em.persist(store); storeId=store.getId();
            Reservation reservation = Reservation.builder().member(customer).store(store).reservationCode(UUID.randomUUID().toString().substring(0,20))
                    .reservationDate(ServiceTime.today()).reservationTime(LocalTime.NOON).guestCount(1)
                    .status(Reservation.ReservationStatus.CONFIRMED).depositAmount(10000).depositPaid(true)
                    .autoCompletionEnabled(true).attendanceRefundEnabled(true).usageEndsAt(ServiceTime.now().minusMinutes(1)).build();
            em.persist(reservation); reservationId=reservation.getId();
            merchantUid="fixture-"+UUID.randomUUID();
            Payment payment = Payment.builder().member(customer).reservation(reservation).merchantUid(merchantUid).amount(10000)
                    .refundAmount(0).status(Payment.PaymentStatus.PAID).paidAt(LocalDateTime.now(Clock.systemUTC()))
                    .verifiedChannelType("TEST").verifiedChannelId("fixture-channel").verifiedDisputed(false).verifiedStoreId("fixture-store").build();
            em.persist(payment); paymentId=payment.getId();
        });
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void loginPreferenceSurvivesEnrollmentAndRejectsTicketSuffixChanges(boolean persistent) {
        administrator(owner);
        var pending = mfa.beginLogin(current(owner), null, null, persistent);
        assertThat(pending.persistent()).isEqualTo(persistent);
        String altered = pending.value().substring(0, pending.value().length() - 1) + (persistent ? "0" : "1");
        assertThatThrownBy(() -> mfa.status(altered, null, null)).isInstanceOf(AuthException.class);
        var setup = mfa.beginTotp(pending.value(), null, null);
        String code = MfaCrypto.code(setup.secret(), Instant.now().getEpochSecond() / 30, 6);
        mfa.confirmTotp(pending.value(), null, null, code);
        var result = mfa.finish(pending.value(), null, null).session();
        assertThat(result.persistent()).isEqualTo(persistent);
        assertThat(tokens.verifyAuthentication(result.accessToken()).persistent()).isEqualTo(persistent);
        assertThat(tokens.inspectRefreshToken(result.refreshToken()).persistence()).isEqualTo(persistent);
        assertThatThrownBy(() -> mfa.finish(pending.value(), null, null)).isInstanceOf(AuthException.class);
    }
    @Test void passwordlessPendingLoginKeepsTheSessionChoiceAndCanBeCancelled() {
        var pending = mfa.beginPasskeyLogin(false);
        assertThat(MfaService.Ticket.valid(pending.value())).isTrue();
        assertThat(pending.persistent()).isFalse();
        assertThat(mfa.status(pending.value(), null, null).purpose()).isEqualTo("PASSKEY_LOGIN");
        mfa.cancel(pending.value());
        assertThatThrownBy(() -> mfa.status(pending.value(), null, null)).isInstanceOf(AuthException.class);
    }
    @Test void managedFactorsRequireFreshProofAndStayBoundToTheOriginalSession() {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(Role.ADMIN));
        var enrollment=enroll(owner);
        var session=tokens.verifyAuthentication(enrollment.session().accessToken());
        var manage=mfa.beginManage(current(owner),session.sessionId(),null,null);
        assertThatThrownBy(()->mfa.status(manage.value(),current(owner),"wrong-session")).isInstanceOf(AuthException.class);
        String code=MfaCrypto.code(enrollment.secret(),Instant.now().getEpochSecond()/30+1,6);
        assertThat(mfa.verify(manage.value(),current(owner),session.sessionId(),"TOTP",code).view().verified()).isTrue();
        assertThatThrownBy(()->mfa.disable(manage.value(),current(owner),session.sessionId())).isInstanceOf(AuthException.class);
        String last = mfa.settings(current(owner)).credentials().getFirst().id();
        assertThatThrownBy(() -> mfa.remove(manage.value(), current(owner), session.sessionId(), last)).isInstanceOf(AuthException.class);
        mfa.cancel(manage.value());
        assertThatThrownBy(()->mfa.status(manage.value(),current(owner),session.sessionId())).isInstanceOf(AuthException.class);
    }
    @Test void oauthPendingTicketCannotOutlivePrimaryProof() {
        tx.executeWithoutResult(ignored->{
            var member=members.findById(owner.getId()).orElseThrow(); member.setProvider(AuthProvider.GOOGLE);
            member.setRole(Role.ADMIN);
            member.setProviderId("fixture-google-"+UUID.randomUUID()); member.setOauthAuthenticatedAt(LocalDateTime.now(Clock.systemUTC()));
        });
        Instant expiry=Instant.now().plusSeconds(40);
        var ticket=mfa.beginLogin(current(owner),current(owner).getOauthAuthenticatedAt(),expiry);
        assertThat(mfa.status(ticket.value(),null,null).expiresAt()).isBeforeOrEqualTo(LocalDateTime.ofInstant(expiry,ZoneOffset.UTC));
        assertThatThrownBy(()->mfa.beginLogin(current(owner),current(owner).getOauthAuthenticatedAt(),Instant.now().minusSeconds(1))).isInstanceOf(AuthException.class);
    }
    @Test void newTicketsCannotResetAccountProofQuota() {
        administrator(owner);
        enroll(owner);
        for(int attempt=0;attempt<20;attempt++) {
            var ticket=mfa.beginLogin(current(owner),null);
            assertThatThrownBy(()->mfa.verify(ticket.value(),null,null,"TOTP","invalid")).isInstanceOf(MfaService.RejectedProof.class);
        }
        var ticket=mfa.beginLogin(current(owner),null);
        assertThatThrownBy(()->mfa.verify(ticket.value(),null,null,"TOTP","invalid"))
                .isInstanceOfSatisfying(AuthException.class,error->assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS));
    }
    @Test void concurrentDifferentSettlementRequestsCannotPayTheSameBalanceTwice() throws Exception {
        tx.executeWithoutResult(ignored->{var reservation=reservations.findById(reservationId).orElseThrow();
            reservation.setReservationDate(ServiceTime.today().minusDays(1)); reservation.setStatus(Reservation.ReservationStatus.NO_SHOW);});
        when(pg.getStoreId()).thenReturn("fixture-store");
        var observed=json.readValue("""
                {"id":"%s","status":"PAID","currency":"KRW","storeId":"fixture-store",
                 "amount":{"total":10000,"cancelled":0},"channel":{"type":"TEST","id":"fixture-channel"},"disputes":[]}
                """.formatted(merchantUid),PortoneV2PaymentResponse.class);
        var ready=new CountDownLatch(2);
        when(pg.getPaymentInfo(merchantUid)).thenAnswer(ignored->{ready.countDown(); assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); return observed;});
        try(var workers=Executors.newFixedThreadPool(2)) {
            var results=new ArrayList<Future<Boolean>>();
            for(int i=0;i<2;i++) results.add(workers.submit(()->{
                try { settlement.simulate(storeId,paymentId,UUID.randomUUID().toString(),current(owner)); return true; }
                catch(kr.it.reserve.global.error.PaymentException error) { return false; }
            }));
            assertThat(List.of(results.get(0).get(15,TimeUnit.SECONDS),results.get(1).get(15,TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true,false);
        }
        assertThat(payouts.total(paymentId)).isEqualTo(10000);
    }
    @Test void anotherBusinessCannotReadOrSimulateTheStoreSettlement() {
        Member foreign=tx.execute(ignored->member(Role.BUSINESS));
        assertThatThrownBy(()->settlement.page(storeId,foreign,0))
                .isInstanceOfSatisfying(kr.it.reserve.global.error.PaymentException.class,error->assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN));
        assertThatThrownBy(()->settlement.simulate(storeId,paymentId,UUID.randomUUID().toString(),foreign))
                .isInstanceOfSatisfying(kr.it.reserve.global.error.PaymentException.class,error->assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN));
        verifyNoInteractions(pg);
    }


    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void businessUsesPrimaryLoginWithOriginalCookiePreference(boolean persistent) {
        assertThat(mfa.beginLogin(current(owner), null, null, persistent)).isNull();
        var session = tokens.issueSession(current(owner), null, persistent);
        assertThat(session.persistent()).isEqualTo(persistent);
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo("PASSWORD");
        assertThat(mfa.settings(current(owner)).required()).isFalse();
        assertThat(mfa.settings(current(owner)).enabled()).isFalse();
    }
    @Test void administratorCannotDeferEnrollmentOrReceivePrimaryOnlySession() {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(Role.ADMIN));
        var ticket = mfa.beginLogin(current(owner), null);
        assertThat(mfa.status(ticket.value(), null, null).canDeferEnrollment()).isFalse();
        assertThat(mfa.settings(current(owner)).required()).isTrue();
        assertThatThrownBy(() -> mfa.deferEnrollment(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> tokens.issueSession(current(owner), null)).isInstanceOf(AuthException.class);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"USER", "BUSINESS"})
    void enrolledOptionalAccountsUsePasswordWithoutMfaAndCannotSkipPasskeyVerification(Role role) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        enroll(owner);
        assertThat(mfa.beginLogin(current(owner), null)).isNull();
        var session = tokens.issueSession(current(owner), null);
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo("PASSWORD");
        var anonymous = mfa.beginPasskeyLogin();
        assertThatThrownBy(() -> mfa.deferEnrollment(anonymous.value(), null, null)).isInstanceOf(AuthException.class);
    }
    @Test void enrollmentDeferralRejectsRoleChangesAndExpiredProof() {
        var elevated = legacyEnrollment(owner);
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(Role.ADMIN));
        assertThatThrownBy(() -> mfa.deferEnrollment(elevated.value(), null, null)).isInstanceOf(AuthException.class);
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(Role.BUSINESS));
        var expired = legacyEnrollment(owner);
        tx.executeWithoutResult(ignored -> challenges.findById(MfaCrypto.digest(expired.value())).orElseThrow()
                .limitExpiry(LocalDateTime.now(Clock.systemUTC()).minusSeconds(1)));
        assertThatThrownBy(() -> mfa.deferEnrollment(expired.value(), null, null)).isInstanceOf(AuthException.class);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"USER", "BUSINESS"})
    void optionalAccountCanDisableAfterPasswordProofAndCurrentSession(Role role) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        var enrollment = enroll(owner);
        var verified = tokens.verifyAuthentication(enrollment.session().accessToken());
        assertThatThrownBy(() -> mfa.beginManage(current(owner), verified.sessionId(), null, null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.beginManage(current(owner), verified.sessionId(), null, "wrong-password")).isInstanceOf(AuthException.class);
        var manage = mfa.beginManage(current(owner), verified.sessionId(), null, "fixture-password");
        assertThat(mfa.status(manage.value(), current(owner), verified.sessionId()).verified()).isTrue();
        assertThatThrownBy(() -> mfa.disable(manage.value(), current(owner), "wrong-session")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.deferEnrollment(manage.value(), current(owner), verified.sessionId())).isInstanceOf(AuthException.class);
        mfa.disable(manage.value(), current(owner), verified.sessionId());
        assertThat(mfa.settings(current(owner)).enabled()).isFalse();
        assertThatThrownBy(() -> tokens.verifyAuthentication(enrollment.session().accessToken())).isInstanceOf(AuthException.class);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"USER", "BUSINESS"})
    void enrolledOptionalAccountUsesOAuthAndPrimaryManagementCannotMintMfaSession(Role role) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        enroll(owner);
        tx.executeWithoutResult(ignored -> {
            var member = members.findById(owner.getId()).orElseThrow();
            member.setProvider(AuthProvider.GOOGLE); member.setProviderId("fixture-social");
            member.setOauthAuthenticatedAt(LocalDateTime.now(Clock.systemUTC()));
        });
        var at = current(owner).getOauthAuthenticatedAt();
        assertThat(mfa.beginLogin(current(owner), at, Instant.now().plusSeconds(60), false)).isNull();
        var session = tokens.issueSession(current(owner), at, false);
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo("OAUTH");
        assertThat(session.persistent()).isFalse();
        var passkeySession = tokens.issueVerifiedSession(current(owner), at, "PASSKEY", false);
        var passkeySid = tokens.verifyAuthentication(passkeySession.accessToken()).sessionId();
        var socialManage = mfa.beginManage(current(owner), passkeySid, at, null, false);
        assertThat(mfa.status(socialManage.value(), current(owner), passkeySid).verified()).isTrue();
        mfa.cancel(socialManage.value());
        var sid = tokens.verifyAuthentication(session.accessToken()).sessionId();
        var manage = mfa.beginManage(current(owner), sid, at, null, false);
        assertThat(mfa.status(manage.value(), current(owner), sid).verified()).isTrue();
        var recoveryResult = mfa.regenerateRecovery(manage.value(), current(owner), sid);
        assertThat(recoveryResult.codes()).hasSize(10);
        var renewed = recoveryResult.session();
        assertThat(tokens.verifyAuthentication(renewed.accessToken()).loginMethod()).isEqualTo("OAUTH");
        assertThat(renewed.persistent()).isFalse();
        assertThat(mfa.finish(manage.value(), current(owner), tokens.getSessionId(renewed.accessToken())).session()).isNull();
    }

    @Test void ordinaryMemberCanOptIntoPasskeyRegistrationAfterPrimaryAuthentication() throws Exception {
        tx.executeWithoutResult(ignored -> members.findById(customer.getId()).orElseThrow()
                .setPassword(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("fixture-password")));
        assertThat(mfa.beginLogin(current(customer), null)).isNull();
        var settings = mfa.settings(current(customer));
        assertThat(settings.available()).isTrue(); assertThat(settings.required()).isFalse();
        var login = tokens.issueSession(current(customer), null);
        var verified = tokens.verifyAuthentication(login.accessToken());
        assertThatThrownBy(() -> mfa.beginManage(current(customer), verified.sessionId(), null, null)).isInstanceOf(AuthException.class);
        var manage = mfa.beginManage(current(customer), verified.sessionId(), null, "fixture-password");
        assertThat(mfa.status(manage.value(), current(customer), verified.sessionId()).enrollmentRequired()).isTrue();
        var options = json.readTree(mfa.beginPasskey(manage.value(), current(customer), verified.sessionId(), true));
        assertThat(options.path("publicKey").path("authenticatorSelection").path("userVerification").asText()).isEqualTo("required");
        verifyNoInteractions(pg);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"USER", "BUSINESS"})
    void optionalAccountCanRemoveItsLastCredentialAfterPrimaryProof(Role role) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        var enrollment = enroll(owner);
        var sid = tokens.verifyAuthentication(enrollment.session().accessToken()).sessionId();
        var manage = mfa.beginManage(current(owner), sid, null, "fixture-password");
        assertThatThrownBy(() -> mfa.remove(manage.value(), current(owner), sid, UUID.randomUUID().toString()))
                .isInstanceOf(AuthException.class);
        var credential = mfa.settings(current(owner)).credentials().getFirst();
        mfa.remove(manage.value(), current(owner), sid, credential.id());
        assertThat(mfa.settings(current(owner)).credentials()).isEmpty();
        assertThat(mfa.settings(current(owner)).enabled()).isFalse();
        assertThat(recovery.countByMemberId(owner.getId())).isZero();
        assertThatThrownBy(() -> tokens.verifyAuthentication(enrollment.session().accessToken())).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.remove(manage.value(), current(owner), sid, credential.id())).isInstanceOf(AuthException.class);
    }

    @Test void primaryManagementCannotBeReusedAfterAdministratorPromotion() {
        var enrollment = enroll(owner);
        var sid = tokens.verifyAuthentication(enrollment.session().accessToken()).sessionId();
        var manage = mfa.beginManage(current(owner), sid, null, "fixture-password");
        administrator(owner);
        assertThatThrownBy(() -> mfa.status(manage.value(), current(owner), sid)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.disable(manage.value(), current(owner), sid)).isInstanceOf(AuthException.class);
        assertThat(mfa.settings(current(owner)).enabled()).isTrue();
    }

    @Test void administratorPromotionRequiresExistingFactorEvenWhenNewEnrollmentIsPaused() {
        var enrollment = enroll(owner);
        boolean available = properties.isEnabled();
        try {
            properties.setEnabled(false);
            assertThat(tokens.verifyAuthentication(enrollment.session().accessToken()).member().getRole()).isEqualTo(Role.BUSINESS);
            administrator(owner);
            assertThatThrownBy(() -> tokens.verifyAuthentication(enrollment.session().accessToken())).isInstanceOf(AuthException.class);
            var pending = mfa.beginLogin(current(owner), null);
            assertThat(pending).isNotNull();
            String code = MfaCrypto.code(enrollment.secret(), Instant.now().getEpochSecond() / 30 + 1, 6);
            mfa.verify(pending.value(), null, null, "TOTP", code);
            var verified = mfa.finish(pending.value(), null, null).session();
            assertThat(tokens.verifyAuthentication(verified.accessToken()).loginMethod()).isEqualTo("PASSWORD_MFA");
        } finally {
            properties.setEnabled(available);
        }
    }

    @Test void administratorPasswordProofStillRequiresRegisteredFactor() {
        administrator(owner);
        var enrollment = enroll(owner);
        var sid = tokens.verifyAuthentication(enrollment.session().accessToken()).sessionId();
        var manage = mfa.beginManage(current(owner), sid, null, "fixture-password");
        assertThat(mfa.status(manage.value(), current(owner), sid).verified()).isFalse();
        assertThatThrownBy(() -> mfa.regenerateRecovery(manage.value(), current(owner), sid)).isInstanceOf(AuthException.class);
    }

    @Test void optionalSocialManagementRejectsExpiredProviderProof() {
        enroll(owner);
        var at = LocalDateTime.now(Clock.systemUTC()).minusMinutes(6);
        tx.executeWithoutResult(ignored -> {
            var member = members.findById(owner.getId()).orElseThrow();
            member.setProvider(AuthProvider.NAVER); member.setProviderId("fixture-provider"); member.setOauthAuthenticatedAt(at);
        });
        var login = tokens.issueSession(current(owner), at);
        var sid = tokens.verifyAuthentication(login.accessToken()).sessionId();
        assertThatThrownBy(() -> mfa.beginManage(current(owner), sid, at, null)).isInstanceOf(AuthException.class);
    }

    @Test void passkeyNameChangesPreserveCredentialsAndVerifiedSession() {
        var manage = nameManagement(owner, true);
        var phone = namedPasskey(owner, "패스키");
        var pc = namedPasskey(owner, "개인 PC");
        long version = current(owner).getAuthVersion();
        var result = mfa.rename(manage.ticket().value(), current(owner), manage.sid(), phone.getId(), "  아이폰  ");
        assertThat(result.credentials()).extracting(MfaService.CredentialView::name).contains("아이폰", "개인 PC", "인증 앱");
        var saved = credentials.findById(phone.getId()).orElseThrow();
        assertThat(saved.getCredentialId()).isEqualTo(phone.getCredentialId());
        assertThat(saved.getPublicKeyCose()).isEqualTo(phone.getPublicKeyCose());
        assertThat(credentials.findById(pc.getId())).isPresent();
        assertThat(current(owner).getAuthVersion()).isEqualTo(version);
        assertThat(tokens.verifyAuthentication(manage.session().accessToken()).sessionId()).isEqualTo(manage.sid());
        assertThat(mfa.status(manage.ticket().value(), current(owner), manage.sid()).verified()).isTrue();
    }
    @Test void passkeyNameRejectsBlankOversizedAndControlNames() {
        var manage = nameManagement(owner, true);
        var key = namedPasskey(owner, "원래 이름");
        for (String name : Arrays.asList(null, "", "   ", "n".repeat(81), "bad\nname"))
            assertThatThrownBy(() -> mfa.rename(manage.ticket().value(), current(owner), manage.sid(), key.getId(), name)).isInstanceOf(AuthException.class);
        assertThat(credentials.findById(key.getId()).orElseThrow().getName()).isEqualTo("원래 이름");
    }
    @Test void passkeyNameRequiresExistingAdministratorFactor() {
        administrator(owner);
        var manage = nameManagement(owner, false);
        var key = namedPasskey(owner, "원래 이름");
        assertThat(mfa.status(manage.ticket().value(), current(owner), manage.sid()).verified()).isFalse();
        assertThatThrownBy(() -> mfa.rename(manage.ticket().value(), current(owner), manage.sid(), key.getId(), "새 이름")).isInstanceOf(AuthException.class);
        assertThat(credentials.findById(key.getId()).orElseThrow().getName()).isEqualTo("원래 이름");
    }
    @Test void passkeyNameRejectsAnotherMemberAndTotpCredential() {
        var manage = nameManagement(owner, true);
        var foreign = namedPasskey(customer, "다른 계정");
        var totp = credentials.findByMemberIdOrderByCreatedAtAsc(owner.getId()).stream()
                .filter(value -> value.getKind() == MfaCredential.Kind.TOTP).findFirst().orElseThrow();
        assertThatThrownBy(() -> mfa.rename(manage.ticket().value(), current(owner), manage.sid(), foreign.getId(), "새 이름")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.rename(manage.ticket().value(), current(owner), manage.sid(), totp.getId(), "새 이름")).isInstanceOf(AuthException.class);
        assertThat(credentials.findById(foreign.getId()).orElseThrow().getName()).isEqualTo("다른 계정");
        assertThat(credentials.findById(totp.getId()).orElseThrow().getName()).isEqualTo("인증 앱");
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void passkeyNameRequiresLiveTicket(boolean cancelled) {
        var manage = nameManagement(owner, true);
        var key = namedPasskey(owner, "원래 이름");
        if (cancelled) mfa.cancel(manage.ticket().value());
        else tx.executeWithoutResult(ignored -> challenges.findById(MfaCrypto.digest(manage.ticket().value())).orElseThrow()
                .limitExpiry(LocalDateTime.now(Clock.systemUTC()).minusSeconds(1)));
        assertThatThrownBy(() -> mfa.rename(manage.ticket().value(), current(owner), manage.sid(), key.getId(), "새 이름")).isInstanceOf(AuthException.class);
        assertThat(credentials.findById(key.getId()).orElseThrow().getName()).isEqualTo("원래 이름");
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"ADMIN,false", "ADMIN,true", "BUSINESS,false", "BUSINESS,true", "USER,false", "USER,true"})
    void oauthReauthenticationKeepsTheVerifiedDeviceAndLoginPreference(Role role, boolean persistent) throws Exception {
        var original = socialSession(role, persistent, null);
        var before = tokens.verifyAuthentication(original.accessToken());
        var lifetime = sessions.findBySessionIdAndMemberId(before.sessionId(), owner.getId()).orElseThrow().getAbsoluteExpiresAt();
        var devices = sessions.findByMemberId(owner.getId()).stream().map(RefreshToken::getSessionId).toList();
        var proof = socialProof(original);
        var response = new MockHttpServletResponse();

        oauthSuccess.onAuthenticationSuccess(proof.request(), response,
                UsernamePasswordAuthenticationToken.authenticated(proof.principal(), null, proof.principal().getAuthorities()));

        assertThat(response.getRedirectedUrl()).endsWith("/my-page?security=verified");
        assertThat(response.getHeaders("Set-Cookie").stream().anyMatch(value -> value.startsWith("mfa_ticket=") && !value.contains("Max-Age=0"))).isFalse();
        String access = responseCookie(response, "access_token");
        var after = tokens.verifyAuthentication(access);
        assertThat(after.sessionId()).isEqualTo(before.sessionId());
        assertThat(after.persistent()).isEqualTo(persistent);
        assertThat(after.loginMethod()).isEqualTo(role == Role.ADMIN ? "OAUTH_MFA" : "OAUTH");
        assertThat(sessions.findBySessionIdAndMemberId(after.sessionId(), owner.getId()).orElseThrow().getAbsoluteExpiresAt()).isEqualTo(lifetime);
        assertThat(sessions.findByMemberId(owner.getId()).stream().map(RefreshToken::getSessionId)).containsExactlyInAnyOrderElementsOf(devices);
        assertThat(loginMethods.status(current(owner), after.oauthAuthenticatedAt()).socialProofFresh()).isTrue();
        assertThatThrownBy(() -> tokens.verifyAuthentication(original.accessToken())).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> tokenService.refresh(original.refreshToken())).isInstanceOf(AuthException.class);
        assertThat(tokens.verifyAuthentication(access).sessionId()).isEqualTo(before.sessionId());
        var refreshed = tokenService.refresh(responseCookie(response, "refresh_token"));
        assertThat(refreshed.persistent()).isEqualTo(persistent);
        assertThat(tokens.verifyAuthentication(refreshed.accessToken()).sessionId()).isEqualTo(before.sessionId());
        assertThat(LoginMethodService.consumeReauthentication(proof.request())).isFalse();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"ADMIN,PASSWORD_MFA", "ADMIN,PASSKEY", "BUSINESS,PASSKEY", "USER,PASSKEY"})
    void oauthReauthenticationPreservesExistingStrongAuthentication(Role role, String method) {
        var original = socialSession(role, false, method);
        var proof = socialProof(original);
        assertThat(LoginMethodService.consumeReauthentication(proof.request())).isTrue();
        assertThat(LoginMethodService.consumeReauthentication(proof.request())).isFalse();
        var result = oauthSessions.issueReauthenticated(proof.principal(), original.accessToken());
        assertThat(result.mfaTicket()).isNull();
        assertThat(tokens.verifyAuthentication(result.accessToken()).loginMethod()).isEqualTo("OAUTH_MFA");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"ADMIN", "BUSINESS", "USER"})
    void oauthReauthenticationDoesNotTurnAQueryIntoMfaBypass(Role role) throws Exception {
        socialSession(role, true, null);
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setOauthAuthenticatedAt(subjects.now()));
        var request = new MockHttpServletRequest();
        request.setParameter("security", "verified");
        var response = new MockHttpServletResponse();
        var principal = new CustomOAuth2User(current(owner), Map.of("sub", current(owner).getProviderId()), "sub", false, Instant.now().plusSeconds(3600));
        assertThatThrownBy(() -> oauthSessions.issueReauthenticated(principal, "synthetic-access"))
                .isInstanceOf(OAuth2AuthenticationException.class);
        oauthSuccess.onAuthenticationSuccess(request, response,
                UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
        assertThat(response.getRedirectedUrl()).endsWith(role == Role.ADMIN ? "/login?mfa=1" : "/oauth2/callback");
        assertThat(response.getHeaders("Set-Cookie").stream().anyMatch(value -> value.startsWith("mfa_ticket=") && !value.contains("Max-Age=0")))
                .isEqualTo(role == Role.ADMIN);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void oauthReauthenticationCannotRestoreDeletedOrExpiredSession(boolean expired) {
        var original = socialSession(Role.ADMIN, false, null);
        var sid = tokens.verifyAuthentication(original.accessToken()).sessionId();
        var proof = socialProof(original);
        tx.executeWithoutResult(ignored -> {
            var row = sessions.findBySessionIdForUpdate(sid, owner.getId()).orElseThrow();
            if (expired) org.springframework.test.util.ReflectionTestUtils.setField(row, "expiresAt", LocalDateTime.now(Clock.systemUTC()).minusSeconds(1));
            else sessions.delete(row);
        });
        assertThatThrownBy(() -> oauthSessions.issueReauthenticated(proof.principal(), original.accessToken()))
                .isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(sessions.findBySessionIdAndMemberId(sid, owner.getId()).filter(row -> row.isLiveAt(LocalDateTime.now(Clock.systemUTC())))).isEmpty();
    }

    @Test void oauthReauthenticationRejectsAnotherAccountSession() {
        var original = socialSession(Role.ADMIN, false, null);
        var proof = socialProof(original);
        var other = tokens.issueSession(current(customer), null);
        assertThatThrownBy(() -> oauthSessions.issueReauthenticated(proof.principal(), other.accessToken()))
                .isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(tokens.verifyAuthentication(other.accessToken()).member().getId()).isEqualTo(customer.getId());
        assertThat(tokens.verifyAuthentication(original.accessToken()).member().getId()).isEqualTo(owner.getId());
    }

    @Test void oauthReauthenticationCannotPromoteAWeakSessionAfterRoleChange() {
        var original = socialSession(Role.BUSINESS, false, null);
        var proof = socialProof(original);
        administrator(owner);
        assertThatThrownBy(() -> oauthSessions.issueReauthenticated(proof.principal(), original.accessToken()))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void oauthReauthenticationRejectsRevocationAfterTheProviderCallback(boolean versionChanged) {
        var original = socialSession(Role.ADMIN, false, null);
        var proof = socialProof(original);
        tx.executeWithoutResult(ignored -> {
            var member = members.findById(owner.getId()).orElseThrow();
            if (versionChanged) member.rotateAuthVersion();
            else member.setOauthSecurityRevokedAt(subjects.now().plusSeconds(1));
        });
        assertThatThrownBy(() -> oauthSessions.issueReauthenticated(proof.principal(), original.accessToken()))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    private TokenProvider.IssuedSession socialSession(Role role, boolean persistent, String method) {
        return socialSession(role, persistent, method, AuthProvider.GOOGLE);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = AuthProvider.class, names = {"NAVER", "KAKAO"})
    void oauthReauthenticationUsesTheSameOwnedSessionForOtherProviders(AuthProvider provider) {
        var original = socialSession(Role.ADMIN, false, null, provider);
        var sid = tokens.verifyAuthentication(original.accessToken()).sessionId();
        var proof = socialProof(original);
        var result = oauthSessions.issueReauthenticated(proof.principal(), original.accessToken());
        assertThat(result.mfaTicket()).isNull();
        assertThat(tokens.verifyAuthentication(result.accessToken()).sessionId()).isEqualTo(sid);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"ADMIN", "BUSINESS", "USER"})
    void oauthReauthenticationWorksBeforeEmailLoginIsAdded(Role role) {
        var original = socialSession(role, false, null);
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setPassword(null));
        var proof = socialProof(original);
        var result = oauthSessions.issueReauthenticated(proof.principal(), original.accessToken());
        assertThat(result.mfaTicket()).isNull();
        assertThat(loginMethods.status(current(owner), tokens.verifyAuthentication(result.accessToken()).oauthAuthenticatedAt()).socialProofFresh()).isTrue();
    }

    private TokenProvider.IssuedSession socialSession(Role role, boolean persistent, String method, AuthProvider provider) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        enroll(owner);
        tx.executeWithoutResult(ignored -> {
            var member = members.findById(owner.getId()).orElseThrow();
            member.setProvider(provider);
            member.setProviderId("synthetic-provider-" + UUID.randomUUID());
            member.setLoginMethodsManaged(true);
            member.setOauthAuthenticatedAt(subjects.now().minusMinutes(10));
        });
        var member = current(owner);
        String loginMethod = method != null ? method : role == Role.ADMIN ? "OAUTH_MFA" : "OAUTH";
        LocalDateTime at = loginMethod.startsWith("OAUTH") ? member.getOauthAuthenticatedAt() : null;
        return MfaPolicy.strong(loginMethod) ? tokens.issueVerifiedSession(member, at, loginMethod, persistent)
                : tokens.issueSession(member, at, persistent);
    }

    private record SocialProof(MockHttpServletRequest request, CustomOAuth2User principal) { }
    private SocialProof socialProof(TokenProvider.IssuedSession original) {
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", original.accessToken()));
        AuthProvider provider = current(owner).getProvider();
        String registration = provider.name().toLowerCase(Locale.ROOT);
        String url = loginMethods.beginOAuth(current(owner), provider, null, true, request);
        request.setParameter("account_link", url.substring(url.indexOf('=') + 1));
        String state = UUID.randomUUID().toString();
        loginMethods.bindOAuth(request, OAuth2AuthorizationRequest.authorizationCode().authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .clientId("synthetic-client").redirectUri("http://localhost/login/oauth2/code/" + registration).state(state)
                .attributes(values -> values.put("registration_id", registration)).build());
        request.setParameter("state", state);
        var info = mock(OAuth2UserInfo.class);
        when(info.getProviderId()).thenReturn(current(owner).getProviderId());
        when(info.getEmail()).thenReturn(current(owner).getEmail());
        Instant expires = Instant.now().plusSeconds(3600);
        var member = loginMethods.completeOAuth(request, provider, info, "synthetic-provider-token",
                subjects.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS), expires);
        return new SocialProof(request, new CustomOAuth2User(member, Map.of("sub", member.getProviderId()), "sub", false, expires, true));
    }

    private String responseCookie(MockHttpServletResponse response, String name) {
        String prefix = name + "=";
        return response.getHeaders("Set-Cookie").stream().filter(value -> value.startsWith(prefix) && !value.contains("Max-Age=0"))
                .map(value -> value.substring(prefix.length(), value.indexOf(';'))).findFirst().orElseThrow();
    }

    @Test void requestBoundaryReopeningManagementConsumesOnlyThePreviousOwnedTicket() {
        administrator(owner);
        var enrollment = enroll(owner);
        var sid = tokens.verifyAuthentication(enrollment.session().accessToken()).sessionId();
        var first = mfa.beginManage(current(owner), sid, null, null);
        var replacement = mfa.beginManage(current(owner), sid, null, null, false, first.value());
        assertThatThrownBy(() -> mfa.status(first.value(), current(owner), sid)).isInstanceOf(AuthException.class);
        assertThat(mfa.status(replacement.value(), current(owner), sid).verified()).isFalse();
        var secondDevice = tokens.issueVerifiedSession(current(owner), null, "PASSWORD_MFA", false);
        var otherSid = tokens.verifyAuthentication(secondDevice.accessToken()).sessionId();
        mfa.beginManage(current(owner), otherSid, null, null, false, replacement.value());
        assertThat(mfa.status(replacement.value(), current(owner), sid).verified()).isFalse();
    }

    @Test void requestBoundaryWrongPrimaryProofNeverCancelsTheCurrentManagementTicket() {
        var state = nameManagement(owner, false);
        assertThatThrownBy(() -> mfa.beginManage(current(owner), state.sid(), null, "wrong-password", false, state.ticket().value()))
                .isInstanceOf(AuthException.class);
        assertThat(mfa.status(state.ticket().value(), current(owner), state.sid()).verified()).isTrue();
    }

    @Test void requestBoundarySuccessfulProofRefundsOnlyItsAttemptAndKeepsEarlierFailures() {
        administrator(owner);
        var enrollment = enroll(owner);
        var sid = tokens.verifyAuthentication(enrollment.session().accessToken()).sessionId();
        String key = "mfa-member:" + owner.getId();
        for (int i = 0; i < kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT.capacity() - 1; i++)
            assertThat(limiter.tryConsume(key, kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT)).isTrue();
        var first = mfa.beginManage(current(owner), sid, null, null);
        String code = MfaCrypto.code(enrollment.secret(), Instant.now().getEpochSecond() / 30 + 1, 6);
        assertThat(mfa.verify(first.value(), current(owner), sid, "TOTP", code).view().verified()).isTrue();
        var second = mfa.beginManage(current(owner), sid, null, null);
        assertThatThrownBy(() -> mfa.verify(second.value(), current(owner), sid, "TOTP", "not-a-code"))
                .isInstanceOf(MfaService.RejectedProof.class);
        var third = mfa.beginManage(current(owner), sid, null, null);
        assertThatThrownBy(() -> mfa.verify(third.value(), current(owner), sid, "TOTP", code))
                .isInstanceOf(AuthException.class).hasMessageContaining("인증 시도가 많아요");
    }

    @Test void requestBoundaryChangingPasswordAtomicallyInvalidatesAnEarlierResetCodeAndEverySession() {
        var session = tokens.issueSession(current(owner), null);
        tx.executeWithoutResult(ignored -> {
            var reset = kr.it.reserve.member.entity.PasswordResetToken.builder().email(owner.getEmail()).token("HASHED")
                    .tokenHash(PASSWORD_HASH).expiresAt(LocalDateTime.now().plusMinutes(5)).build();
            reset.markVerified();
            passwordResets.save(reset);
        });
        var request = new kr.it.reserve.member.dto.PasswordChangeRequest();
        request.setCurrentPassword("fixture-password"); request.setNewPassword("FixtureNext123!"); request.setNewPasswordConfirm("FixtureNext123!");
        assertThatThrownBy(() -> memberService.changePassword(owner.getId(), request))
                .isInstanceOf(AuthException.class).satisfies(failure -> assertThat(((AuthException) failure).getStatus().value()).isEqualTo(428));
        assertThat(current(owner).getAuthVersion()).isZero();
        assertThat(passwordResets.findIdsByEmail(owner.getEmail())).isNotEmpty();
        String sid = tokens.getSessionId(session.accessToken());
        var proof = mfa.beginSensitive(current(owner), sid, null, "fixture-password", true, null, MfaService.SensitiveAction.CHANGE);
        assertThat(mfa.status(proof.value(), current(owner), sid).verified()).isTrue();
        var browser = new MockHttpServletRequest(); browser.setCookies(new Cookie("mfa_ticket", proof.value()));
        var context = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        var principal = UsernamePasswordAuthenticationToken.authenticated(current(owner), null, List.of());
        principal.setDetails(new kr.it.reserve.config.util.SecurityUtil.OAuthAuthenticationDetails(null, "PASSWORD", sid));
        try {
            org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(browser));
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(principal);
            memberService.changePassword(owner.getId(), request);
        } finally {
            org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(context);
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        assertThat(passwordResets.findIdsByEmail(owner.getEmail())).isEmpty();
        assertThat(current(owner).getAuthVersion()).isEqualTo(1);
        assertThatThrownBy(() -> tokens.verifyAuthentication(session.accessToken())).isInstanceOf(AuthException.class);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"USER", "BUSINESS", "ADMIN"})
    void recoveryRenewalKeepsTheBrowserUsableEvenWhenTheCodesPanelIsClosed(Role role) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        var manage = nameManagement(owner, true);
        var result = mfa.regenerateRecovery(manage.ticket().value(), current(owner), manage.sid());
        assertThat(result.codes()).hasSize(10);
        assertThat(result.toString()).isEqualTo("RecoveryRenewal[redacted]");
        assertThatThrownBy(() -> tokens.verifyAuthentication(manage.session().accessToken())).isInstanceOf(AuthException.class);
        var renewed = tokens.verifyAuthentication(result.session().accessToken());
        assertThat(renewed.loginMethod()).isEqualTo(role == Role.ADMIN ? "PASSWORD_MFA" : "PASSWORD");
        assertThatThrownBy(() -> mfa.status(manage.ticket().value(), current(owner), manage.sid())).isInstanceOf(AuthException.class);
        assertThat(mfa.status(manage.ticket().value(), current(owner), renewed.sessionId()).verified()).isTrue();
        mfa.cancel(manage.ticket().value());
        assertThat(tokens.verifyAuthentication(result.session().accessToken()).sessionId()).isEqualTo(renewed.sessionId());
        assertThat(mfa.beginManage(current(owner), renewed.sessionId(), null, "fixture-password")).isNotNull();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"USER", "BUSINESS", "ADMIN"})
    void removingOneOfSeveralCredentialsKeepsOnlyTheConfirmedBrowser(Role role) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        var manage = nameManagement(owner, true);
        var removed = namedPasskey(owner, "다른 기기 패스키");
        var other = tokens.issueVerifiedSession(current(owner), null, "PASSWORD_MFA", true);
        var result = mfa.remove(manage.ticket().value(), current(owner), manage.sid(), removed.getId());
        assertThatThrownBy(() -> tokens.verifyAuthentication(manage.session().accessToken())).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> tokens.verifyAuthentication(other.accessToken())).isInstanceOf(AuthException.class);
        var replacement = tokens.verifyAuthentication(result.session().accessToken());
        assertThat(replacement.loginMethod()).isEqualTo(role == Role.ADMIN ? "PASSWORD_MFA" : "PASSWORD");
        assertThat(result.session().persistent()).isTrue();
        assertThat(mfa.settings(current(owner)).credentials()).hasSize(1).noneMatch(value -> value.id().equals(removed.getId()));
        assertThatThrownBy(() -> mfa.status(manage.ticket().value(), current(owner), replacement.sessionId())).isInstanceOf(AuthException.class);
        assertThat(mfa.beginManage(current(owner), replacement.sessionId(), null, "fixture-password")).isNotNull();
    }

    @Test void localLastCredentialResetStillRequiresProofAndNewAdministratorEnrollment() {
        administrator(owner);
        var used = new java.util.concurrent.atomic.AtomicBoolean();
        when(localAdminReset.available()).thenAnswer(ignored -> !used.get());
        when(localAdminReset.claim()).thenAnswer(ignored -> used.compareAndSet(false, true));
        var manage = nameManagement(owner, false);
        String credential = mfa.settings(current(owner)).credentials().getFirst().id();
        assertThat(mfa.settings(current(owner)).localAdminResetAvailable()).isTrue();
        assertThatThrownBy(() -> mfa.remove(manage.ticket().value(), current(owner), manage.sid(), credential)).isInstanceOf(AuthException.class);
        verify(localAdminReset, never()).claim();
        tx.executeWithoutResult(ignored -> challenges.findById(MfaCrypto.digest(manage.ticket().value())).orElseThrow().verified());
        mfa.remove(manage.ticket().value(), current(owner), manage.sid(), credential);
        assertThat(mfa.settings(current(owner)).enabled()).isFalse();
        assertThat(mfa.settings(current(owner)).required()).isTrue();
        assertThat(mfa.settings(current(owner)).localAdminResetAvailable()).isFalse();
        assertThat(mfa.beginLogin(current(owner), null)).isNotNull();
        assertThatThrownBy(() -> tokens.issueSession(current(owner), null)).isInstanceOf(AuthException.class);
        var enrollment = enroll(owner);
        var sid = tokens.getSessionId(enrollment.session().accessToken());
        var next = mfa.beginManage(current(owner), sid, null, null);
        tx.executeWithoutResult(ignored -> challenges.findById(MfaCrypto.digest(next.value())).orElseThrow().verified());
        String remaining = mfa.settings(current(owner)).credentials().getFirst().id();
        assertThatThrownBy(() -> mfa.remove(next.value(), current(owner), sid, remaining)).isInstanceOf(AuthException.class);
        assertThat(mfa.settings(current(owner)).credentials()).hasSize(1);
    }

    private record NameManagement(MfaService.Ticket ticket, String sid, TokenProvider.IssuedSession session) { }
    private NameManagement nameManagement(Member member, boolean verified) {
        var enrollment = enroll(member);
        var sid = tokens.verifyAuthentication(enrollment.session().accessToken()).sessionId();
        var ticket = mfa.beginManage(current(member), sid, null, "fixture-password");
        if (verified && current(member).isAdmin()) mfa.verify(ticket.value(), current(member), sid, "TOTP",
                MfaCrypto.code(enrollment.secret(), Instant.now().getEpochSecond() / 30 + 1, 6));
        return new NameManagement(ticket, sid, enrollment.session());
    }
    private MfaCredential namedPasskey(Member member, String name) {
        return tx.execute(ignored -> {
            String id = "synthetic-" + UUID.randomUUID();
            var value = MfaCredential.passkey(member.getId(), name, id, MfaCrypto.digest(id), "synthetic-public-key", 0,
                    null, false, false, LocalDateTime.now(Clock.systemUTC()));
            return credentials.save(value);
        });
    }

    private Member member(Role role) {
        Member member=Member.builder().name("합성 회원").email(UUID.randomUUID()+"@example.test").password(PASSWORD_HASH)
                .role(role).termsAgreed(true).emailNotificationEnabled(false).build();
        em.persist(member); return member;
    }
    private Member current(Member member) { return members.findById(member.getId()).orElseThrow(); }
    private record Enrollment(String secret, List<String> codes, TokenProvider.IssuedSession session) { }
    private Enrollment enroll(Member member) {
        Member authenticated = null;
        String sid = null;
        MfaService.Ticket ticket;
        if (current(member).isAdmin()) ticket = mfa.beginLogin(current(member), null);
        else {
            var primary = tokens.issueSession(current(member), null);
            sid = tokens.verifyAuthentication(primary.accessToken()).sessionId();
            authenticated = current(member);
            ticket = mfa.beginManage(authenticated, sid, null, "fixture-password");
        }
        assertThat(mfa.status(ticket.value(),authenticated,sid).enrollmentRequired()).isTrue();
        if (current(member).isAdmin()) assertThatThrownBy(()->tokens.issueSession(current(member),null)).isInstanceOf(AuthException.class);
        var setup=mfa.beginTotp(ticket.value(),authenticated,sid);
        String code=MfaCrypto.code(setup.secret(),Instant.now().getEpochSecond()/30,6);
        var codes=mfa.confirmTotp(ticket.value(),authenticated,sid,code);
        var session=mfa.finish(ticket.value(),null,null).session();
        assertThat(codes).hasSize(10);
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo(current(member).isAdmin() ? "PASSWORD_MFA" : "PASSWORD");
        assertThatThrownBy(()->mfa.finish(ticket.value(),null,null)).isInstanceOf(AuthException.class);
        return new Enrollment(setup.secret(),codes,session);
    }
    private void administrator(Member member) {
        tx.executeWithoutResult(ignored -> members.findById(member.getId()).orElseThrow().setRole(Role.ADMIN));
    }
    private MfaService.Ticket legacyEnrollment(Member member) {
        var ticket = new MfaService.Ticket(crypto.randomToken() + ".0");
        tx.executeWithoutResult(ignored -> challenges.save(new MfaChallenge(MfaCrypto.digest(ticket.value()), member.getId(),
                MfaChallenge.Purpose.LOGIN, "PASSWORD", current(member).getAuthVersion(), null, LocalDateTime.now(Clock.systemUTC()).plusMinutes(5))));
        return ticket;
    }
    @Test void totpEnrollmentNeverIssuesPrimaryOnlySessionAndBackupCodesAreOneUse() {
        administrator(owner);
        var enrollment=enroll(owner);
        var ticket=mfa.beginLogin(current(owner),null);
        mfa.verify(ticket.value(),null,null,"BACKUP",enrollment.codes().getFirst());
        var replacement=mfa.finish(ticket.value(),null,null).session();
        assertThat(tokens.verifyAuthentication(replacement.accessToken()).member().getId()).isEqualTo(owner.getId());
        assertThatThrownBy(()->tokens.verifyAuthentication(enrollment.session().accessToken())).isInstanceOf(AuthException.class);
        var replay=mfa.beginLogin(current(owner),null);
        assertThatThrownBy(()->mfa.verify(replay.value(),null,null,"BACKUP",enrollment.codes().getFirst())).isInstanceOf(MfaService.RejectedProof.class);
        assertThat(recovery.countByMemberId(owner.getId())).isEqualTo(9);
        assertThat(challenges.findById(MfaCrypto.digest(replay.value())).orElseThrow().getFailures()).isEqualTo(1);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"ADMIN,false", "ADMIN,true", "BUSINESS,false", "USER,true"})
    void recoveryProofContinuesOnlyTheBoundManagementSession(Role role, boolean persistent) {
        tx.executeWithoutResult(ignored -> members.findById(owner.getId()).orElseThrow().setRole(role));
        var enrollment = enroll(owner);
        var original = current(owner);
        String oldSid = tokens.getSessionId(enrollment.session().accessToken());
        var ticket = mfa.beginManage(original, oldSid, null, "fixture-password", persistent);
        var expiry = mfa.status(ticket.value(), original, oldSid).expiresAt();

        var verified = mfa.verify(ticket.value(), original, oldSid, "BACKUP", enrollment.codes().getFirst());

        assertThat(verified.view().purpose()).isEqualTo("MANAGE");
        assertThat(verified.view().verified()).isTrue();
        assertThat(verified.view().expiresAt()).isEqualTo(expiry);
        assertThat(verified.session().persistent()).isEqualTo(persistent);
        var replacement = tokens.verifyAuthentication(verified.session().accessToken());
        assertThat(replacement.loginMethod()).isEqualTo(role == Role.ADMIN ? "PASSWORD_MFA" : "PASSWORD");
        assertThatThrownBy(() -> tokens.verifyAuthentication(enrollment.session().accessToken())).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.status(ticket.value(), original, oldSid)).isInstanceOf(AuthException.class);
        assertThat(mfa.status(ticket.value(), current(owner), replacement.sessionId()).verified()).isTrue();
        assertThatThrownBy(() -> mfa.verify(ticket.value(), current(owner), replacement.sessionId(), "BACKUP", enrollment.codes().getFirst()))
                .isInstanceOf(MfaService.RejectedProof.class);
        assertThat(mfa.beginPasskey(ticket.value(), current(owner), replacement.sessionId(), true)).isNotBlank();
        assertThat(recovery.countByMemberId(owner.getId())).isEqualTo(9);
        assertThat(challenges.findById(MfaCrypto.digest(ticket.value())).orElseThrow().getBoundSessionId()).isEqualTo(replacement.sessionId());
        assertThat(mfa.finish(ticket.value(), current(owner), replacement.sessionId()).session()).isNull();
    }
    @Test void concurrentTotpRequestsConsumeOneStepOnly() throws Exception {
        administrator(owner);
        var enrollment=enroll(owner);
        var first=mfa.beginLogin(current(owner),null);
        var second=mfa.beginLogin(current(owner),null);
        String code=MfaCrypto.code(enrollment.secret(),Instant.now().getEpochSecond()/30+1,6);
        var start=new CountDownLatch(1);
        try(var workers=Executors.newFixedThreadPool(2)) {
            var results=new ArrayList<Future<Boolean>>();
            for(var ticket:List.of(first,second)) results.add(workers.submit(()->{
                start.await();
                try { mfa.verify(ticket.value(),null,null,"TOTP",code); return true; }
                catch(MfaService.RejectedProof e) { return false; }
            }));
            start.countDown();
            assertThat(List.of(results.get(0).get(10,TimeUnit.SECONDS),results.get(1).get(10,TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true,false);
        }
    }
    @Test void concurrentRecoveryProofsConsumeOneCodeOnly() throws Exception {
        administrator(owner);
        var enrollment=enroll(owner);
        var ticket=mfa.beginLogin(current(owner),null);
        var start=new CountDownLatch(1);
        try(var workers=Executors.newFixedThreadPool(2)) {
            var results=new ArrayList<Future<Boolean>>();
            for(int attempt=0;attempt<2;attempt++) results.add(workers.submit(()->{
                start.await();
                try { mfa.verify(ticket.value(),null,null,"BACKUP",enrollment.codes().getFirst()); return true; }
                catch(AuthException error) { return false; }
            }));
            start.countDown();
            assertThat(List.of(results.get(0).get(10,TimeUnit.SECONDS),results.get(1).get(10,TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true,false);
        }
        assertThat(recovery.countByMemberId(owner.getId())).isEqualTo(9);
    }
    @Test void noCheckinAndFutureEndCannotAutoComplete() {
        assertThat(completion.complete(reservationId)).isFalse();
        tx.executeWithoutResult(ignored->{var reservation=reservations.findById(reservationId).orElseThrow();
            reservation.setCheckedInAt(LocalDateTime.now(Clock.systemUTC())); reservation.setUsageEndsAt(ServiceTime.now().plusMinutes(1));});
        assertThat(completion.complete(reservationId)).isFalse();
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId)).isEmpty();
    }
    @Test void completionAndFullRefundAreCommittedOnceOutsidePgLocks() throws Exception {
        tx.executeWithoutResult(ignored->reservations.findById(reservationId).orElseThrow().setCheckedInAt(LocalDateTime.now(Clock.systemUTC())));
        when(pg.cancelPayment(eq(merchantUid),eq(10000),anyString(),anyString(),eq(10000))).thenAnswer(ignored->{
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(reservations.findById(reservationId).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
            return json.readValue("{\"cancellation\":{\"id\":\"fixture-cancel\",\"status\":\"SUCCEEDED\",\"totalAmount\":10000}}",PortoneV2CancelResponse.class);
        });
        assertThat(completion.complete(reservationId)).isTrue();
        assertThat(completion.complete(reservationId)).isFalse();
        org.awaitility.Awaitility.await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED));
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId)).hasSize(1);
        verify(pg,times(1)).cancelPayment(eq(merchantUid),eq(10000),anyString(),anyString(),eq(10000));
        assertThatThrownBy(()->reservationService.cancelReservation(reservationId,customer)).isInstanceOf(RuntimeException.class);
    }
    @Test void refundPreparationFailureRollsBackCompletion() {
        tx.executeWithoutResult(ignored->{
            var reservation=reservations.findById(reservationId).orElseThrow(); reservation.setCheckedInAt(LocalDateTime.now(Clock.systemUTC()));
            var payment=payments.findById(paymentId).orElseThrow(); payment.setAmount(-1);
        });
        // 무효 금액은 정산과 환불을 함께 거부해야 해요.
        assertThatThrownBy(()->completion.complete(reservationId)).isInstanceOf(RuntimeException.class);
        assertThat(reservations.findById(reservationId).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
    }
    @Test void testPayoutReusesSameRequestAndHoldsLiveOrUnknownChannels() throws Exception {
        tx.executeWithoutResult(ignored->{var reservation=reservations.findById(reservationId).orElseThrow();
            reservation.setReservationDate(ServiceTime.today().minusDays(1)); reservation.setStatus(Reservation.ReservationStatus.NO_SHOW);});
        when(pg.getStoreId()).thenReturn("fixture-store");
        when(pg.getPaymentInfo(merchantUid)).thenReturn(json.readValue("""
                {"id":"%s","status":"PAID","currency":"KRW","storeId":"fixture-store",
                 "amount":{"total":10000,"cancelled":0},"channel":{"type":"TEST","id":"fixture-channel"},"disputes":[]}
                """.formatted(merchantUid),PortoneV2PaymentResponse.class));
        String request=UUID.randomUUID().toString();
        var receipt=settlement.simulate(storeId,paymentId,request,current(owner));
        assertThat(receipt.amount()).isEqualTo(10000);
        assertThat(receipt.feeAmount()).isZero();
        assertThat(settlement.simulate(storeId,paymentId,request,current(owner))).isEqualTo(receipt);
        verify(pg,times(1)).getPaymentInfo(merchantUid);
        assertThat(payouts.total(paymentId)).isEqualTo(10000);
        assertThatThrownBy(()->settlement.simulate(storeId,paymentId,UUID.randomUUID().toString(),current(owner))).isInstanceOf(RuntimeException.class);
        tx.executeWithoutResult(ignored->{var payment=payments.findById(paymentId).orElseThrow();
            payment.setRefundAmount(10000); payment.setStatus(Payment.PaymentStatus.REFUNDED);});
        assertThat(settlement.page(storeId,current(owner),0).content().getFirst().balance()).isEqualTo(-10000);
        assertThatThrownBy(()->settlement.page(storeId,current(customer),0)).isInstanceOf(RuntimeException.class);
    }
}
