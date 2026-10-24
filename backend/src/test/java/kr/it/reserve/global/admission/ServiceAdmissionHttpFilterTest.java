package kr.it.reserve.global.admission;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.ServiceAdmissionHttpFilter;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockCookie;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SuppressWarnings("unchecked")
class ServiceAdmissionHttpFilterTest {
    private static final String TICKET = "11111111-1111-4111-8111-111111111111";
    private static final String OTHER = "22222222-2222-4222-8222-222222222222";
    private final ServiceAdmissionService service = mock(ServiceAdmissionService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final ObjectProvider<ServiceAdmissionService> services = mock(ObjectProvider.class);
    private final ObjectProvider<RateLimiter> limiters = mock(ObjectProvider.class);
    private final FilterChain chain = mock(FilterChain.class);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private ServiceAdmissionHttpFilter filter;

    @BeforeEach
    void prepare() {
        when(services.getIfAvailable()).thenReturn(service);
        when(limiters.getIfAvailable()).thenReturn(limiter);
        when(service.currentMode()).thenReturn(ServiceAdmissionService.Mode.CORE);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        filter = new ServiceAdmissionHttpFilter(services, limiters, mapper, true, "prod");
    }

    @Test
    void disabledFilterUsesNeitherTheEngineNorTheLimiter() throws Exception {
        filter = new ServiceAdmissionHttpFilter(services, limiters, mapper, false, "prod");
        invoke(request("POST", "/api/reservations"));
        verify(chain).doFilter(any(), any());
        var response = invoke(request("GET", "/api/service-admission"));
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(mapper.readTree(response.getContentAsString()).at("/data/state").asText()).isEqualTo("BYPASS");
        verifyNoInteractions(service, limiter);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/reservations", "/api/stores", "/api/waiting/stores/1/entries",
            "/api/v1/reservations", "/api/v1/stores", "/api/v1/waiting/stores/1/entries"})
    void coreGatesOnlyTheThreeCreationRoutesIncludingAliases(String path) throws Exception {
        var response = invoke(request("POST", path));
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isEqualTo("4");
        assertThat(mapper.readTree(response.getContentAsString()).at("/data/code").asText()).isEqualTo("SERVICE_ADMISSION_REQUIRED");
        verify(service).admitted(null);
        verifyNoInteractions(chain);
    }

    @Test
    void coreReadsRemainFreeAndAdmittedRequestsKeepDownstreamFailureHandling() throws Exception {
        invoke(request("GET", "/api/stores"));
        verify(service, never()).admitted(any());
        when(service.admitted(TICKET)).thenReturn(true);
        var request = request("POST", "/api/reservations");
        request.setCookies(new Cookie("__Host-reserve-entry", TICKET));
        var downstream = new IllegalStateException("Synthetic downstream failure");
        doThrow(downstream).when(chain).doFilter(eq(request), any());
        assertThatThrownBy(() -> invoke(request)).isSameAs(downstream);
    }

