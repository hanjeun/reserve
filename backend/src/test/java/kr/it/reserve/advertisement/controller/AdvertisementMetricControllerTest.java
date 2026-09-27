package kr.it.reserve.advertisement.controller;

import kr.it.reserve.advertisement.service.AdvertisementService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdvertisementMetricControllerTest {

    @Mock private AdvertisementService advertisementService;
    @Mock private RateLimiter rateLimiter;
    @InjectMocks private AdvertisementApiController controller;

    @Test
    void usesTrustedRealIpAndRecordsWhenQuotaRemains() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Real-IP", "203.0.113.7");
        request.addHeader("X-Forwarded-For", "198.51.100.1, 198.51.100.2");
        when(rateLimiter.tryConsume("203.0.113.7", RateLimiter.Policy.AD_METRIC)).thenReturn(true);

        ApiResponse<Void> response = controller.recordImpression(11L, request);

        assertThat(response.isSuccess()).isTrue();
        verify(advertisementService).recordImpression(11L);
    }

    @Test
    void usesTheLastForwardedHopWhenRealIpIsAbsent() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "198.51.100.1, 203.0.113.9");
        when(rateLimiter.tryConsume("203.0.113.9", RateLimiter.Policy.AD_METRIC)).thenReturn(true);

        ApiResponse<Void> response = controller.recordClick(12L, request);

        assertThat(response.isSuccess()).isTrue();
        verify(advertisementService).recordClick(12L);
    }

    @Test
    void limitExceededIsAQuietSuccessfulNoOp() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.10");
        when(rateLimiter.tryConsume("203.0.113.10", RateLimiter.Policy.AD_METRIC)).thenReturn(false);

        ApiResponse<Void> response = controller.recordImpression(13L, request);

        assertThat(response.isSuccess()).isTrue();
        verify(advertisementService, never()).recordImpression(13L);
    }

    @Test
    void metricStorageFailureDoesNotBreakThePublicEndpointContract() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.11");
        when(rateLimiter.tryConsume("203.0.113.11", RateLimiter.Policy.AD_METRIC)).thenReturn(true);
        doThrow(new IllegalStateException("storage unavailable"))
                .when(advertisementService).recordClick(14L);

        ApiResponse<Void> response = controller.recordClick(14L, request);

        assertThat(response.isSuccess()).isTrue();
    }

    @Test
    void myAdsDefaultsToTheZeroBasedTwentyItemPage() throws Exception {
        Member business = Member.builder().id(7L).role(Role.BUSINESS).build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(business, null, java.util.List.of()));
        when(advertisementService.getMyAds(business, 0, 20, null, null))
                .thenReturn(Page.empty(PageRequest.of(0, 20)));

        try {
            MockMvcBuilders.standaloneSetup(controller).build()
                    .perform(get("/api/advertisements/my"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.content").isEmpty());
            verify(advertisementService).getMyAds(business, 0, 20, null, null);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void myAdsPassesPaginationAndDatabaseFiltersTogether() throws Exception {
        Member business = Member.builder().id(8L).role(Role.BUSINESS).build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(business, null, java.util.List.of()));
        when(advertisementService.getMyAds(business, 2, 100, 42L, "스튜디오"))
                .thenReturn(Page.empty(PageRequest.of(2, 100)));

        try {
            MockMvcBuilders.standaloneSetup(controller).build()
                    .perform(get("/api/advertisements/my")
                            .param("page", "2")
                            .param("size", "100")
                            .param("storeId", "42")
                            .param("search", "스튜디오"))
                    .andExpect(status().isOk());
            verify(advertisementService).getMyAds(business, 2, 100, 42L, "스튜디오");
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
