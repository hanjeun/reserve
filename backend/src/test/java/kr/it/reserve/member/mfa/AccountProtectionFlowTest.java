package kr.it.reserve.member.mfa;

import kr.it.reserve.audit.entity.AuditLog;
import kr.it.reserve.audit.repository.AuditLogRepository;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:account-protection;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
        "reserve.mfa.enabled=true", "reserve.mfa.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@AutoConfigureMockMvc
class AccountProtectionFlowTest {
    private static final String OWNER_CODE = "synthetic-owner-recovery";
    private static final String ORIGIN = "https://reserve.it.kr";
    private static final String RECOVERY = "/api/v1/auth/account-recovery/";

    @Autowired MockMvc http;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
    @Autowired MemberRepository members;
    @Autowired MfaAccountRepository accounts;
    @Autowired MfaCredentialRepository credentials;
    @Autowired MfaRecoveryCodeRepository recovery;
    @Autowired RefreshTokenRepository sessions;
    @Autowired MfaCrypto crypto;
    @Autowired TokenProvider tokens;
    @Autowired PasswordEncoder passwords;
    @Autowired AuditLogRepository audit;
    @MockitoBean EmailService email;

    @Test
    void protectionRequiresFreshTargetBoundMfaRevokesAllSessionsAndRecoveryKeepsMfaRequired() throws Exception {
        Fixture admin = account(Role.ADMIN, true);
        Fixture owner = account(Role.USER, true);
        Fixture other = account(Role.USER, true);
        var adminAccess = new Cookie("access_token", tokens.issueVerifiedSession(admin.member(), null, "PASSWORD_MFA").accessToken());
        var ownerSession = tokens.issueSession(owner.member(), null);
        var secondDevice = tokens.issueSession(owner.member(), null);
        String path = adminPath(owner.member());
        when(email.sendAccountProtectionEmail(anyString(), nullable(String.class))).thenReturn(CompletableFuture.completedFuture(null));

        http.perform(write(path + "/confirm", Map.of("resend", false), new Cookie("access_token", ownerSession.accessToken())))
                .andExpect(status().isForbidden());
        var pending = http.perform(write(path + "/confirm", Map.of("resend", false), adminAccess))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.verified").value(false)).andReturn().getResponse();
        Cookie adminProof = cookie(pending, "mfa_ticket");
        var action = Map.of("resend", false, "reason", "합성 계정 탈취 신고");
        http.perform(write(path, action, adminAccess, adminProof)).andExpect(status().isPreconditionRequired());
        http.perform(write("/api/auth/mfa/verify", Map.of("kind", "TOTP", "proof", code(admin.secret())), adminAccess, adminProof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.verified").value(true));
        http.perform(write(adminPath(other.member()), action, adminAccess, adminProof)).andExpect(status().isPreconditionRequired());
        http.perform(write(path, Map.of("resend", true), adminAccess, adminProof)).andExpect(status().isPreconditionRequired());
        http.perform(write("/api/auth/mfa/finish", Map.of(), adminAccess, adminProof)).andExpect(status().isUnauthorized());
        verifyNoInteractions(email);

        http.perform(write(path, action, adminAccess, adminProof)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.notificationSubmitted").value(true));
        http.perform(write(path, action, adminAccess, adminProof)).andExpect(status().isPreconditionRequired());
        assertThat(current(owner).isAccountProtected()).isTrue();
        assertThat(current(owner).getAuthVersion()).isEqualTo(owner.member().getAuthVersion() + 1);
        assertThat(sessions.findAuthenticationBySessionIdAndMemberId(tokens.getSessionId(secondDevice.accessToken()), owner.member().getId())).isEmpty();
        assertThatThrownBy(() -> tokens.verifyAuthentication(ownerSession.accessToken())).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> tokens.issueSession(current(owner), null)).isInstanceOf(AuthException.class);
        http.perform(write("/api/auth/refresh", Map.of(), new Cookie("refresh_token", secondDevice.refreshToken())))
                .andExpect(status().isUnauthorized());
        http.perform(write("/api/auth/login", Map.of("email", owner.member().getEmail(), "password", "synthetic-password")))
                .andExpect(status().isForbidden());
        http.perform(write("/api/auth/login", Map.of("email", owner.member().getEmail(), "password", "wrong-password")))
                .andExpect(status().isUnauthorized());
        assertThat(current(other).isAccountProtected()).isFalse();

        String key = mailedKey(owner);
        var recoveryStart = http.perform(write(RECOVERY + "start", Map.of("key", key)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totpAvailable").value(true))
                .andExpect(jsonPath("$.data.recoveryCodeAvailable").value(true)).andReturn().getResponse();
        Cookie recoveryProof = cookie(recoveryStart, "account_recovery");
        var backup = Map.of("kind", "BACKUP", "proof", OWNER_CODE);
        http.perform(write(RECOVERY + "complete", backup)).andExpect(status().isUnauthorized());
        http.perform(write(RECOVERY + "complete", backup, recoveryProof).header("Origin", "https://unrelated.example"))
                .andExpect(status().isForbidden());
        http.perform(write("/api/auth/mfa/verify", backup, new Cookie("mfa_ticket", recoveryProof.getValue())))
                .andExpect(status().isUnauthorized());
        http.perform(write(RECOVERY + "complete", Map.of("kind", "BACKUP", "proof", "not-the-recovery-code"), recoveryProof))
                .andExpect(status().isBadRequest());
        assertThat(current(owner).isAccountProtected()).isTrue();

        http.perform(write(RECOVERY + "complete", backup, recoveryProof)).andExpect(status().isBadRequest());
        var prepared = http.perform(write(RECOVERY + "backup", Map.of("code", OWNER_CODE), recoveryProof))
                .andExpect(status().isOk()).andReturn().getResponse();
        String replacement = json.readTree(prepared.getContentAsString()).path("data").path("code").asText();
        http.perform(write(RECOVERY + "backup", Map.of("code", OWNER_CODE), recoveryProof))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.code").value(replacement));
        assertThat(current(owner).isAccountProtected()).isTrue();
        assertThat(recovery.existsById(MfaCrypto.digest(owner.member().getId() + ":" + OWNER_CODE))).isTrue();
        assertThat(recovery.existsById(MfaCrypto.digest(owner.member().getId() + ":" + replacement))).isFalse();

        var recovered = http.perform(write(RECOVERY + "complete", backup, recoveryProof))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(recovered.getHeaders("Set-Cookie")).noneMatch(value -> value.startsWith("access_token=") || value.startsWith("refresh_token="));
        assertThat(current(owner).isAccountProtected()).isFalse();
        assertThat(current(owner).isAccountRecoveryMfaRequired()).isTrue();
        assertThat(audit.findAll().stream().filter(log -> log.getEntityId().equals(owner.member().getId()))
                .map(AuditLog::getAction)).contains("ACCOUNT_PROTECTED", "ACCOUNT_RECOVERED");
        assertThat(recovery.existsById(MfaCrypto.digest(owner.member().getId() + ":" + OWNER_CODE))).isFalse();
        assertThat(recovery.existsById(MfaCrypto.digest(owner.member().getId() + ":" + replacement))).isTrue();
        verify(email).sendAccountProtectionEmail(owner.member().getSecurityContactEmail(), null);
        http.perform(write(RECOVERY + "start", Map.of("key", key))).andExpect(status().isUnauthorized());
        http.perform(write(RECOVERY + "complete", backup, recoveryProof)).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> tokens.issueSession(current(owner), null)).isInstanceOf(AuthException.class);
        var login = http.perform(write("/api/auth/login", Map.of("email", owner.member().getEmail(), "password", "synthetic-password")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.mfaRequired").value(true)).andReturn().getResponse();
        Cookie loginProof = cookie(login, "mfa_ticket");
        http.perform(write("/api/auth/mfa/verify", Map.of("kind", "TOTP", "proof", code(owner.secret())), loginProof))
                .andExpect(status().isOk());
        var finished = http.perform(write("/api/auth/mfa/finish", Map.of(), loginProof))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(tokens.verifyAuthentication(cookie(finished, "access_token").getValue()).loginMethod()).isEqualTo("PASSWORD_MFA");
    }

    @Test
    void unavailableMailKeepsProtectionActiveAndResendSupersedesThePriorLink() throws Exception {
        Fixture admin = account(Role.ADMIN, true);
        Fixture nextAdmin = account(Role.ADMIN, true);
        Fixture owner = account(Role.USER, true);
        Fixture withoutContact = account(Role.USER, false);
        when(email.sendAccountProtectionEmail(anyString(), nullable(String.class)))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("synthetic mail outage")))
                .thenReturn(CompletableFuture.completedFuture(null));
        var adminAccess = new Cookie("access_token", tokens.issueVerifiedSession(admin.member(), null, "PASSWORD_MFA").accessToken());
        var path = adminPath(owner.member());
        http.perform(write(adminPath(withoutContact.member()) + "/confirm", Map.of("resend", false), adminAccess))
                .andExpect(status().isBadRequest());
        http.perform(write(adminPath(nextAdmin.member()) + "/confirm", Map.of("resend", false), adminAccess))
                .andExpect(status().isForbidden());

        Cookie initial = verifyAdmin(admin, adminAccess, path, false);
        http.perform(write(path, Map.of("resend", false, "reason", "합성 메일 오류 시험"), adminAccess, initial))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.notificationSubmitted").value(false));
        assertThat(current(owner).isAccountProtected()).isTrue();
        String previousKey = mailedKey(owner);
        var oldProof = cookie(http.perform(write(RECOVERY + "start", Map.of("key", previousKey)))
                .andExpect(status().isOk()).andReturn().getResponse(), "account_recovery");

        var nextAccess = new Cookie("access_token", tokens.issueVerifiedSession(nextAdmin.member(), null, "PASSWORD_MFA").accessToken());
        Cookie resend = verifyAdmin(nextAdmin, nextAccess, path, true);
        http.perform(write(path, Map.of("resend", true), nextAccess, resend)).andExpect(status().isTooManyRequests());
        var current = current(owner);
        current.setAccountRecoveryLink(current.getAccountRecoveryDigest(), current.getAccountRecoveryExpiresAt().minusMinutes(2));
        members.saveAndFlush(current);
        http.perform(write(path, Map.of("resend", true), nextAccess, resend))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.notificationSubmitted").value(true));
        http.perform(write(RECOVERY + "start", Map.of("key", previousKey))).andExpect(status().isUnauthorized());
        http.perform(write(RECOVERY + "complete", Map.of("kind", "BACKUP", "proof", OWNER_CODE), oldProof))
                .andExpect(status().isUnauthorized());
        assertThat(current(owner).isAccountProtected()).isTrue();
    }

    @Test
    void aChangedMemberVersionRequiresNewAdministratorProof() throws Exception {
        Fixture admin = account(Role.ADMIN, true);
        Fixture owner = account(Role.USER, true);
        var access = new Cookie("access_token", tokens.issueVerifiedSession(admin.member(), null, "PASSWORD_MFA").accessToken());
        String path = adminPath(owner.member());
        Cookie proof = verifyAdmin(admin, access, path, false);
        Member changed = current(owner);
        changed.rotateAuthVersion();
        members.saveAndFlush(changed);
        http.perform(write(path, Map.of("resend", false, "reason", "합성 변경 시험"), access, proof))
                .andExpect(status().isPreconditionRequired());
        assertThat(current(owner).isAccountProtected()).isFalse();
        verifyNoInteractions(email);
    }

    @Test
    void emailCodeUsesVerifiedContactAndOnlyOpensTheExistingFactorStep() throws Exception {
        Fixture owner = account(Role.USER, true);
        Member protectedMember = current(owner);
        String contact = protectedMember.getSecurityContactEmail();
        String link = crypto.randomToken();
        String digest = MfaCrypto.digest(link);
        protectedMember.setAccountRecoveryLink(digest, LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1));
        members.saveAndFlush(protectedMember);
        String notice = "요청을 받았어요. 잠긴 계정의 보안 이메일이면 인증 코드를 보내요.";
        String unknownEmail = "absent-" + UUID.randomUUID() + "@example.test";
        var unknown = http.perform(write(RECOVERY + "email/send-code", Map.of("email", unknownEmail)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value(notice))
                .andExpect(jsonPath("$.data.expiresAt").isString()).andReturn().getResponse();
        var sent = http.perform(write(RECOVERY + "email/send-code", Map.of("email", contact.toUpperCase(java.util.Locale.ROOT))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value(notice))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        assertThat(sent.getHeaders("Set-Cookie")).isEmpty();
        String reference = json.readTree(sent.getContentAsString()).path("data").path("reference").asText();
        String unknownReference = json.readTree(unknown.getContentAsString()).path("data").path("reference").asText();
        var code = ArgumentCaptor.forClass(String.class);
        verify(email, timeout(5000)).sendAccountRecoveryCodeEmail(eq(contact), code.capture());
        verify(email, never()).sendAccountRecoveryCodeEmail(eq(unknownEmail), anyString());
        assertThat(current(owner).getAccountRecoveryDigest()).isEqualTo(digest);
        http.perform(write(RECOVERY + "start", Map.of("key", link))).andExpect(status().isUnauthorized());
        http.perform(write(RECOVERY + "passkey", Map.of(), new Cookie("account_recovery", reference)))
                .andExpect(status().isUnauthorized());
        http.perform(write(RECOVERY + "email/verify-code", Map.of("reference", unknownReference, "code", code.getValue())))
                .andExpect(status().isBadRequest());
        http.perform(write(RECOVERY + "email/verify-code", Map.of("reference", reference, "code", "000000")))
                .andExpect(status().isBadRequest());

        var proof = Map.of("reference", reference, "code", code.getValue());
        var verified = http.perform(write(RECOVERY + "email/verify-code", proof)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totpAvailable").value(true)).andReturn().getResponse();
        assertThat(verified.getHeaders("Set-Cookie")).noneMatch(value -> value.startsWith("access_token=") || value.startsWith("refresh_token="));
        assertThat(current(owner).isAccountProtected()).isTrue();
        http.perform(write(RECOVERY + "email/verify-code", proof)).andExpect(status().isBadRequest());
        when(email.sendAccountProtectionEmail(eq(contact), isNull())).thenReturn(CompletableFuture.completedFuture(null));
        http.perform(write(RECOVERY + "complete", Map.of("kind", "TOTP", "proof", code(owner.secret())), cookie(verified, "account_recovery")))
                .andExpect(status().isOk());
        assertThat(current(owner).isAccountProtected()).isFalse();
        assertThat(current(owner).isAccountRecoveryMfaRequired()).isTrue();
    }

    private Cookie verifyAdmin(Fixture admin, Cookie access, String path, boolean resend) throws Exception {
        var started = http.perform(write(path + "/confirm", Map.of("resend", resend), access))
                .andExpect(status().isOk()).andReturn().getResponse();
        Cookie ticket = cookie(started, "mfa_ticket");
        http.perform(write("/api/auth/mfa/verify", Map.of("kind", "TOTP", "proof", code(admin.secret())), access, ticket))
                .andExpect(status().isOk());
        return ticket;
    }

    private String mailedKey(Fixture fixture) {
        var link = ArgumentCaptor.forClass(String.class);
        verify(email).sendAccountProtectionEmail(eq(fixture.member().getSecurityContactEmail()), link.capture());
        return link.getValue().split("#key=", 2)[1];
    }

    private MockHttpServletRequestBuilder write(String path, Map<String, ?> body, Cookie... credentials) throws Exception {
        var request = post(path).header("Referer", ORIGIN + "/login").contentType("application/json")
                .content(json.writeValueAsString(body));
        return credentials.length == 0 ? request : request.cookie(credentials);
    }

    private static Cookie cookie(MockHttpServletResponse response, String name) {
        String prefix = name + "=";
        String value = response.getHeaders("Set-Cookie").stream()
                .filter(header -> header.startsWith(prefix) && !header.contains("Max-Age=0"))
                .findFirst().orElseThrow().split(";", 2)[0].substring(prefix.length());
        return new Cookie(name, value);
    }

    protected record Fixture(Member member, String secret) { }

    protected Fixture account(Role role, boolean withContact) {
        String suffix = UUID.randomUUID().toString();
        Member member = members.saveAndFlush(Member.builder().email("login-" + suffix + "@example.test")
                .securityContactEmail(withContact ? "verified-" + suffix + "@example.test" : null).name("합성 회원")
                .role(role).provider(AuthProvider.LOCAL).password(passwords.encode("synthetic-password")).termsAgreed(true).build());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        var account = new MfaAccount(member.getId(), now);
        account.enable();
        accounts.saveAndFlush(account);
        String secret = crypto.newTotpSecret();
        credentials.saveAndFlush(MfaCredential.totp(member.getId(), crypto.encrypt(secret, member.getId()), -1, now));
        recovery.saveAndFlush(new MfaRecoveryCode(MfaCrypto.digest(member.getId() + ":" + OWNER_CODE), member.getId()));
        return new Fixture(member, secret);
    }

    protected Member current(Fixture fixture) { return members.findById(fixture.member().getId()).orElseThrow(); }
    private static String adminPath(Member member) { return "/api/admin/manage/members/" + member.getId() + "/account-protection"; }
    private static String code(String secret) { return MfaCrypto.code(secret, Instant.now().getEpochSecond() / 30, 6); }
}
