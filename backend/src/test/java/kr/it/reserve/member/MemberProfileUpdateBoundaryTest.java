package kr.it.reserve.member;

import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.feed.controller.FeedController;
import kr.it.reserve.feed.service.FeedMediaService;
import kr.it.reserve.feed.service.FeedModerationService;
import kr.it.reserve.feed.service.FeedService;
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
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.nio.charset.StandardCharsets;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MemberProfileUpdateBoundaryTest {
    private static final int ROUTES = 9;
    private final MemberService service = mock(MemberService.class);
    private final FeedService profiles = mock(FeedService.class);
    private final RateLimiter limiter = new RateLimiter();
    private MockMvc mvc;

    @BeforeEach void prepare() {
        authenticate(7L);
        mvc = mvc(limiter);
    }

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    private MockMvc mvc(RateLimiter limits) {
        return MockMvcBuilders.standaloneSetup(new MemberApiController(service, mock(CookieUtil.class),
                        mock(MemberWithdrawalService.class), limits),
                        new FeedController(profiles, mock(FeedMediaService.class), mock(FeedModerationService.class), limits))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private void authenticate(long id) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                Member.builder().id(id).name("시험 회원").build(), null, List.of()));
    }

    private RequestBuilder mutation(int route, String ip) {
        String profile = "{\"nickname\":\"합성 회원\",\"visibility\":\"PRIVATE\"}";
        MockMultipartFile image = new MockMultipartFile("image", "test.png", "image/png", new byte[]{1});
        AbstractMockHttpServletRequestBuilder<?> request = switch (route) {
            case 0 -> put("/api/member/update").contentType(MediaType.APPLICATION_JSON).content("{\"emailNotificationEnabled\":false}");
            case 1 -> multipart("/api/member/profile-image").file(image);
            case 2 -> delete("/api/member/profile-image");
            case 3 -> patch("/api/member/me/location").contentType(MediaType.APPLICATION_JSON).content("{\"latitude\":0,\"longitude\":0}");
            case 4 -> patch("/api/member/me/marketing-consent").contentType(MediaType.APPLICATION_JSON).content("{\"marketingAgreed\":false}");
            case 5 -> put("/api/feed/me/profile").contentType(MediaType.APPLICATION_JSON).content(profile);
            case 6 -> multipart(HttpMethod.PUT, "/api/feed/me/profile")
                    .file(new MockMultipartFile("profile", "blob", MediaType.APPLICATION_JSON_VALUE, profile.getBytes(StandardCharsets.UTF_8))).file(image);
            case 7 -> multipart(HttpMethod.PUT, "/api/feed/me/profile/avatar").file(image);
            case 8 -> delete("/api/feed/me/profile/avatar");
            default -> throw new IllegalArgumentException("Unknown synthetic route");
        };
        return request.with(value -> { value.setRemoteAddr(ip); return value; });
    }

    @Test void allMutationRoutesShareTheMemberQuotaAcrossIpChanges() throws Exception {
        int[] accepted = new int[ROUTES];
        for (int i = 0; i < RateLimiter.Policy.MEMBER_UPDATE.capacity(); i++) {
            int route = i % ROUTES;
            mvc.perform(mutation(route, "203.0.113." + (i + 1))).andExpect(status().isOk());
            accepted[route]++;
        }
        for (int route = 0; route < ROUTES; route++) {
            mvc.perform(mutation(route, "198.51.100.1")).andExpect(status().isTooManyRequests());
        }
        verify(service, times(accepted[0])).updateMember(eq(7L), any());
        verify(service, times(accepted[1])).updateProfileImage(eq(7L), any());
        verify(service, times(accepted[2])).deleteProfileImage(7L);
        verify(service, times(accepted[3])).updateLocation(eq(7L), any());
        verify(service, times(accepted[4])).updateMarketingConsent(7L, false);
        verify(profiles, times(accepted[5])).updateProfile(eq(7L), any());
        verify(profiles, times(accepted[6])).updateProfile(eq(7L), any(), any());
        verify(profiles, times(accepted[7])).uploadProfileAvatar(eq(7L), any());
        verify(profiles, times(accepted[8])).deleteProfileAvatar(7L);
        authenticate(8L);
        mvc.perform(mutation(2, "198.51.100.1")).andExpect(status().isOk());
    }

    @Test void changingMembersCannotBypassTheSharedIpQuotaAndOtherIpsRemainUsable() throws Exception {
        for (int i = 0; i < RateLimiter.Policy.MEMBER_UPDATE_IP.capacity(); i++) {
            authenticate(i + 1L);
            mvc.perform(mutation(i % ROUTES, "203.0.113.1")).andExpect(status().isOk());
        }
        authenticate(99L);
        mvc.perform(mutation(2, "203.0.113.1")).andExpect(status().isTooManyRequests());
        mvc.perform(mutation(2, "198.51.100.1")).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4, 5, 6, 7, 8})
    void ipRejectionPrecedesMemberConsumptionAndEveryWrite(int route) throws Exception {
        RateLimiter limits = mock(RateLimiter.class);
        mvc(limits).perform(mutation(route, "203.0.113.1")).andExpect(status().isTooManyRequests());
        verify(limits).tryConsume("member-update:ip:203.0.113.1", RateLimiter.Policy.MEMBER_UPDATE_IP);
        verify(limits, never()).tryConsume(anyString(), eq(RateLimiter.Policy.MEMBER_UPDATE));
        verifyNoInteractions(service, profiles);
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
