package kr.it.reserve.global.admission;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.SecurityConfig;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.CustomOAuth2UserService;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationSuccessHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.service.LoginMethodService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.net.URI;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

/** Real SecurityConfig and MVC routing; all account, queue, provider and rate-limit dependencies are in-memory mocks. */
@SpringJUnitWebConfig(classes = {SecurityConfig.class, ServiceAdmissionSecurityTest.Fixture.class})
@TestPropertySource(properties = {"reserve.service-admission.enabled=true", "server.env=prod",
        "cors.allowed-origins=https://reserve.it.kr"})
class ServiceAdmissionSecurityTest {
    private static final String ORIGIN = "https://reserve.it.kr";
    private static final String TICKET = "11111111-1111-4111-8111-111111111111";
    private static final String ACCESS = "synthetic-access";
    @Autowired private WebApplicationContext context;
    @MockitoBean private TokenProvider tokens;
    @MockitoBean private ServiceAdmissionService admission;
    @MockitoBean private RateLimiter limiter;
    @MockitoBean private CustomOAuth2UserService users;
    @MockitoBean private OAuth2AuthenticationSuccessHandler success;
    @MockitoBean private OAuth2AuthenticationFailureHandler failure;
    @MockitoBean private LoginMethodService loginMethods;
    @MockitoBean private ClientRegistrationRepository registrations;
    private MockMvc mvc;

