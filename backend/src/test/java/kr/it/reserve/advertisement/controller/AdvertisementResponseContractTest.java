package kr.it.reserve.advertisement.controller;

import kr.it.reserve.advertisement.dto.AdConversionRequest;
import kr.it.reserve.advertisement.dto.AdCreateRequest;
import kr.it.reserve.advertisement.dto.AdPaymentPrepareResponse;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.service.AdvertisementService;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class AdvertisementResponseContractTest {
    private final AdvertisementService service = mock(AdvertisementService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final AdvertisementApiController controller = new AdvertisementApiController(service, limiter);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    static Stream<Consumer<AdvertisementApiController>> authenticatedActions() {
        return Stream.of(
                value -> value.createAd(null),
                value -> value.preparePayment(11L),
                value -> value.verifyPayment(Map.of("merchantUid", "ad-test")),
                value -> value.recordConversion(11L, new AdConversionRequest(12L)),
                value -> value.getAllAds(0, 20, null),
                value -> value.suspendAd(11L, null),
                value -> value.updateAd(11L, null),
                value -> value.cancelAd(11L),
                value -> value.removeAd(11L));
    }

    @ParameterizedTest
    @MethodSource("authenticatedActions")
    void missingAuthenticationStopsBeforeAdvertisementOrPaymentEffects(Consumer<AdvertisementApiController> action) {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(() -> action.accept(controller))
                .isInstanceOf(MemberException.class).hasMessage("로그인이 필요합니다.");
        verifyNoInteractions(service, limiter);
    }

    private Member authenticateBusiness() {
        Member business = Member.builder().id(7L).role(Role.BUSINESS).build();
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(business, null, List.of()));
        return business;
    }

    @Test
    void businessCreationPreservesThePaymentPayloadAndAuthenticatedPrincipal() {
        Member business = authenticateBusiness();
        AdCreateRequest request = mock(AdCreateRequest.class);
        AdPaymentPrepareResponse prepared = AdPaymentPrepareResponse.builder()
                .adId(11L).merchantUid("ad-create-test").amount(10_000).build();
        when(service.createAd(request, business)).thenReturn(prepared);

        var response = controller.createAd(request);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).isSameAs(prepared);
        assertThat(response.getMessage()).isEqualTo("광고 결제 준비 완료");
        verify(service).createAd(request, business);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(limiter);
    }

    @Test
    void businessRetryUsesTheExistingAdvertisementAndPreservesThePaymentPayload() {
        Member business = authenticateBusiness();
        AdPaymentPrepareResponse prepared = AdPaymentPrepareResponse.builder()
                .adId(11L).merchantUid("ad-retry-test").amount(10_000).build();
        when(service.preparePayment(11L, business)).thenReturn(prepared);

        var response = controller.preparePayment(11L);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).isSameAs(prepared);
        assertThat(response.getMessage()).isEqualTo("광고 결제 준비 완료");
        verify(service).preparePayment(11L, business);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(limiter);
    }

    @Test
    void businessVerificationPassesTheExactPaymentIdAndPreservesActivationResponse() {
        Member business = authenticateBusiness();
        String paymentId = "ad-verify-test";
        AdvertisementResponse activated = AdvertisementResponse.builder().id(11L).status("ACTIVE").build();
        when(service.verifyPayment(paymentId, business)).thenReturn(activated);

        var response = controller.verifyPayment(Map.of("merchantUid", paymentId));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).isSameAs(activated);
        assertThat(response.getMessage()).isEqualTo("광고가 활성화되었습니다.");
        verify(service).verifyPayment(paymentId, business);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(limiter);
    }

    @Test
    void activeAdvertisementsRemainPublicAndPreserveTheSelectedTypeAndResponse() {
        AdvertisementResponse banner = AdvertisementResponse.builder().id(11L).adType("BANNER").build();
        List<AdvertisementResponse> advertisements = List.of(banner);
        when(service.getActiveAds(AdType.BANNER)).thenReturn(advertisements);

        var response = controller.getActiveAds(AdType.BANNER);

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).isSameAs(advertisements);
        assertThat(response.getMessage()).isEqualTo("조회 성공");
        verify(service).getActiveAds(AdType.BANNER);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(limiter);
    }

    @Test
    void adminQueryPreservesPageMetadataAndPassesTheSearchToTheService() {
        Member admin = Member.builder().id(7L).role(Role.ADMIN).build();
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(admin, null, List.of()));
        Page<AdvertisementResponse> page = new PageImpl<>(
                List.of(AdvertisementResponse.builder().id(11L).build()), PageRequest.of(2, 20), 41);
        when(service.getAllAds(2, 20, "스튜디오")).thenReturn(page);

        var response = controller.getAllAds(2, 20, "스튜디오");

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getData()).isSameAs(page);
        assertThat(response.getData().getTotalElements()).isEqualTo(41);
        assertThat(response.getMessage()).isEqualTo("조회 성공");
        verify(service).getAllAds(2, 20, "스튜디오");
        verifyNoMoreInteractions(service);
        verifyNoInteractions(limiter);
    }

    @Test
    void unexpectedRedirectFailureKeepsItsInternalMessageOutOfTheLocation() {
        ReflectionTestUtils.setField(controller, "frontendUrl", "https://reserve.it.kr");
        String paymentId = "ad-id&success=true";
        String internalMessage = "internal database detail";
        doThrow(new IllegalStateException(internalMessage)).when(service).verifyPaymentByMerchantUid(paymentId);

        var response = controller.handleMobileRedirect(paymentId, null, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FOUND);
        assertThat(response.getHeaders().getLocation()).isNotNull();
        String location = response.getHeaders().getLocation().toASCIIString();
        assertThat(location).startsWith("https://reserve.it.kr/payment/result?success=false&type=ad&merchant_uid=")
                .contains("merchant_uid=ad-id%26success%3Dtrue").doesNotContain(internalMessage);
        assertThat(URLDecoder.decode(location, StandardCharsets.UTF_8))
                .contains("error_msg=광고 결제 처리 중 오류가 발생했습니다.");
        verify(service).verifyPaymentByMerchantUid(paymentId);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(limiter);
    }
}