    @ParameterizedTest
    @CsvSource({"POST,/api/payment/prepare", "POST,/api/payment/verify", "POST,/api/payment/refund",
            "POST,/api/auth/refresh", "POST,/api/auth/logout", "PATCH,/api/reservations/1/cancel",
            "POST,/api/waiting/entries/1/cancel", "POST,/api/v1/payment/webhook/portone"})
    void emergencyPreservesAuthenticationAndExistingTransactionRecovery(String method, String path) throws Exception {
        when(service.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        invoke(request(method, path));
        verifyNoInteractions(service, limiter);
        verify(chain).doFilter(any(), any());
    }

    @Test
    void emergencyGatesPublicReadsAndRedisFailureNeverOpensTheGate() throws Exception {
        when(service.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        assertThat(invoke(request("GET", "/api/stores")).getStatus()).isEqualTo(429);
        when(service.currentMode()).thenThrow(new ServiceAdmissionService.UnavailableException());
        var unavailable = invoke(request("GET", "/api/stores"));
        assertThat(unavailable.getStatus()).isEqualTo(503);
        assertThat(unavailable.getHeader("Retry-After")).isEqualTo("4");
        verifyNoInteractions(chain);
    }

    @Test
    void anonymousJoinKeepsTheTicketOnlyInTheHostCookieAndUsesAStableNonSecretContinuityId() throws Exception {
        when(service.join(null)).thenReturn(entry("WAITING", TICKET, 0));
        var response = invoke(request("POST", "/api/v1/service-admission"));
        var cookie = MockCookie.parse(response.getHeader("Set-Cookie"));
        assertThat(cookie.getName()).isEqualTo("__Host-reserve-entry");
        assertThat(cookie.getValue()).isEqualTo(TICKET);
        assertThat(cookie.getPath()).isEqualTo("/");
        assertThat(cookie.getDomain()).isNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getSecure()).isTrue();
        assertThat(cookie.getSameSite()).isEqualTo("Lax");
        assertThat(cookie.getMaxAge()).isEqualTo(7 * 86400);
        var json = mapper.readTree(response.getContentAsString());
        assertThat(json.at("/data/continuityId").asText()).isEqualTo(digest(TICKET));
        assertThat(json.at("/data/ticket").isMissingNode()).isTrue();
        assertThat(response.getContentAsString()).doesNotContain(TICKET);
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        verify(service).join(null);
        verifyNoInteractions(chain);
    }

    @Test
    void admittedCookieLifetimeIsBoundedByTheHardDeadlineAndLocalUsesItsOwnCookie() throws Exception {
        when(service.join(null)).thenReturn(entry("ADMITTED", TICKET, 7200000));
        var response = invoke(request("POST", "/api/service-admission"));
        assertThat(MockCookie.parse(response.getHeader("Set-Cookie")).getMaxAge()).isEqualTo(7200);
        filter = new ServiceAdmissionHttpFilter(services, limiters, mapper, true, "local");
        var local = invoke(request("POST", "/api/service-admission"));
        var cookie = MockCookie.parse(local.getHeader("Set-Cookie"));
        assertThat(cookie.getName()).isEqualTo("reserve_entry");
        assertThat(cookie.getSecure()).isFalse();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getDomain()).isNull();
    }

    @Test
    void distinctDuplicateCookiesAreRejectedAndIdenticalValuesRemainUnambiguous() throws Exception {
        var request = request("GET", "/api/service-admission");
        request.setCookies(new Cookie("__Host-reserve-entry", TICKET), new Cookie("__Host-reserve-entry", OTHER));
        var rejected = invoke(request);
        assertThat(rejected.getStatus()).isEqualTo(400);
        assertThat(rejected.getContentAsString()).doesNotContain(TICKET, OTHER);
        verifyNoInteractions(service, limiter);
        request = request("GET", "/api/service-admission");
        request.setCookies(new Cookie("__Host-reserve-entry", TICKET), new Cookie("__Host-reserve-entry", TICKET));
        when(service.status(TICKET)).thenReturn(entry("WAITING", TICKET, 0));
        assertThat(invoke(request).getStatus()).isEqualTo(200);
        verify(service).status(TICKET);
        verify(limiter).tryConsume("service-entry:read:" + digest(TICKET), RateLimiter.Policy.SERVICE_ENTRY_READ);
    }

