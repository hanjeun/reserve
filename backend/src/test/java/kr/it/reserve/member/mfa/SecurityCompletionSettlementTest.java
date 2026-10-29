package kr.it.reserve.member.mfa;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.MemberRepository;
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
        "spring.datasource.url=jdbc:h2:mem:security-completion-test;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
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
    @Autowired TokenProvider tokens;
    @Autowired MemberRepository members;
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
        assertThat(mfa.verify(manage.value(),current(owner),session.sessionId(),"TOTP",code).verified()).isTrue();
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
        assertThat(mfa.regenerateRecovery(manage.value(), current(owner), sid)).hasSize(10);
        var renewed = mfa.finish(manage.value(), null, null).session();
        assertThat(tokens.verifyAuthentication(renewed.accessToken()).loginMethod()).isEqualTo("OAUTH");
        assertThat(renewed.persistent()).isFalse();
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
