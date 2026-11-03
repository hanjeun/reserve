package kr.it.reserve.member;

import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.controller.MemberApiController;
import kr.it.reserve.member.dto.LocationUpdateRequest;
import kr.it.reserve.member.dto.MemberUpdateRequest;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.service.MemberService;
import kr.it.reserve.member.service.MemberWithdrawalService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MemberProfileUpdateBoundaryTest {
    private final MemberService service = mock(MemberService.class);
    private final RateLimiter limiter = new RateLimiter();
    private MockMvc mvc;

    @BeforeEach void prepare() {
        authenticate(7L);
        mvc = mvc(limiter);
    }

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    private MockMvc mvc(RateLimiter limits) {
        return MockMvcBuilders.standaloneSetup(new MemberApiController(service, mock(CookieUtil.class),
                        mock(MemberWithdrawalService.class), limits))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private void authenticate(long id) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                Member.builder().id(id).name("시험 회원").build(), null, List.of()));
    }

    private RequestBuilder mutation(int route, String ip) {
        AbstractMockHttpServletRequestBuilder<?> request = switch (route) {
            case 0 -> put("/api/member/update").contentType(MediaType.APPLICATION_JSON).content("{\"emailNotificationEnabled\":false}");
            case 1 -> multipart("/api/member/profile-image").file(new MockMultipartFile("image", "test.png", "image/png", new byte[]{1}));
            case 2 -> delete("/api/member/profile-image");
            case 3 -> patch("/api/member/me/location").contentType(MediaType.APPLICATION_JSON).content("{\"latitude\":0,\"longitude\":0}");
            case 4 -> patch("/api/member/me/marketing-consent").contentType(MediaType.APPLICATION_JSON).content("{\"marketingAgreed\":false}");
            default -> throw new IllegalArgumentException("Unknown synthetic route");
        };
        return request.with(value -> { value.setRemoteAddr(ip); return value; });
    }

    @Test void allMutationRoutesShareTheMemberQuotaAcrossIpChanges() throws Exception {
        for (int i = 0; i < RateLimiter.Policy.MEMBER_UPDATE.capacity(); i++) {
            mvc.perform(mutation(i % 5, "203.0.113." + (i + 1))).andExpect(status().isOk());
        }
        for (int route = 0; route < 5; route++) {
            mvc.perform(mutation(route, "198.51.100.1")).andExpect(status().isTooManyRequests());
        }
        verify(service, times(4)).updateMember(eq(7L), any());
        verify(service, times(4)).updateProfileImage(eq(7L), any());
        verify(service, times(4)).deleteProfileImage(7L);
        verify(service, times(4)).updateLocation(eq(7L), any());
        verify(service, times(4)).updateMarketingConsent(7L, false);
        authenticate(8L);
        mvc.perform(mutation(2, "198.51.100.1")).andExpect(status().isOk());
    }

    @Test void changingMembersCannotBypassTheSharedIpQuotaAndOtherIpsRemainUsable() throws Exception {
        for (int i = 0; i < RateLimiter.Policy.MEMBER_UPDATE_IP.capacity(); i++) {
            authenticate(i + 1L);
            mvc.perform(mutation(i % 5, "203.0.113.1")).andExpect(status().isOk());
        }
        authenticate(99L);
        mvc.perform(mutation(2, "203.0.113.1")).andExpect(status().isTooManyRequests());
        mvc.perform(mutation(2, "198.51.100.1")).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4})
    void ipRejectionPrecedesMemberConsumptionAndEveryWrite(int route) throws Exception {
        RateLimiter limits = mock(RateLimiter.class);
        mvc(limits).perform(mutation(route, "203.0.113.1")).andExpect(status().isTooManyRequests());
        verify(limits).tryConsume("member-update:ip:203.0.113.1", RateLimiter.Policy.MEMBER_UPDATE_IP);
        verify(limits, never()).tryConsume(anyString(), eq(RateLimiter.Policy.MEMBER_UPDATE));
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "a", "  ", "　　", "line\nbreak", "abcdefghijklmnopqrstu"})
    void invalidNamesStopBeforeMutation(String name) throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of("name", name));
        mvc.perform(put("/api/member/update").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"새 이름", "ab", "abcdefghijklmnopqrst"})
    void validNamesReachTheMutationService(String name) throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of("name", name));
        mvc.perform(put("/api/member/update").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk());
        verify(service).updateMember(eq(7L), argThat(value -> name.equals(value.getName())));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "{\"latitude\":0}", "{\"longitude\":0}",
            "{\"latitude\":90.01,\"longitude\":0}", "{\"latitude\":-90.01,\"longitude\":0}",
            "{\"latitude\":0,\"longitude\":180.01}", "{\"latitude\":0,\"longitude\":-180.01}",
            "{\"latitude\":\"NaN\",\"longitude\":0,\"coordinatesFinite\":true}",
            "{\"latitude\":0,\"longitude\":\"Infinity\"}"
    })
    void invalidCoordinatesStopBeforeMutation(String json) throws Exception {
        mvc.perform(patch("/api/member/me/location").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"address", "addressDetail", "zipCode"})
    void overlongLocationFieldsStopBeforeMutation(String field) throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of(
                "latitude", 0, "longitude", 0, field, "a".repeat(field.equals("zipCode") ? 11 : 256)));
        mvc.perform(patch("/api/member/me/location").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void notificationOnlyAndCoordinateOnlyRequestsRemainValidIncludingBoundaryValues() throws Exception {
        mvc.perform(put("/api/member/update").contentType(MediaType.APPLICATION_JSON)
                .content("{\"emailNotificationEnabled\":false}")).andExpect(status().isOk());
        verify(service).updateMember(eq(7L), argThat(value -> value.getName() == null && Boolean.FALSE.equals(value.getEmailNotificationEnabled())));
        for (String json : List.of("{\"latitude\":0,\"longitude\":0}",
                "{\"latitude\":90,\"longitude\":180}", "{\"latitude\":-90,\"longitude\":-180}")) {
            mvc.perform(patch("/api/member/me/location").contentType(MediaType.APPLICATION_JSON).content(json))
                    .andExpect(status().isOk());
        }
        verify(service, times(3)).updateLocation(eq(7L), argThat(value -> value.getAddress() == null));
    }
}
