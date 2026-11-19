package kr.it.reserve.member.mfa;

import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.global.security.ip.IpLoginProtection.RegisteredBrowser;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
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
import java.util.List;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
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
    @Autowired kr.it.reserve.config.service.TokenService tokenService;
    @Autowired MfaChallengeRepository completionChallenges;
    @Autowired MfaRecoveryCodeRepository recoveryCodes;
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
    @Test void browserRegistrationRequiresTheCompletedLoginCookieAndExactLiveSession() throws Exception {
        var proof = verifiedRisk();
        var ticket = new Cookie("mfa_ticket", proof.ticket().value());
        String body = json.writeValueAsString(java.util.Map.of("completionId", proof.reference()));
        String route = "/api/member/mfa/remember-browser";
        http.perform(post(route).cookie(ticket).header("Referer", "https://reserve.it.kr/login")
                .contentType("application/json").content(body)).andExpect(status().isUnauthorized());

        var finished = http.perform(post("/api/auth/mfa/finish").cookie(ticket).header("Referer", "https://reserve.it.kr/login")
                .contentType("application/json").content(json.writeValueAsString(
                        java.util.Map.of("completionId", proof.reference(), "offerBrowserRegistration", true))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.browserRegistration").value("AVAILABLE"))
                .andReturn().getResponse();
        assertThat(finished.getHeaders("Set-Cookie")).noneMatch(value -> value.startsWith("mfa_ticket="));
        var access = new Cookie("access_token", responseCookie(finished, "access_token"));
        String sid = tokens.getSessionId(access.getValue());
        verify(protection, never()).rememberAfterLogin(any(), anyString(), anyString());
        assertThat(tokens.verifyAuthentication(access.getValue()).member().getId()).isEqualTo(member.getId());

        http.perform(post(route).cookie(access).header("Referer", "https://reserve.it.kr/login")
                .contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> mfa.rememberAfterLogin(ticket.getValue(), proof.reference(), current(),
                tokens.getSessionId(tokens.issueSession(current(), null).accessToken()))).isInstanceOf(AuthException.class);
        http.perform(post(route).cookie(access, ticket).header("Origin", "https://unrelated.example")
                .contentType("application/json").content(body)).andExpect(status().isForbidden());
        verify(protection, never()).rememberAfterLogin(any(), anyString(), anyString());

        http.perform(post(route).cookie(access, ticket).header("Referer", "https://reserve.it.kr/login")
                .contentType("application/json").content(body)).andExpect(status().isOk());
        verify(protection).rememberAfterLogin(argThat(owner -> owner.getId().equals(member.getId())), eq(sid), eq(ticket.getValue()));
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
    @Test void deviceManagementRequiresItsOwnProofAndRevokesOnlyTheSelectedOtherSession() throws Exception {
        when(protection.enabled()).thenReturn(true);
        when(protection.needsStepUp(any())).thenReturn(false);
        var local = tokens.issueSession(current(), null);
        var remote = tokens.issueSession(current(), null);
        var unregistered = tokens.issueSession(current(), null);
        String localSid = tokens.getSessionId(local.accessToken()), remoteSid = tokens.getSessionId(remote.accessToken());
        String unregisteredSid = tokens.getSessionId(unregistered.accessToken());
        var localAccess = new Cookie("access_token", local.accessToken());
        var remoteAccess = new Cookie("access_token", remote.accessToken());
        Member other = tx.execute(ignored -> {
            Member value = Member.builder().name("다른 합성 회원").email(UUID.randomUUID() + "@example.test").role(Role.USER).termsAgreed(true)
                    .password(current().getPassword()).build();
            em.persist(value); return value;
        });
        var otherSession = tokens.issueSession(other, null);
        String path = "/api/member/login-methods/devices";
        String localId = "a".repeat(64), remoteId = "b".repeat(64), legacyId = "c".repeat(64), otherId = "d".repeat(64);
        Instant expiry = Instant.now().plusSeconds(60);
        when(protection.registeredBrowsers(any(), eq(localSid))).thenReturn(List.of(
                new RegisteredBrowser(localId, "windows", "chrome", expiry, true, List.of("local-ref")),
                new RegisteredBrowser(remoteId, "ios", "safari", expiry, false, List.of("remote-ref")),
                new RegisteredBrowser(legacyId, "other", "other", expiry, false, List.of())));
        when(protection.sessionReference(any(), eq(remoteSid))).thenReturn("remote-ref");
        when(protection.sessionReference(any(), eq(localSid))).thenReturn("local-ref");
        when(protection.sessionReference(any(), eq(unregisteredSid))).thenReturn("unregistered-ref");

        http.perform(deviceRequest(get(path), member, localAccess)).andExpect(status().isPreconditionRequired());
        var wrongProof = confirmation("CHANGE", localAccess);
        http.perform(deviceRequest(get(path), member, localAccess, wrongProof)).andExpect(status().isPreconditionRequired());
        var proof = confirmation("DEVICES", localAccess);
        http.perform(deviceRequest(get(path), member, remoteAccess, proof)).andExpect(status().isPreconditionRequired());
        http.perform(deviceRequest(get(path), other, new Cookie("access_token", otherSession.accessToken()), proof))
                .andExpect(status().isPreconditionRequired());
        var listing = http.perform(deviceRequest(get(path), member, localAccess, proof))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[0].current").value(true))
                .andExpect(jsonPath("$.data[0].registered").value(true))
                .andExpect(jsonPath("$.data[1].sessionState").value("ACTIVE"))
                .andExpect(jsonPath("$.data[2].sessionState").value("UNKNOWN"))
                .andExpect(jsonPath("$.data[3].registered").value(false))
                .andExpect(jsonPath("$.data[3].sessionState").value("ACTIVE"))
                .andExpect(jsonPath("$.data[3].signedInAt").exists())
                .andExpect(jsonPath("$.data[1].sessionReferences").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(listing).doesNotContain(localSid, remoteSid, unregisteredSid);
        http.perform(deviceRequest(post(path + "/" + otherId + "/sign-out"), member, localAccess, proof)).andExpect(status().isNotFound());
        http.perform(deviceRequest(post(path + "/" + localId + "/sign-out"), member, localAccess, proof)).andExpect(status().isBadRequest());
        http.perform(deviceRequest(post(path + "/" + remoteId + "/sign-out"), member, localAccess, proof)).andExpect(status().isOk());
        assertThatThrownBy(() -> tokens.verifyAuthentication(remote.accessToken())).isInstanceOf(AuthException.class);
        assertThat(tokens.verifyAuthentication(unregistered.accessToken()).sessionId()).isEqualTo(unregisteredSid);
        assertThat(tokens.verifyAuthentication(local.accessToken()).sessionId()).isEqualTo(localSid);
        assertThat(tokens.verifyAuthentication(otherSession.accessToken()).member().getId()).isEqualTo(other.getId());
        http.perform(deviceRequest(get(path), member, localAccess, proof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[1].sessionState").value("UNKNOWN"));
        completionSessions.delete(completionSessions.findBySessionIdAndMemberId(unregisteredSid, member.getId()).orElseThrow());
        http.perform(deviceRequest(get(path), member, localAccess, proof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[1].sessionState").value("SIGNED_OUT"));
        http.perform(deviceRequest(delete(path + "/" + localId), member, localAccess, proof)).andExpect(status().isOk());
        verify(protection).forgetRegisteredBrowser(any(), eq(localId));
        assertThat(tokens.verifyAuthentication(local.accessToken()).sessionId()).isEqualTo(localSid);
        http.perform(deviceRequest(post(path), member, localAccess, proof)).andExpect(status().isOk());
        verify(protection).registerCurrentBrowser(any(), eq(localSid), eq(proof.getValue()));
        http.perform(deviceRequest(get(path), member, localAccess, proof)).andExpect(status().isOk());
    }

    @Test void disabledBrowserTrustStillAllowsVerifiedSessionManagementWithoutRegistration() throws Exception {
        when(protection.needsStepUp(any())).thenReturn(false);
        when(protection.browserStatus(any())).thenReturn("DISABLED");
        var local = access();
        var remote = access();
        var another = access();
        String path = "/api/member/login-methods/devices";
        LocalDateTime past = LocalDateTime.now(ZoneOffset.UTC).minusDays(1);
        var expired = new kr.it.reserve.config.jwt.entity.RefreshToken(member.getId(), UUID.randomUUID().toString(),
                UUID.randomUUID().toString(), null, past, past.plusMinutes(30), past.plusHours(1), 0, null, "PASSWORD");
        expired.bindRefreshToken("expired-synthetic-session");
        completionSessions.save(expired);

        http.perform(deviceRequest(get(path), member, local)).andExpect(status().isPreconditionRequired());
        http.perform(deviceRequest(get("/api/member/login-methods"), member, local))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.deviceSessionsAvailable").value(true))
                .andExpect(jsonPath("$.data.browserTrust").value("DISABLED"));
        var proof = confirmation("DEVICES", local);
        var body = http.perform(deviceRequest(get(path), member, local, proof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[0].current").value(true))
                .andExpect(jsonPath("$.data[0].registered").value(false))
                .andExpect(jsonPath("$.data[1].current").value(false))
                .andExpect(jsonPath("$.data[1].registered").value(false))
                .andExpect(jsonPath("$.data[2].current").value(false))
                .andExpect(jsonPath("$.data[2].registered").value(false))
                .andReturn().getResponse().getContentAsString();
        String localId = json.readTree(body).at("/data/0/id").asText();
        var remoteProof = confirmation("DEVICES", remote);
        var remoteBody = http.perform(deviceRequest(get(path), member, remote, remoteProof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].current").value(true))
                .andReturn().getResponse().getContentAsString();
        String remoteId = json.readTree(remoteBody).at("/data/0/id").asText();
        assertThat(remoteId).isNotBlank().isNotEqualTo(localId);
        http.perform(deviceRequest(post(path), member, local, proof)).andExpect(status().isBadRequest());
        http.perform(deviceRequest(delete(path + "/" + localId), member, local, proof)).andExpect(status().isBadRequest());
        http.perform(deviceRequest(post(path + "/" + localId + "/sign-out"), member, local, proof)).andExpect(status().isBadRequest());
        http.perform(deviceRequest(post(path + "/" + remoteId + "/sign-out"), member, local, proof)).andExpect(status().isOk());
        assertThatThrownBy(() -> tokens.verifyAuthentication(remote.getValue())).isInstanceOf(AuthException.class);
        assertThatCode(() -> tokens.verifyAuthentication(local.getValue())).doesNotThrowAnyException();
        assertThatCode(() -> tokens.verifyAuthentication(another.getValue())).doesNotThrowAnyException();
        var remaining = http.perform(deviceRequest(get(path), member, local, proof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(remaining).doesNotContain(remoteId);
        verify(protection, never()).registeredBrowsers(any(), any());
    }

    @Test void socialSessionCanVerifyDevicesWithOneRegisteredCodeWithoutAnotherPrimaryLogin() throws Exception {
        when(protection.enabled()).thenReturn(true);
        when(protection.needsStepUp(any())).thenReturn(true);
        LocalDateTime at = LocalDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        Member social = socialDeviceMember(AuthProvider.NAVER, Role.USER, true);
        var session = tokens.issueSession(social, at);
        var access = new Cookie("access_token", session.accessToken());
        String sid = tokens.getSessionId(session.accessToken());
        http.perform(deviceRequest(get("/api/member/login-methods"), social, access)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deviceFactorAvailable").value(true));
        var ticket = mfa.beginSensitive(social, sid, at, null, true, null, MfaService.SensitiveAction.DEVICES);
        var proof = new Cookie("mfa_ticket", ticket.value());
        var view = mfa.status(ticket.value(), social, sid);
        assertThat(view.passkeyOnly()).isFalse();
        assertThat(view.verified()).isFalse();
        assertThat(view.passkeyAvailable()).isFalse();
        assertThat(view.totpAvailable()).isTrue();
        assertThat(view.emailAvailable()).isFalse();
        assertThatThrownBy(() -> mfa.verify(ticket.value(), social, sid, "BACKUP", "fixture-code")).isInstanceOf(AuthException.class);
        http.perform(deviceRequest(get("/api/member/login-methods/devices"), social, access, proof)).andExpect(status().isPreconditionRequired());
        assertThatThrownBy(() -> mfa.beginSensitive(social, sid, at, null, true, null, MfaService.SensitiveAction.LINK))
                .isInstanceOf(AuthException.class);
        var verified = mfa.verify(ticket.value(), social, sid, "TOTP",
                MfaCrypto.code(DEVICE_SECRET, Instant.now().getEpochSecond() / 30, 6));
        assertThat(verified.view().verified()).isTrue();
        http.perform(deviceRequest(get("/api/member/login-methods/devices"), social, access, proof)).andExpect(status().isOk());
        assertThat(tokens.getLoginMethod(session.accessToken())).isEqualTo("OAUTH");
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void enrolledMemberCanUseFreshPasswordOnceButExistingSessionAloneDoesNotVerifyDevices(boolean browserProtection) {
        when(protection.enabled()).thenReturn(browserProtection);
        when(protection.needsStepUp(any())).thenReturn(false);
        var primary = tokens.issueSession(current(), null);
        String primarySid = tokens.getSessionId(primary.accessToken());
        var setupTicket = mfa.beginManage(current(), primarySid, null, "synthetic-password");
        var setup = mfa.beginTotp(setupTicket.value(), current(), primarySid);
        var enrolled = mfa.confirmTotp(setupTicket.value(), current(), primarySid,
                MfaCrypto.code(setup.secret(), Instant.now().getEpochSecond() / 30, 6));
        String sid = tokens.getSessionId(enrolled.session().accessToken());
        var ticket = mfa.beginSensitive(current(), sid, null, "synthetic-password", true, null, MfaService.SensitiveAction.DEVICES);
        var view = mfa.status(ticket.value(), current(), sid);
        assertThat(view.verified()).isTrue();
        assertThat(view.totpAvailable()).isTrue();
        assertThat(view.emailAvailable()).isFalse();
        assertThatThrownBy(() -> mfa.finish(ticket.value(), current(), sid)).isInstanceOf(AuthException.class);
        var withoutPrimary = mfa.beginSensitive(current(), sid, null, null, true, ticket.value(), MfaService.SensitiveAction.DEVICES);
        assertThat(mfa.status(withoutPrimary.value(), current(), sid).verified()).isFalse();
        assertThatThrownBy(() -> mfa.beginSensitive(current(), sid, null, null, true, withoutPrimary.value(), MfaService.SensitiveAction.CHANGE))
                .isInstanceOf(AuthException.class);
        var strongSession = tokens.issueVerifiedSession(current(), null, "PASSWORD_MFA");
        String strongSid = tokens.getSessionId(strongSession.accessToken());
        var change = mfa.beginSensitive(current(), strongSid, null, null, true, null, MfaService.SensitiveAction.CHANGE);
        assertThat(mfa.status(change.value(), current(), strongSid).verified()).isFalse();
    }

    private static final String DEVICE_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

    private Member socialDeviceMember(AuthProvider provider, Role role, boolean enrolled) {
        return tx.execute(ignored -> {
            Member value = Member.builder().name("합성 기기 회원").email(UUID.randomUUID() + "@example.test")
                    .provider(provider).providerId(UUID.randomUUID().toString()).role(role).termsAgreed(true).build();
            em.persist(value);
            if (enrolled) {
                var account = new MfaAccount(value.getId(), LocalDateTime.now(ZoneOffset.UTC));
                account.enable(); em.persist(account);
                em.persist(MfaCredential.totp(value.getId(), crypto.encrypt(DEVICE_SECRET, value.getId()), -1, LocalDateTime.now(ZoneOffset.UTC)));
            }
            return value;
        });
    }

    @ParameterizedTest
    @CsvSource({"NAVER, USER", "GOOGLE, USER", "KAKAO, USER", "NAVER, BUSINESS", "GOOGLE, BUSINESS", "KAKAO, BUSINESS",
            "NAVER, ADMIN", "GOOGLE, ADMIN", "KAKAO, ADMIN"})
    void freshSocialProofOpensOnlyDevicesWithoutRepeatingAnEnrolledFactor(AuthProvider provider, Role role) throws Exception {
        when(protection.needsStepUp(any())).thenReturn(false);
        Member social = socialDeviceMember(provider, role, true);
        LocalDateTime earlier = LocalDateTime.now(ZoneOffset.UTC).minusMinutes(10);
        var initial = role == Role.ADMIN ? tokens.issueVerifiedSession(social, earlier, "OAUTH_MFA") : tokens.issueSession(social, earlier);
        LocalDateTime at = LocalDateTime.now(ZoneOffset.UTC);
        var session = tokens.reauthenticateOAuth(social, initial.accessToken(), at);
        String sid = tokens.getSessionId(session.accessToken());
        var access = new Cookie("access_token", session.accessToken());
        var response = http.perform(deviceRequest(post("/api/member/login-methods/confirm"), social, access)
                        .contentType("application/json").content("{\"action\":\"DEVICES\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.verified").value(true)).andReturn().getResponse();
        var proof = response.getCookie("mfa_ticket");
        http.perform(deviceRequest(get("/api/member/login-methods/devices"), social, access, proof)).andExpect(status().isOk());
        assertThat(completionChallenges.findById(MfaCrypto.digest(proof.getValue())).orElseThrow().getPrimaryMethod()).isEqualTo("OAUTH_DEVICES");
        assertThatThrownBy(() -> mfa.beginTotp(proof.getValue(), social, sid)).isInstanceOf(AuthException.class);
        if (role == Role.ADMIN) {
            assertThat(tokens.getLoginMethod(session.accessToken())).isEqualTo("OAUTH_MFA");
            assertThat(mfa.beginLogin(social, at)).isNotNull();
            var otherAction = mfa.beginSensitive(social, sid, at, null, true, null, MfaService.SensitiveAction.REMOVE);
            assertThat(mfa.status(otherAction.value(), social, sid).verified()).isFalse();
        }
        when(protection.needsStepUp(any())).thenReturn(true);
        http.perform(deviceRequest(get("/api/member/login-methods/devices"), social, access, proof)).andExpect(status().isPreconditionRequired());
    }

    @ParameterizedTest @EnumSource(value = AuthProvider.class, names = {"NAVER", "GOOGLE", "KAKAO"})
    void socialMemberWithoutPasskeyOrTotpCanManageDevicesAfterFreshSocialProof(AuthProvider provider) throws Exception {
        when(protection.needsStepUp(any())).thenReturn(false);
        Member social = socialDeviceMember(provider, Role.USER, false);
        LocalDateTime at = LocalDateTime.now(ZoneOffset.UTC);
        var session = tokens.issueSession(social, at);
        var ticket = mfa.beginSensitive(social, tokens.getSessionId(session.accessToken()), at, null, true, null, MfaService.SensitiveAction.DEVICES);
        assertThat(mfa.status(ticket.value(), social, tokens.getSessionId(session.accessToken())).verified()).isTrue();
        http.perform(deviceRequest(get("/api/member/login-methods/devices"), social,
                new Cookie("access_token", session.accessToken()), new Cookie("mfa_ticket", ticket.value()))).andExpect(status().isOk());
    }

    @Test void deviceProofCannotKeepUsingABasicSessionAfterMandatoryProtectionIsEnabled() {
        when(protection.needsStepUp(any())).thenReturn(false);
        Member social = socialDeviceMember(AuthProvider.GOOGLE, Role.USER, true);
        LocalDateTime at = LocalDateTime.now(ZoneOffset.UTC);
        var session = tokens.issueSession(social, at);
        String sid = tokens.getSessionId(session.accessToken());
        var ticket = mfa.beginSensitive(social, sid, at, null, true, null, MfaService.SensitiveAction.DEVICES);
        tx.executeWithoutResult(ignored -> em.find(Member.class, social.getId()).setAccountRecoveryMfaRequired(true));
        Member protectedMember = members.findById(social.getId()).orElseThrow();
        assertThatThrownBy(() -> mfa.status(ticket.value(), protectedMember, sid)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> mfa.beginSensitive(protectedMember, sid, at, null, true, null, MfaService.SensitiveAction.DEVICES))
                .isInstanceOf(AuthException.class);
    }

    private MockHttpServletRequestBuilder deviceRequest(MockHttpServletRequestBuilder request, Member owner, Cookie... cookies) {
        return request.header("Referer", "https://reserve.it.kr/my-page")
                .header("X-Reserve-Member-Id", owner.getId().toString()).cookie(cookies)
                .with(incoming -> { incoming.setRemoteAddr("192.0.2.37"); return incoming; });
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
        assertThat(view.recoveryCodeAvailable()).isFalse();
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
        var codes = mfa.confirmTotp(setupTicket.value(), current(), sid, MfaCrypto.code(setup.secret(), Instant.now().getEpochSecond() / 30, 6)).codes();
        mfa.finish(setupTicket.value(), null, null);
        when(protection.needsStepUp(any())).thenReturn(true);
        var ticket = mfa.beginLogin(current(), null);
        var view = mfa.status(ticket.value(), null, null);
        assertThat(view.totpAvailable()).isTrue();
        assertThat(view.emailAvailable()).isFalse();
        assertThat(view.recoveryCodeAvailable()).isTrue();
        assertThatThrownBy(() -> mfa.sendRiskEmail(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        String proof = "BACKUP".equals(kind) ? codes.getFirst() : MfaCrypto.code(setup.secret(), Instant.now().getEpochSecond() / 30 + 1, 6);
        mfa.verify(ticket.value(), null, null, kind, proof);
        var session = mfa.finish(ticket.value(), null, null).session();
        assertThat(tokens.verifyAuthentication(session.accessToken()).loginMethod()).isEqualTo("PASSWORD");
        assertThat(mfa.settings(current()).recoveryCodes()).isEqualTo("BACKUP".equals(kind) ? 9 : 10);
        assertThatThrownBy(() -> mfa.verify(mfa.beginLogin(current(), null).value(), null, null, kind, proof))
                .isInstanceOf(MfaService.RejectedProof.class);
        tx.executeWithoutResult(ignored -> recoveryCodes.deleteByMemberId(member.getId()));
        var afterExhaustion = mfa.beginLogin(current(), null);
        assertThat(mfa.status(afterExhaustion.value(), null, null).recoveryCodeAvailable()).isFalse();
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
    @Test void onlyCommittedInteractiveLoginRenewsARegisteredBrowser() {
        Runnable remember = mock(Runnable.class);
        when(protection.beforeSession(any(), anyBoolean())).thenReturn(remember);
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            tokens.issueSession(current(), null, true);
            throw new IllegalStateException("synthetic rollback");
        })).isInstanceOf(IllegalStateException.class);
        verify(remember, never()).run();
        verify(protection, never()).renewBrowserAfterLogin(any());
        var login = tokens.issueSession(current(), null, true);
        verify(remember).run();
        verify(protection).renewBrowserAfterLogin(any());
        tokenService.refresh(login.refreshToken());
        tokens.issueReplacementSession(current(), null, null, true);
        verify(protection, times(1)).renewBrowserAfterLogin(any());
    }
}