    @Test
    void rateLimitingDoesNotInvokeTheQueueOrExposeTheCookie() throws Exception {
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.SERVICE_ENTRY_JOIN))).thenReturn(false);
        var response = invoke(request("POST", "/api/service-admission"));
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(mapper.readTree(response.getContentAsString()).at("/data/code").asText()).isEqualTo("SERVICE_ADMISSION_RATE_LIMITED");
        assertThat(response.getHeader("Set-Cookie")).isNull();
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "DELETE"})
    void anonymousReadAndCancelHaveAnIpQuotaBeforeTheEngine(String method) throws Exception {
        var notJoined = new ServiceAdmissionService.Entry(null, "NOT_JOINED", 0, 0, 0, 1800000000000L,
                4, 90, ServiceAdmissionService.Mode.CORE);
        when(service.status(null)).thenReturn(notJoined);
        when(service.cancel(null)).thenReturn(notJoined);
        var request = request(method, "/api/service-admission");
        request.setRemoteAddr("192.0.2.7");
        assertThat(invoke(request).getStatus()).isEqualTo(200);
        verify(limiter).tryConsume("service-entry:ip-read:192.0.2.7", RateLimiter.Policy.SERVICE_ENTRY_IP_READ);
        clearInvocations(service, limiter);
        when(limiter.tryConsume("service-entry:ip-read:192.0.2.7", RateLimiter.Policy.SERVICE_ENTRY_IP_READ)).thenReturn(false);
        var limited = invoke(request);
        assertThat(limited.getStatus()).isEqualTo(429);
        assertThat(mapper.readTree(limited.getContentAsString()).at("/data/code").asText()).isEqualTo("SERVICE_ADMISSION_RATE_LIMITED");
        verifyNoInteractions(service);
    }

    @Test
    void rotatingUnverifiedUuidCookiesShareTheIpQuotaAndNeverAllocateHashBuckets() throws Exception {
        String third = "33333333-3333-4333-8333-333333333333";
        when(service.status(anyString())).thenReturn(entry("EXPIRED", null, 0));
        when(limiter.tryConsume("service-entry:ip-read:127.0.0.1", RateLimiter.Policy.SERVICE_ENTRY_IP_READ))
                .thenReturn(true, true, false);
        for (String value : new String[]{TICKET, OTHER}) {
            var request = request("GET", "/api/service-admission");
            request.setCookies(new Cookie("__Host-reserve-entry", value));
            assertThat(invoke(request).getStatus()).isEqualTo(200);
        }
        var denied = request("GET", "/api/service-admission");
        denied.setCookies(new Cookie("__Host-reserve-entry", third));
        assertThat(invoke(denied).getStatus()).isEqualTo(429);
        verify(limiter, times(3)).tryConsume("service-entry:ip-read:127.0.0.1", RateLimiter.Policy.SERVICE_ENTRY_IP_READ);
        verify(limiter, never()).tryConsume(anyString(), eq(RateLimiter.Policy.SERVICE_ENTRY_READ));
        verify(service).status(TICKET);
        verify(service).status(OTHER);
        verify(service, never()).status(third);
        verifyNoMoreInteractions(limiter);
    }

    @Test
    void liveGetUsesTheIpQuotaBeforeRedisAndTheVerifiedTicketQuotaAfterRedis() throws Exception {
        when(service.status(TICKET)).thenReturn(entry("WAITING", TICKET, 0));
        var request = request("GET", "/api/service-admission");
        request.setCookies(new Cookie("__Host-reserve-entry", TICKET));
        assertThat(invoke(request).getStatus()).isEqualTo(200);
        var order = inOrder(limiter, service);
        order.verify(limiter).tryConsume("service-entry:ip-read:127.0.0.1", RateLimiter.Policy.SERVICE_ENTRY_IP_READ);
        order.verify(service).status(TICKET);
        order.verify(limiter).tryConsume("service-entry:read:" + digest(TICKET), RateLimiter.Policy.SERVICE_ENTRY_READ);

        clearInvocations(service, limiter);
        when(limiter.tryConsume("service-entry:read:" + digest(TICKET), RateLimiter.Policy.SERVICE_ENTRY_READ)).thenReturn(false);
        var limited = invoke(request);
        assertThat(limited.getStatus()).isEqualTo(429);
        assertThat(limited.getHeader("Set-Cookie")).isNull();
        verify(service).status(TICKET);
    }

    @Test
    void cancellationUsesOnlyTheIpQuotaEvenWhenTheTicketReadQuotaIsExhausted() throws Exception {
        when(service.cancel(TICKET)).thenReturn(entry("CANCELLED", null, 0));
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.SERVICE_ENTRY_READ))).thenReturn(false);
        var request = request("DELETE", "/api/service-admission");
        request.setCookies(new Cookie("__Host-reserve-entry", TICKET));
        var response = invoke(request);
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(MockCookie.parse(response.getHeader("Set-Cookie")).getMaxAge()).isZero();
        var order = inOrder(limiter, service);
        order.verify(limiter).tryConsume("service-entry:ip-read:127.0.0.1", RateLimiter.Policy.SERVICE_ENTRY_IP_READ);
        order.verify(service).cancel(TICKET);
        verify(limiter, never()).tryConsume(anyString(), eq(RateLimiter.Policy.SERVICE_ENTRY_READ));
        verifyNoMoreInteractions(limiter);
    }

    @Test
    void unavailableDependenciesAndUnsupportedMethodsFailWithoutContinuingTheChain() throws Exception {
        when(services.getIfAvailable()).thenReturn(null);
        assertThat(invoke(request("POST", "/api/reservations")).getStatus()).isEqualTo(503);
        var unsupported = invoke(request("PUT", "/api/service-admission"));
        assertThat(unsupported.getStatus()).isEqualTo(405);
        assertThat(unsupported.getHeader("Allow")).isEqualTo("GET, POST, DELETE, OPTIONS");
        verifyNoInteractions(chain);
    }

    @Test
    void encodedFallbackPathsUseTheContextAndDecodeOnlyOnce() throws Exception {
        var request = request("POST", "/preview/api/v1/%72eservations");
        request.setContextPath("/preview");
        assertThat(invoke(request).getStatus()).isEqualTo(429);
        request = request("POST", "/preview/api/%2572eservations");
        request.setContextPath("/preview");
        request.setServletPath("/api/%72eservations");
        assertThat(ServiceAdmissionRoutes.path(request)).isEqualTo("/api/%72eservations");
        var malformed = invoke(request("POST", "/api/%GGreser"));
        assertThat(malformed.getStatus()).isEqualTo(400);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SERVICE_EMERGENCY_IP", "SERVICE_EMERGENCY_GLOBAL"})
    void emergencyRateLimitsRunBeforeTicketAndDownstreamWork(String deniedPolicy) throws Exception {
        when(service.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.valueOf(deniedPolicy)))).thenReturn(false);
        var response = invoke(request("GET", "/api/v1/stores"));
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isEqualTo("10");
        assertThat(response.getContentAsString()).contains("10초 후");
        assertThat(mapper.readTree(response.getContentAsString()).at("/data/code").asText()).isEqualTo("SERVICE_ADMISSION_THROTTLED");
        verify(service, never()).admitted(any());
        verify(service).noteEmergencyThrottle();
        verifyNoInteractions(chain);
    }

    @Test
    void emergencyDoesNotQueueServletThreadsAndAlwaysReleasesTheEightPermits() throws Exception {
        when(service.currentMode()).thenReturn(ServiceAdmissionService.Mode.EMERGENCY);
        when(service.admitted(null)).thenReturn(true);
        var depth = new java.util.concurrent.atomic.AtomicInteger();
        doAnswer(invocation -> {
            int active = depth.incrementAndGet();
            try {
                if (active < 8) assertThat(invoke(request("GET", "/api/stores")).getStatus()).isEqualTo(200);
                else {
                    var blocked = invoke(request("GET", "/api/stores"));
                    assertThat(blocked.getStatus()).isEqualTo(429);
                    assertThat(blocked.getHeader("Retry-After")).isEqualTo("10");
                    var recovery = mock(FilterChain.class);
                    filter.doFilter(request("POST", "/api/payment/verify"), new MockHttpServletResponse(), recovery);
                    verify(recovery).doFilter(any(), any());
                }
            } finally { depth.decrementAndGet(); }
            return null;
        }).when(chain).doFilter(any(), any());
        assertThat(invoke(request("GET", "/api/stores")).getStatus()).isEqualTo(200);
        verify(chain, times(8)).doFilter(any(), any());
        doNothing().when(chain).doFilter(any(), any());
        assertThat(invoke(request("GET", "/api/stores")).getStatus()).isEqualTo(200);
        var original = new IllegalStateException("Synthetic downstream security failure");
        doThrow(original).when(chain).doFilter(any(), any());
        assertThatThrownBy(() -> invoke(request("GET", "/api/stores"))).isSameAs(original);
        doNothing().when(chain).doFilter(any(), any());
        assertThat(invoke(request("GET", "/api/stores")).getStatus()).isEqualTo(200);
    }

    private MockHttpServletResponse invoke(MockHttpServletRequest request) throws Exception {
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response;
    }
    private static MockHttpServletRequest request(String method, String path) {
        var request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr("127.0.0.1");
        return request;
    }
    private static ServiceAdmissionService.Entry entry(String state, String ticket, long hardLifetime) {
        long now = 1800000000000L;
        return new ServiceAdmissionService.Entry(ticket, state, 1, now + 90000, hardLifetime > 0 ? now + hardLifetime : 0,
                now, 4, 90, ServiceAdmissionService.Mode.CORE);
    }
    private static String digest(String ticket) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(ticket.getBytes(StandardCharsets.US_ASCII)));
    }
}
