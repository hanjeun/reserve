package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.payment.controller.PortoneWebhookController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.List;
import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 MVC 매핑과 보안 체인에서 구 API와 v1의 계약을 대조한다. 외부 PG는 호출하지 않는다. */
@SpringBootTest
@AutoConfigureMockMvc
class ApiVersionContractTest {
    private static final List<String> PREFIXES = List.of("/api", "/api/v1");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    void everyLegacyControllerMappingHasAV1AliasOnTheSameHandlerAndConditions() {
        int legacyMappings = 0;
        for (var mapping : handlerMapping.getHandlerMethods().keySet()) {
            for (String path : mapping.getPatternValues()) {
                if (path.startsWith("/api/") && !path.startsWith("/api/v1/")) {
                    assertThat(mapping.getPatternValues()).as(path).contains("/api/v1" + path.substring(4));
                    legacyMappings++;
                }
            }
        }
        assertThat(legacyMappings).isPositive();
    }

    @Test
    void publicJsonAliasKeepsTheQueryContractAndOriginalRequestUri() throws Exception {
        var legacy = mockMvc.perform(get("/api/stores/regions"))
                .andExpect(status().isOk()).andReturn();
        var versioned = mockMvc.perform(get("/api/v1/stores/regions"))
                .andExpect(status().isOk()).andReturn();
        assertThat(objectMapper.readTree(versioned.getResponse().getContentAsString()).get("data"))
                .isEqualTo(objectMapper.readTree(legacy.getResponse().getContentAsString()).get("data"));
        assertThat(versioned.getHandler()).isEqualTo(legacy.getHandler());
        assertThat(versioned.getRequest().getRequestURI()).isEqualTo("/api/v1/stores/regions");
        mockMvc.perform(get("/api/v1/advertisements/active").param("type", "invalid"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/hc")).andExpect(status().isOk());
    }

    @Test
    void personalRoutesAndNonPublicMethodsStayAuthenticated() throws Exception {
        for (String prefix : PREFIXES) {
            for (String path : List.of("/member/me", "/stores/my", "/stores/1/edit", "/chat/images/1")) {
                mockMvc.perform(get(prefix + path)).andExpect(status().isUnauthorized());
            }
            for (String path : List.of("/auth/agree-terms", "/payment/refund", "/stores")) {
                mockMvc.perform(post(prefix + path).contentType("application/json").content("{}"))
                        .andExpect(status().isUnauthorized());
            }
        }
    }

    @Test
    @WithMockUser(roles = {"USER", "BUSINESS"})
    void ordinaryRolesCannotUseEitherAdministratorNamespace() throws Exception {
        for (String prefix : PREFIXES) {
            mockMvc.perform(get(prefix + "/admin/payment-operations/deposit-invariants"))
                    .andExpect(status().isForbidden());
            mockMvc.perform(get(prefix + "/business-verification/admin/pending"))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void administratorAliasReachesTheSameReadOnlyHandler() throws Exception {
        for (String prefix : PREFIXES) {
            mockMvc.perform(get(prefix + "/admin/payment-operations/deposit-invariants")
                            .param("page", "-1").param("size", "1000"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.content").isArray());
        }
    }

    @Test
    void versionedBrowserWritesStillRequireTrustedOriginAndAuthentication() throws Exception {
        for (String prefix : PREFIXES) {
            mockMvc.perform(post(prefix + "/chat/support/open")
                            .header("Referer", "https://attacker.example/page")
                            .cookie(new Cookie("access_token", "invalid-test-token")))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post(prefix + "/chat/support/open")
                            .header("Origin", "https://reserve.it.kr")
                            .cookie(new Cookie("access_token", "invalid-test-token")))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void collectorAliasesKeepTheirExactCsrfExceptionsAndWebhookSignatureGate() throws Exception {
        for (String prefix : PREFIXES) {
            String csp = prefix + "/csp-reports";
            mockMvc.perform(post(csp).servletPath(csp)
                            .header("Referer", "https://attacker.example/page")
                            .cookie(new Cookie("access_token", "invalid-test-token"))
                            .contentType("application/json").content("{}"))
                    .andExpect(status().isNoContent());
            String webhook = prefix + "/payment/webhook/portone";
            var result = mockMvc.perform(post(webhook).servletPath(webhook)
                            .header("Referer", "https://attacker.example/page")
                            .cookie(new Cookie("access_token", "invalid-test-token"))
                            .contentType("application/json").content("{}"))
                    .andExpect(status().isUnauthorized()).andExpect(content().string("")).andReturn();
            assertThat(result.getHandler()).isInstanceOf(HandlerMethod.class);
            assertThat(((HandlerMethod) result.getHandler()).getBeanType()).isEqualTo(PortoneWebhookController.class);
        }
    }

    @Test
    void unsupportedNumericVersionsReturn404BeforeAuthenticationOrCsrf() throws Exception {
        for (String version : List.of("v0", "v2", "v01", "v999")) {
            mockMvc.perform(get("/api/" + version + "/stores"))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.success").value(false));
            mockMvc.perform(post("/api/" + version + "/auth/login")
                            .header("Referer", "https://attacker.example/page")
                            .cookie(new Cookie("access_token", "invalid-test-token")))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.success").value(false));
        }
        mockMvc.perform(get(URI.create("/api/%76%32/stores"))).andExpect(status().isNotFound());
        mockMvc.perform(get("/reserve/api/v2/stores").contextPath("/reserve").servletPath("/api/v2/stores"))
                .andExpect(status().isNotFound());
    }

    @Test
    void switchingBetweenLegacyAndV1DoesNotRefreshTheLoginAccountQuota() throws Exception {
        int capacity = RateLimiter.Policy.LOGIN_ACCOUNT.capacity();
        String credentials = "{\"email\":\"api-version-quota@example.test\",\"password\":\"wrong-password\"}";
        for (int attempt = 0; attempt < capacity; attempt++) {
            String prefix = PREFIXES.get(attempt % PREFIXES.size());
            mockMvc.perform(post(prefix + "/auth/login").contentType("application/json").content(credentials))
                    .andExpect(status().isUnauthorized());
        }
        for (String prefix : PREFIXES) {
            mockMvc.perform(post(prefix + "/auth/login").contentType("application/json").content(credentials))
                    .andExpect(status().isTooManyRequests());
        }
    }
}
