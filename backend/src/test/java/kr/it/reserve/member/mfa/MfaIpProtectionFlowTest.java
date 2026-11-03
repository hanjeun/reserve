package kr.it.reserve.member.mfa;

import jakarta.persistence.EntityManager;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:ip-proof-flow;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
        "reserve.mfa.enabled=true", "reserve.mfa.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@AutoConfigureMockMvc
class MfaIpProtectionFlowTest {
    @Autowired MfaService mfa;
    @Autowired MfaCrypto crypto;
    @Autowired MemberRepository members;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @Autowired TokenProvider tokens;
    @Autowired MfaChallengeRepository completionChallenges;
    @Autowired kr.it.reserve.config.jwt.repository.RefreshTokenRepository completionSessions;
    @Autowired MockMvc http;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
    @MockitoBean EmailService email;
    @MockitoBean kr.it.reserve.global.security.PwnedPasswordChecker pwnedPasswords;
    @MockitoBean IpLoginProtection protection;
    private TransactionTemplate tx;
    private Member member;

    @BeforeEach void fixture() {
        tx = new TransactionTemplate(transactions);
        member = tx.execute(ignored -> {
            Member value = Member.builder().name("합성 회원").email(UUID.randomUUID() + "@example.test")
                    .password(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("synthetic-password"))
                    .role(Role.USER).termsAgreed(true).build();
            em.persist(value); return value;
        });
        when(protection.beforeSession(any(), anyBoolean())).thenReturn(() -> { });
        when(protection.needsStepUp(any())).thenReturn(true);
        when(email.sendRiskLoginVerificationEmail(anyString(), anyString())).thenReturn(java.util.concurrent.CompletableFuture.completedFuture(null));
    }
    private Member current() { return members.findById(member.getId()).orElseThrow(); }

