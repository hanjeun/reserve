package kr.it.reserve.payment;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.global.error.PaymentException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.*;
import org.springframework.web.client.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.URI;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@Timeout(15)
class PortoneConcurrencyTest {
    private PortoneService service(RestTemplate http) {
        var service = new PortoneService(http);
        ReflectionTestUtils.setField(service, "storeId", "fixture-store");
        ReflectionTestUtils.setField(service, "v2Secret", "synthetic-test-secret");
        return service;
    }
    private PortoneV2PaymentResponse payment() throws Exception {
        return new ObjectMapper().readValue("{\"id\":\"fixture-order\",\"storeId\":\"fixture-store\",\"currency\":\"KRW\",\"status\":\"PAID\"}", PortoneV2PaymentResponse.class);
    }
    @Test void saturatedPgReadsRejectMoreReadsAndRefundsWithoutQueuing() throws Exception {
        RestTemplate http = mock(RestTemplate.class);
        var service = service(http);
        var metrics = new io.micrometer.core.instrument.simple.SimpleMeterRegistry();
        ReflectionTestUtils.setField(service, "metrics", metrics);
        ReflectionTestUtils.invokeMethod(service, "checkPortoneConfig");
        var entered = new CountDownLatch(4);
        var release = new CountDownLatch(1);
        var response = payment();
        when(http.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class), eq(PortoneV2PaymentResponse.class)))
                .thenAnswer(call -> { entered.countDown(); if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Release timed out"); return ResponseEntity.ok(response); });
        try (var executor = Executors.newFixedThreadPool(4)) {
            var requests = new java.util.ArrayList<Future<PortoneV2PaymentResponse>>();
            try {
                for (int i = 0; i < 4; i++) requests.add(executor.submit(() -> service.getPaymentInfo("fixture-order")));
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(metrics.get("reserve.payment.pg.inflight").gauge().value()).isEqualTo(4);
                assertThatThrownBy(() -> service.getPaymentInfo("fixture-order"))
                        .isInstanceOfSatisfying(PortoneService.RequestNotSentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
                assertThatThrownBy(() -> service.cancelPayment("fixture-order", 1000, "fixture", "synthetic-refund-0001"))
                        .isInstanceOfSatisfying(PortoneService.RequestNotSentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
                verify(http, never()).postForEntity(any(java.net.URI.class), any(), eq(kr.it.reserve.payment.dto.PortoneV2CancelResponse.class));
            } finally { release.countDown(); }
            for (var request : requests) assertThat(request.get(5, TimeUnit.SECONDS)).isSameAs(response);
        }
        assertThat(service.getPaymentInfo("fixture-order")).isSameAs(response);
        assertThat(metrics.get("reserve.payment.pg.inflight").gauge().value()).isZero();
        assertThat(metrics.get("reserve.payment.pg.rejected").counter().count()).isEqualTo(2);
    }
    @Test void transportErrorsAlwaysReleaseTheExternalCallSlot() throws Exception {
        RestTemplate http = mock(RestTemplate.class);
        var service = service(http);
        when(http.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class), eq(PortoneV2PaymentResponse.class)))
                .thenThrow(new ResourceAccessException("synthetic transport failure"));
        for (int i = 0; i < 12; i++) assertThatThrownBy(() -> service.getPaymentInfo("fixture-order"))
                .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR));
        when(http.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class), eq(PortoneV2PaymentResponse.class)))
                .thenReturn(ResponseEntity.ok(payment()));
        assertThat(service.getPaymentInfo("fixture-order").getPaymentId()).isEqualTo("fixture-order");
    }
}
