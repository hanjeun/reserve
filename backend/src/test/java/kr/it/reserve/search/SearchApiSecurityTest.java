package kr.it.reserve.search;

import kr.it.reserve.global.admission.ServiceAdmissionRoutes;
import kr.it.reserve.global.admission.ServiceAdmissionService;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.waiting.service.CustomerWaitingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc
class SearchApiSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean SearchQueries sources;
    @MockitoBean RateLimiter limiter;
    @MockitoBean CustomerWaitingService waiting;
    @BeforeEach void limit() { when(limiter.tryConsume(anyString(), any())).thenReturn(true); }
    @ParameterizedTest @ValueSource(strings = {"/api", "/api/v1"})
    void onlyTheExactPublicGetIsAnonymousAndPersonalReadsRequireAuthentication(String prefix) throws Exception {
        mvc.perform(get(prefix + "/search").param("keyword", "공개")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.data.groups[0].key").value("stores"));
        mvc.perform(get(prefix + "/search/me").param("keyword", "개인")).andExpect(status().isUnauthorized());
        mvc.perform(get(prefix + "/waiting/my/99")).andExpect(status().isUnauthorized());
        mvc.perform(post(prefix + "/search")).andExpect(status().isUnauthorized());
        mvc.perform(get(prefix + "/search/anything")).andExpect(status().isUnauthorized());
    }
    @ParameterizedTest @ValueSource(strings = {"/api", "/api/v1"})
    void personalSearchUsesThePrincipalAndIgnoresForeignMemberParameters(String prefix) throws Exception {
        var member = Member.builder().id(7L).role(Role.USER).build();
        var auth = new UsernamePasswordAuthenticationToken(member, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        mvc.perform(get(prefix + "/search/me").with(authentication(auth)).param("keyword", "예약").param("memberId", "99"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.data.groups[0].key").value("reservations"));
        verify(sources).reservations(any(), eq(7L)); verify(sources, never()).reservations(any(), eq(99L));
        mvc.perform(get(prefix + "/waiting/my/56").with(authentication(auth)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
        verify(waiting).personalEntry(member, 56L);
        verify(waiting, never()).join(any(), anyLong(), any()); verify(waiting, never()).entryQr(any(), anyLong());
    }
    @Test void invalidInputNeverReachesADatabaseSource() throws Exception {
        mvc.perform(get("/api/search").param("keyword", "x".repeat(101))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/search").param("keyword", "x").param("limit", "6")).andExpect(status().isBadRequest());
        verifyNoInteractions(sources);
    }
    @Test void emergencyPreservesOnlyPersonalSearchAndTheExistingWaitingRead() {
        assertThat(ServiceAdmissionRoutes.protectedBy(ServiceAdmissionService.Mode.EMERGENCY, "GET", "/api/search")).isTrue();
        assertThat(ServiceAdmissionRoutes.protectedBy(ServiceAdmissionService.Mode.EMERGENCY, "GET", "/api/search/me")).isFalse();
        assertThat(ServiceAdmissionRoutes.protectedBy(ServiceAdmissionService.Mode.EMERGENCY, "GET", "/api/waiting/my/56")).isFalse();
        assertThat(ServiceAdmissionRoutes.protectedBy(ServiceAdmissionService.Mode.EMERGENCY, "POST", "/api/search/me")).isTrue();
    }
}
