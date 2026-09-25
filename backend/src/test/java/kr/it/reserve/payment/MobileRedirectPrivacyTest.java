package kr.it.reserve.payment;

import kr.it.reserve.advertisement.controller.AdvertisementApiController;
import kr.it.reserve.advertisement.service.AdvertisementService;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.payment.controller.PaymentApiController;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MobileRedirectPrivacyTest {
    private static final String PRIVATE_TEXT = "private-provider-response@example.test";

    @Test
    void suppliedProviderMessageIsNotCopiedIntoEitherRedirect() {
        var paymentController = paymentController(mock(PaymentRepository.class));
        var adController = adController(mock(AdvertisementService.class));
        var paymentLocation = paymentController.handleMobileRedirect("TEST", "ERROR", PRIVATE_TEXT).getHeaders().getLocation();
        var adLocation = adController.handleMobileRedirect("TEST", "ERROR", PRIVATE_TEXT).getHeaders().getLocation();
        for (var location : new java.net.URI[] {paymentLocation, adLocation}) {
            assertNotNull(location);
            assertEquals("reserve.example.test", location.getHost());
            assertFalse(URLDecoder.decode(location.toString(), StandardCharsets.UTF_8).contains(PRIVATE_TEXT));
        }
    }

    @Test
    void domainExceptionMessageIsNotCopiedIntoEitherRedirect() {
        var repository = mock(PaymentRepository.class);
        when(repository.findByMerchantUid("TEST")).thenThrow(new PaymentException(PRIVATE_TEXT));
        var adService = mock(AdvertisementService.class);
        when(adService.verifyPaymentByMerchantUid("TEST")).thenThrow(new PaymentException(PRIVATE_TEXT));
        var paymentLocation = paymentController(repository).handleMobileRedirect("TEST", null, null).getHeaders().getLocation();
        var adLocation = adController(adService).handleMobileRedirect("TEST", null, null).getHeaders().getLocation();
        assertFalse(URLDecoder.decode(paymentLocation.toString(), StandardCharsets.UTF_8).contains(PRIVATE_TEXT));
        assertFalse(URLDecoder.decode(adLocation.toString(), StandardCharsets.UTF_8).contains(PRIVATE_TEXT));
    }

    private PaymentApiController paymentController(PaymentRepository repository) {
        var controller = new PaymentApiController(mock(PaymentService.class), mock(PortoneService.class), repository);
        ReflectionTestUtils.setField(controller, "frontendUrl", "https://reserve.example.test");
        return controller;
    }

    private AdvertisementApiController adController(AdvertisementService service) {
        var controller = new AdvertisementApiController(service, mock(RateLimiter.class));
        ReflectionTestUtils.setField(controller, "frontendUrl", "https://reserve.example.test");
        return controller;
    }
}