    private record VerifiedRisk(MfaService.Ticket ticket, String reference) { }
    private VerifiedRisk verifiedRisk() {
        var ticket = mfa.beginLogin(current(), null);
        String reference = mfa.status(ticket.value(), null, null).completionId();
        when(protection.verifyEmailCode(eq(ticket.value()), any(), eq("123456"))).thenReturn(true);
        mfa.verify(ticket.value(), null, null, "EMAIL", "123456");
        return new VerifiedRisk(ticket, reference);
    }
    @Test void completedVerificationCanConfirmOnlyTheExactCurrentSessionWithoutIssuingAnotherOne() {
        var proof = verifiedRisk();
        var session = mfa.finish(proof.ticket().value(), null, null, proof.reference()).session();
        String sid = tokens.getSessionId(session.accessToken());
        long count = completionSessions.count();
        assertThatCode(() -> mfa.confirmCompletion(proof.reference(), current(), sid)).doesNotThrowAnyException();
        assertThat(completionSessions.count()).isEqualTo(count);
        var another = tokens.issueSession(current(), null);
        assertThatThrownBy(() -> mfa.confirmCompletion(proof.reference(), current(), tokens.getSessionId(another.accessToken())))
                .isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.confirmCompletion(proof.reference(), null, sid)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.confirmCompletion("b".repeat(64), current(), sid)).isInstanceOf(AuthException.class);
    }
    @Test void completionCannotAcceptAnExpiredVersionOrWeakenRequiredAdministratorAuthentication() {
        var proof = verifiedRisk();
        var session = mfa.finish(proof.ticket().value(), null, null, proof.reference()).session();
        String sid = tokens.getSessionId(session.accessToken());
        tx.executeWithoutResult(ignored -> { var owner = members.findById(member.getId()).orElseThrow(); org.springframework.test.util.ReflectionTestUtils.setField(owner, "role", Role.ADMIN); });
        assertThatThrownBy(() -> mfa.confirmCompletion(proof.reference(), current(), sid)).isInstanceOf(AuthException.class);
        tx.executeWithoutResult(ignored -> {
            var owner = members.findById(member.getId()).orElseThrow(); org.springframework.test.util.ReflectionTestUtils.setField(owner, "role", Role.USER); owner.rotateAuthVersion();
        });
        assertThatThrownBy(() -> mfa.confirmCompletion(proof.reference(), current(), sid)).isInstanceOf(AuthException.class);
    }
    @Test void completionReferenceIsNotAnAuthenticationCredentialAndCannotFinishAnotherPendingTicket() throws Exception {
        var proof = verifiedRisk();
        var cookie = new jakarta.servlet.http.Cookie("mfa_ticket", proof.ticket().value());
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/mfa/finish")
                .header("Referer", "https://reserve.it.kr/login").cookie(cookie).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("completionId", "b".repeat(64)))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        assertThat(mfa.status(proof.ticket().value(), null, null).verified()).isTrue();
        var session = mfa.finish(proof.ticket().value(), null, null, proof.reference()).session();
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/mfa/completion")
                .header("Referer", "https://reserve.it.kr/login").contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("completionId", proof.reference()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/mfa/completion")
                .header("Referer", "https://reserve.it.kr/login").cookie(new jakarta.servlet.http.Cookie("access_token", session.accessToken()))
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("completionId", proof.reference()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().doesNotExist("Set-Cookie"));
        tx.executeWithoutResult(ignored -> {
            var challenge = completionChallenges.findById(proof.reference()).orElseThrow();
            org.springframework.test.util.ReflectionTestUtils.setField(challenge, "expiresAt", LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1));
        });
        assertThatThrownBy(() -> mfa.confirmCompletion(proof.reference(), current(), tokens.getSessionId(session.accessToken())))
                .isInstanceOf(AuthException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"/api", "/api/v1"})
    void actualHttpEmailStepUpValidatesTheDtoAndIssuesOnlyAfterConfirmation(String prefix) throws Exception {
        var started = http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(prefix + "/auth/login")
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("email", member.getEmail(), "password", "synthetic-password"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.purpose").value("RISK_LOGIN"))
                .andReturn().getResponse();
        String ticket = responseCookie(started, "mfa_ticket");
        var cookie = new jakarta.servlet.http.Cookie("mfa_ticket", ticket);
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(prefix + "/auth/mfa/email/send")
                .header("Referer", "https://reserve.it.kr/login").cookie(cookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        var code = ArgumentCaptor.forClass(String.class);
        verify(email).sendRiskLoginVerificationEmail(eq(member.getEmail()), code.capture());
        when(protection.verifyEmailCode(eq(ticket), any(), eq(code.getValue()))).thenReturn(true);
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(prefix + "/auth/mfa/verify")
                .header("Referer", "https://reserve.it.kr/login").cookie(cookie).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("kind", "PASSWORD", "proof", code.getValue()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(prefix + "/auth/mfa/verify")
                .header("Referer", "https://reserve.it.kr/login").cookie(cookie).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("kind", "EMAIL", "proof", code.getValue()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.verified").value(true));
        var finished = http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(prefix + "/auth/mfa/finish")
                .header("Referer", "https://reserve.it.kr/login").cookie(cookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn().getResponse();
        assertThat(tokens.verifyAuthentication(responseCookie(finished, "access_token")).loginMethod()).isEqualTo("PASSWORD");
    }
    private jakarta.servlet.http.Cookie access() {
        return new jakarta.servlet.http.Cookie("access_token", tokens.issueSession(current(), null).accessToken());
    }
    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder mutation(String path, jakarta.servlet.http.Cookie... cookies) throws Exception {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path).cookie(cookies)
                .header("Referer", "https://reserve.it.kr/my-page").header("X-Reserve-Member-Id", member.getId().toString())
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("currentPassword", "synthetic-password",
                        "newPassword", "SyntheticNext123!", "newPasswordConfirm", "SyntheticNext123!")));
    }
    private jakarta.servlet.http.Cookie confirmation(String action, jakarta.servlet.http.Cookie access) throws Exception {
        var response = http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/member/login-methods/confirm")
                .cookie(access).header("Referer", "https://reserve.it.kr/my-page").header("X-Reserve-Member-Id", member.getId().toString())
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("action", action, "password", "synthetic-password"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn().getResponse();
        return new jakarta.servlet.http.Cookie("mfa_ticket", responseCookie(response, "mfa_ticket"));
    }
    @ParameterizedTest @ValueSource(strings = {"/api/member/password", "/api/member/login-methods/password"})
    void sensitivePasswordMutationRequiresTheSameVerifiedActionBeforeEitherApiCanWrite(String path) throws Exception {
        var access = access();
        var proof = confirmation("CHANGE", access);
        http.perform(mutation(path, access, proof)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isPreconditionRequired());
        assertThat(current().getAuthVersion()).isZero();
        assertThat(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().matches("synthetic-password", current().getPassword())).isTrue();
        when(protection.verifyEmailCode(eq(proof.getValue()), any(), eq("123456"))).thenReturn(true);
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/mfa/verify").cookie(access, proof)
                .header("Referer", "https://reserve.it.kr/my-page").contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("kind", "EMAIL", "proof", "123456"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        http.perform(mutation(path, access, proof)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        assertThat(current().getAuthVersion()).isEqualTo(1);
        assertThat(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().matches("SyntheticNext123!", current().getPassword())).isTrue();
        assertThatThrownBy(() -> tokens.verifyAuthentication(access.getValue())).isInstanceOf(RuntimeException.class);
    }
    @Test void trustedBrowserStillNeedsFreshPrimaryAndCannotReuseTheProofForAnotherActionOrSession() throws Exception {
        when(protection.needsStepUp(any())).thenReturn(false);
        var access = access();
        var proof = confirmation("LINK", access);
        http.perform(mutation("/api/member/login-methods/password", access, proof))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isPreconditionRequired());
        assertThat(current().getAuthVersion()).isZero();
        var other = access();
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/mfa/status").cookie(other, proof)
                .header("Referer", "https://reserve.it.kr/my-page"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/member/login-methods/confirm").cookie(access)
                .header("Referer", "https://reserve.it.kr/my-page").header("X-Reserve-Member-Id", member.getId().toString())
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("action", "CHANGE", "password", "wrong"))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
    }
    @Test void newBrowserCannotRegisterCredentialsBeforeEmailConfirmationOrUseSensitiveProofForMfaManagement() {
        var access = access();
        String sid = tokens.getSessionId(access.getValue());
        var pending = mfa.beginManage(current(), sid, null, "synthetic-password");
        assertThat(mfa.status(pending.value(), current(), sid).emailAvailable()).isTrue();
        assertThatThrownBy(() -> mfa.beginTotp(pending.value(), current(), sid)).isInstanceOf(AuthException.class);
        when(protection.verifyEmailCode(eq(pending.value()), any(), eq("123456"))).thenReturn(true);
        mfa.verify(pending.value(), current(), sid, "EMAIL", "123456");
        assertThatCode(() -> mfa.beginTotp(pending.value(), current(), sid)).doesNotThrowAnyException();
        var action = mfa.beginSensitive(current(), sid, null, "synthetic-password", true, pending.value(), MfaService.SensitiveAction.LINK);
        when(protection.verifyEmailCode(eq(action.value()), any(), eq("123456"))).thenReturn(true);
        mfa.verify(action.value(), current(), sid, "EMAIL", "123456");
        assertThatThrownBy(() -> mfa.beginTotp(action.value(), current(), sid)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.finish(action.value(), current(), sid)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.disable(action.value(), current(), sid)).isInstanceOf(AuthException.class);
    }

    private static String responseCookie(org.springframework.mock.web.MockHttpServletResponse response, String name) {
        String prefix = name + "=";
        return response.getHeaders("Set-Cookie").stream().filter(value -> value.startsWith(prefix) && !value.contains("Max-Age=0"))
                .map(value -> value.substring(prefix.length(), value.indexOf(';'))).findFirst().orElseThrow();
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void unknownUnenrolledAccountRequiresAnEmailProofWithoutEnablingMfa(boolean persistent) {
        var ticket = mfa.beginLogin(current(), null, null, persistent);
        var view = mfa.status(ticket.value(), null, null);
        assertThat(view.purpose()).isEqualTo("RISK_LOGIN");
        assertThat(view.emailAvailable()).isTrue();
        assertThat(view.enrollmentRequired()).isFalse();
        assertThat(view.canDeferEnrollment()).isFalse();
        assertThatThrownBy(() -> mfa.finish(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.beginTotp(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.beginPasskey(ticket.value(), null, null, true)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.deferEnrollment(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        mfa.sendRiskEmail(ticket.value(), null, null);
        var sent = ArgumentCaptor.forClass(String.class);
        verify(email).sendRiskLoginVerificationEmail(eq(member.getEmail()), sent.capture());
        assertThat(sent.getValue()).matches("[0-9]{6}");
        when(protection.verifyEmailCode(eq(ticket.value()), any(), eq(sent.getValue()))).thenReturn(true);
        assertThat(mfa.verify(ticket.value(), null, null, "EMAIL", sent.getValue()).view().verified()).isTrue();
        var completed = mfa.finish(ticket.value(), null, null).session();
        assertThat(completed.persistent()).isEqualTo(persistent);
        assertThat(tokens.verifyAuthentication(completed.accessToken()).loginMethod()).isEqualTo("PASSWORD");
        assertThat(mfa.settings(current()).enabled()).isFalse();
        verify(protection).approveCurrent(any());
        assertThatThrownBy(() -> mfa.finish(ticket.value(), null, null)).isInstanceOf(AuthException.class);
    }
    @Test void wrongEmailProofCommitsFailureAndCannotUnlockRegistration() {
        var ticket = mfa.beginLogin(current(), null);
        assertThatThrownBy(() -> mfa.verify(ticket.value(), null, null, "EMAIL", "111111")).isInstanceOf(MfaService.RejectedProof.class);
        assertThat(mfa.status(ticket.value(), null, null).verified()).isFalse();
        assertThatThrownBy(() -> mfa.finish(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        verify(protection, never()).approveCurrent(any());
    }
    @Test void networkMismatchRejectsThePendingProofBeforeAnyEmailOrSession() {
        var ticket = mfa.beginLogin(current(), null);
        doThrow(new AuthException("접속 환경 확인이 필요해요.")).when(protection).requireBinding(eq(ticket.value()), any());
        assertThatThrownBy(() -> mfa.sendRiskEmail(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.verify(ticket.value(), null, null, "EMAIL", "111111")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.finish(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        verifyNoInteractions(email);
        verify(protection, never()).approveCurrent(any());
    }
    @Test void administratorKeepsMandatoryMfaAndNeverFallsBackToEmail() {
        tx.executeWithoutResult(ignored -> members.findById(member.getId()).orElseThrow().setRole(Role.ADMIN));
        var ticket = mfa.beginLogin(current(), null);
        assertThat(mfa.status(ticket.value(), null, null).purpose()).isEqualTo("LOGIN");
        assertThat(mfa.status(ticket.value(), null, null).emailAvailable()).isFalse();
        assertThatThrownBy(() -> mfa.sendRiskEmail(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.verify(ticket.value(), null, null, "EMAIL", "111111")).isInstanceOf(MfaService.RejectedProof.class);
        verify(protection, never()).bind(any(), any());
    }
    @ParameterizedTest @ValueSource(strings = {"TOTP", "BACKUP"})
    void anEnrolledOptionalAccountUsesExistingTotpAndRecoveryInsteadOfEmail(String kind) {
        when(protection.needsStepUp(any())).thenReturn(false);
        var primary = tokens.issueSession(current(), null);
        var sid = tokens.getSessionId(primary.accessToken());
        var setupTicket = mfa.beginManage(current(), sid, null, "synthetic-password");
        var setup = mfa.beginTotp(setupTicket.value(), current(), sid);
        var codes = mfa.confirmTotp(setupTicket.value(), current(), sid, MfaCrypto.code(setup.secret(), Instant.now().getEpochSecond() / 30, 6));
        mfa.finish(setupTicket.value(), null, null);
        when(protection.needsStepUp(any())).thenReturn(true);
        var ticket = mfa.beginLogin(current(), null);
        assertThat(mfa.status(ticket.value(), null, null).totpAvailable()).isTrue();
        assertThat(mfa.status(ticket.value(), null, null).emailAvailable()).isFalse();
        assertThatThrownBy(() -> mfa.sendRiskEmail(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        String proof = "BACKUP".equals(kind) ? codes.getFirst() : MfaCrypto.code(setup.secret(), Instant.now().getEpochSecond() / 30 + 1, 6);
        mfa.verify(ticket.value(), null, null, kind, proof);
        var session = mfa.finish(ticket.value(), null, null).session();
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo("PASSWORD");
        assertThat(mfa.settings(current()).recoveryCodes()).isEqualTo("BACKUP".equals(kind) ? 9 : 10);
        assertThatThrownBy(() -> mfa.verify(mfa.beginLogin(current(), null).value(), null, null, kind, proof))
                .isInstanceOf(MfaService.RejectedProof.class);
    }
    @Test void socialPrimaryProofKeepsItsExpiryAndOauthMethodAfterTheNetworkCheck() {
        LocalDateTime at = LocalDateTime.now(Clock.systemUTC()).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        tx.executeWithoutResult(ignored -> {
            var current = members.findById(member.getId()).orElseThrow();
            current.setProvider(AuthProvider.GOOGLE); current.setProviderId("synthetic-" + UUID.randomUUID()); current.setOauthAuthenticatedAt(at);
        });
        Instant expiry = Instant.now().plusSeconds(120);
        var ticket = mfa.beginLogin(current(), at, expiry, false);
        assertThat(mfa.status(ticket.value(), null, null).expiresAt()).isBeforeOrEqualTo(LocalDateTime.ofInstant(expiry, ZoneOffset.UTC));
        when(protection.verifyEmailCode(eq(ticket.value()), any(), eq("123456"))).thenReturn(true);
        mfa.verify(ticket.value(), null, null, "EMAIL", "123456");
        var session = mfa.finish(ticket.value(), null, null).session();
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo("OAUTH");
        assertThat(session.persistent()).isFalse();
    }
    @Test void knownEnvironmentDoesNotChangeOptionalLoginPolicy() {
        when(protection.needsStepUp(any())).thenReturn(false);
        assertThat(mfa.beginLogin(current(), null)).isNull();
        verify(protection, never()).bind(any(), any());
    }
    @Test void rolledBackSessionIssuanceNeverRecordsATrustedNetwork() {
        Runnable remember = mock(Runnable.class);
        when(protection.beforeSession(any(), anyBoolean())).thenReturn(remember);
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            tokens.issueSession(current(), null);
            throw new IllegalStateException("synthetic rollback");
        })).isInstanceOf(IllegalStateException.class);
        verify(remember, never()).run();
        tokens.issueSession(current(), null);
        verify(remember).run();
    }
}