    @BeforeEach
    void prepare() {
        reset(tokens, admission, limiter);
        when(admission.currentMode()).thenReturn(ServiceAdmissionService.Mode.CORE);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        when(tokens.verifyAuthentication(ACCESS)).thenReturn(new TokenProvider.VerifiedAuthentication(
                Member.builder().id(1L).role(Role.USER).build(), null, "PASSWORD", "verified-device"));
        mvc = webAppContextSetup(context).apply(springSecurity()).build();
    }

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void queuedResponseIsInsideCorsAndStopsBeforeJwtMemberLookup() throws Exception {
        mvc.perform(post("/api/reservations").header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Expose-Headers", "Retry-After"))
                .andExpect(jsonPath("$.data.code").value("SERVICE_ADMISSION_REQUIRED"));
        verifyNoInteractions(tokens);
    }

    @Test
    void emergencyThrottleExposesItsCooldownBeforeAuthentication() throws Exception {
        when(admission.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.SERVICE_EMERGENCY_IP))).thenReturn(false);
        mvc.perform(get("/api/stores").header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "10"))
                .andExpect(header().string("Access-Control-Expose-Headers", "Retry-After"))
                .andExpect(jsonPath("$.data.code").value("SERVICE_ADMISSION_THROTTLED"));
        verifyNoInteractions(tokens);
        verify(admission, never()).admitted(any());
    }

    @Test
    void foreignCorsAndUnsafeCookieRequestsStopBeforeTheQueueAndJwt() throws Exception {
        mvc.perform(post("/api/reservations").header("Origin", "https://foreign.example.test").cookie(access()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/reservations").cookie(entry(), access()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/service-admission").cookie(entry()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(admission, tokens, limiter);
    }

    @Test
    void preflightStopsBeforeQueueAndAuthentication() throws Exception {
        mvc.perform(options("/api/v1/reservations").header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verifyNoInteractions(admission, tokens, limiter);
    }

    @Test
    void admittedCapacityDoesNotReplaceAuthenticationOrTheCurrentRole() throws Exception {
        when(admission.admitted(TICKET)).thenReturn(true);
        mvc.perform(post("/api/reservations").header("Origin", ORIGIN).cookie(entry()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/reservations").header("Origin", ORIGIN).cookie(entry(), access()))
                .andExpect(status().isOk()).andExpect(content().string("ok"));
        mvc.perform(get("/api/admin/entry-probe").cookie(entry(), access()))
                .andExpect(status().isForbidden());
        verify(tokens, times(2)).verifyAuthentication(ACCESS);
    }

    @Test
    void corePublicReadsAreFreeAndVersionOneCreationStillQueues() throws Exception {
        mvc.perform(get("/api/stores")).andExpect(status().isOk());
        verify(admission, never()).admitted(any());
        mvc.perform(post("/api/v1/reservations").header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(tokens);
    }

    @Test
    void emergencyPreservesPaymentAuthenticationAndTransactionCancellationSecurity() throws Exception {
        when(admission.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        mvc.perform(get("/api/stores")).andExpect(status().isTooManyRequests());
        clearInvocations(admission);
        mvc.perform(post("/api/payment/prepare").header("Origin", ORIGIN)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/reservations/1/cancel").header("Origin", ORIGIN)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/waiting/entries/1/cancel").header("Origin", ORIGIN)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").header("Origin", ORIGIN)).andExpect(status().isOk());
        mvc.perform(post("/api/payment/webhook/portone")).andExpect(status().isOk());
        verifyNoInteractions(admission, tokens);
    }

    @Test
    void publicEntryStatusDoesNotRunJwtOrReturnItsRawTicket() throws Exception {
        when(admission.status(TICKET)).thenReturn(new ServiceAdmissionService.Entry(TICKET, "WAITING", 1,
                1800000090000L, 0, 1800000000000L, 4, 90, ServiceAdmissionService.Mode.CORE));
        mvc.perform(get("/api/v1/service-admission").cookie(entry(), access()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.state").value("WAITING"))
                .andExpect(jsonPath("$.data.ticket").doesNotExist())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(TICKET))));
        verifyNoInteractions(tokens);
    }

    @Test
    void anUnavailableModeCannotReachJwtAndUnsupportedVersionsStay404() throws Exception {
        when(admission.currentMode()).thenThrow(new ServiceAdmissionService.UnavailableException());
        mvc.perform(post("/api/reservations").header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isServiceUnavailable());
        clearInvocations(admission);
        mvc.perform(get("/api/v2/service-admission").cookie(access())).andExpect(status().isNotFound());
        verifyNoInteractions(admission, tokens);
    }

    @Test
    void committedResultRecoveryBypassesCapacityButRetainsMemberAuthentication() throws Exception {
        when(admission.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        mvc.perform(post("/api/reservations/requests/result").header("Origin", ORIGIN))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/reservations/requests/result").header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isOk());
        verifyNoInteractions(admission);
        verify(tokens).verifyAuthentication(ACCESS);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/%72eservations", "/api/%73tores", "/api/waiting/stores/%31/entries", "/api/v1/%72eservations"})
    void mvcDecodedCreationPathsCannotBypassTheCapacityGate(String encoded) throws Exception {
        when(admission.currentMode()).thenReturn(ServiceAdmissionService.Mode.OFF);
        mvc.perform(post(URI.create(encoded)).header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isOk()).andExpect(content().string("ok"));
        clearInvocations(admission, tokens);
        when(admission.currentMode()).thenReturn(ServiceAdmissionService.Mode.CORE);
        mvc.perform(post(URI.create(encoded)).header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(tokens);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/%2freservations", "/api/%2572eservations", "/api/%2e%2e/reservations"})
    void encodedSlashPercentAndTraversalKeepTheExistingFirewallRejection(String encoded) throws Exception {
        mvc.perform(post(URI.create(encoded)).header("Origin", ORIGIN).cookie(access()))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(admission, tokens);
    }

    private static Cookie entry() { return new Cookie("__Host-reserve-entry", TICKET); }
    private static Cookie access() { return new Cookie("access_token", ACCESS); }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    static class Fixture {
        @Bean ObjectMapper mapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean ProbeController probes() { return new ProbeController(); }
    }

    @RestController
    static class ProbeController {
        @RequestMapping({"/api/stores", "/api/reservations", "/api/waiting/stores/{id}/entries", "/api/v1/stores",
                "/api/v1/reservations", "/api/v1/waiting/stores/{id}/entries", "/api/admin/entry-probe",
                "/api/payment/prepare", "/api/payment/webhook/portone", "/api/reservations/1/cancel",
                "/api/waiting/entries/1/cancel", "/api/auth/refresh", "/api/reservations/requests/result"})
        public String ok() { return "ok"; }
    }
}
