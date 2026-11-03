package kr.it.reserve.global.security.ip;

import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.mfa.MfaCrypto;
import kr.it.reserve.member.mfa.MfaService;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:mfa-browser-continuation;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
        "reserve.mfa.enabled=true", "reserve.mfa.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "reserve.security.ip-protection.enabled=true",
        "reserve.security.ip-protection.fingerprint-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
class MfaBrowserContinuationTest {
    @Autowired MfaService mfa;
    @Autowired TokenProvider tokens;
    @Autowired MemberRepository members;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean IpProtectionStore store;
    @MockitoBean kr.it.reserve.email.service.EmailService email;
    private MockHttpServletRequest request;
    private Member member;
    private String sid;
    private TransactionTemplate tx;

    @BeforeEach void fixture() {
        tx = new TransactionTemplate(transactions);
        member = tx.execute(ignored -> {
            var value = Member.builder().name("합성 회원").email(UUID.randomUUID() + "@example.test")
                    .password(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("synthetic-password"))
                    .role(Role.USER).termsAgreed(true).build();
            em.persist(value);
            return value;
        });
        var original = new AtomicReference<String>();
        var remembered = new java.util.HashSet<String>();
        when(store.browser(anyString(), anyString(), anyString(), anyString(), anyString())).thenAnswer(call -> {
            String scope = call.getArgument(0);
            original.compareAndSet(null, scope);
            return original.get().equals(scope) || remembered.contains(scope) ? 1L : 0L;
        });
        doAnswer(call -> { remembered.add(call.getArgument(0)); return null; }).when(store).rememberBrowser(anyString(), anyString(), anyString(), anyString(), anyString());
        Map<String, String> bindings = new HashMap<>();
        doAnswer(call -> { bindings.put(call.getArgument(0), call.getArgument(1)); return null; }).when(store).bind(anyString(), anyString());
        when(store.binding(anyString(), anyString())).thenAnswer(call -> call.getArgument(1).equals(bindings.get(call.getArgument(0))));
        request = browser("192.0.2.7");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        sid = tokens.getSessionId(tokens.issueSession(current(), null).accessToken());
    }
    @AfterEach void cleanup() { RequestContextHolder.resetRequestAttributes(); }
    private Member current() { return members.findById(member.getId()).orElseThrow(); }
    private MockHttpServletRequest browser(String ip) {
        var value = new MockHttpServletRequest();
        value.setRemoteAddr(ip);
        value.addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/136.0.0.0 Safari/537.36");
        value.setCookies(new Cookie("__Host-reserve_browser", "a".repeat(43)));
        return value;
    }
    private MfaService.Ticket enrolled() {
        var ticket = mfa.beginManage(current(), sid, null, "synthetic-password");
        var setup = mfa.beginTotp(ticket.value(), current(), sid);
        String code = org.springframework.test.util.ReflectionTestUtils.invokeMethod(MfaCrypto.class, "code", setup.secret(), Instant.now().getEpochSecond() / 30, 6);
        mfa.confirmTotp(ticket.value(), current(), sid, code);
        return ticket;
    }
    @Test void verifiedEnrollmentContinuesOnlyTheOriginalBrowserAfterRotatingTheAuthenticationVersion() {
        var ticket = enrolled();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(browser("192.0.2.7")));
        assertThat(current().getAuthVersion()).isEqualTo(1);
        var result = mfa.finish(ticket.value(), null, null).session();
        assertThat(tokens.verifyAuthentication(result.accessToken()).loginMethod()).isEqualTo("PASSWORD");
        assertThatThrownBy(() -> mfa.finish(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        verify(store, never()).rememberBrowser(anyString(), anyString(), anyString(), anyString(), anyString());
    }
    @ParameterizedTest @ValueSource(strings = {"address", "cookie", "family"})
    void aChangedEnvironmentCannotResumeTheManagementEnrollment(String changed) {
        var ticket = enrolled();
        var other = browser(changed.equals("address") ? "198.51.100.8" : "192.0.2.7");
        if (changed.equals("cookie")) other.setCookies(new Cookie("__Host-reserve_browser", "b".repeat(43)));
        if (changed.equals("family")) { other.removeHeader("User-Agent"); other.addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 14) Chrome/136.0.0.0 Mobile Safari/537.36"); }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(other));
        assertThatThrownBy(() -> mfa.finish(ticket.value(), null, null)).isInstanceOf(AuthException.class);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(browser("192.0.2.7")));
        assertThat(mfa.status(ticket.value(), null, null).verified()).isTrue();
    }
    @Test void recoveryRenewalContinuesTheConfirmedBrowserWithoutChangingItsPrimaryAssurance() {
        var ticket = enrolled();
        var first = mfa.finish(ticket.value(), null, null, null, true).session();
        String currentSid = tokens.getSessionId(first.accessToken());
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(browser("192.0.2.7")));
        var manage = mfa.beginManage(current(), currentSid, null, "synthetic-password");
        var result = mfa.regenerateRecovery(manage.value(), current(), currentSid);
        assertThat(result.codes()).hasSize(10);
        assertThat(tokens.verifyAuthentication(result.session().accessToken()).loginMethod()).isEqualTo("PASSWORD");
        assertThatThrownBy(() -> tokens.verifyAuthentication(first.accessToken())).isInstanceOf(RuntimeException.class);
    }
    @Test void anUnknownBrowserMustConfirmEmailBeforeEnrollingAndCanThenFinishTheSameRequest() {
        when(store.browser(anyString(), anyString(), anyString(), anyString(), anyString())).thenReturn(0L);
        var ticket = mfa.beginManage(current(), sid, null, "synthetic-password");
        assertThat(mfa.status(ticket.value(), current(), sid).emailAvailable()).isTrue();
        assertThatThrownBy(() -> mfa.beginTotp(ticket.value(), current(), sid)).isInstanceOf(AuthException.class);
        when(store.verifyCode(anyString(), anyString(), anyString())).thenReturn(true);
        mfa.verify(ticket.value(), current(), sid, "EMAIL", "123456");
        var setup = mfa.beginTotp(ticket.value(), current(), sid);
        String code = org.springframework.test.util.ReflectionTestUtils.invokeMethod(MfaCrypto.class, "code", setup.secret(), Instant.now().getEpochSecond() / 30, 6);
        mfa.confirmTotp(ticket.value(), current(), sid, code);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(browser("192.0.2.7")));
        var completed = mfa.finish(ticket.value(), null, null).session();
        assertThat(tokens.verifyAuthentication(completed.accessToken()).loginMethod()).isEqualTo("PASSWORD");
    }
}
