package kr.it.reserve.payment;

import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class PortoneAdCancellationContractTest {
    @Test void partialRefundKeepsExpectedBalanceSeparateFromRequestedAmount() {
        RestTemplate http = new RestTemplate();
        var server = MockRestServiceServer.bindTo(http).build();
        PortoneService service = new PortoneService(http);
        ReflectionTestUtils.setField(service, "v2Secret", "test-only");
        server.expect(requestTo("https://api.portone.io/payments/ORDER-test/cancel"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Idempotency-Key", "\"reserve-refund-attempt-42\""))
                .andExpect(jsonPath("$.amount").value(3000))
                .andExpect(jsonPath("$.currentCancellableAmount").value(10000))
                .andRespond(withSuccess("{\"cancellation\":{\"status\":\"SUCCEEDED\",\"id\":\"test-cancel\",\"totalAmount\":3000}}",
                        MediaType.APPLICATION_JSON));
        assertThat(service.cancelPayment("ORDER-test", 3000, "부분 환불", "reserve-refund-attempt-42", 10000)
                .resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.SUCCEEDED);
        server.verify();
    }

    @Test void fullRefundUsesStoredStructuredHeaderAndExpectedCancellableBalance() {
        RestTemplate http = new RestTemplate();
        var server = MockRestServiceServer.bindTo(http).build();
        PortoneService service = new PortoneService(http);
        ReflectionTestUtils.setField(service, "v2Secret", "test-only");
        ReflectionTestUtils.setField(service, "storeId", "test-store");
        server.expect(requestTo("https://api.portone.io/payments/AD-test/cancel"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Idempotency-Key", "\"ad-refund-test-fixed-key\""))
                .andExpect(jsonPath("$.amount").value(1000))
                .andExpect(jsonPath("$.currentCancellableAmount").value(1000))
                .andExpect(jsonPath("$.storeId").value("test-store"))
                .andRespond(withSuccess("{\"cancellation\":{\"status\":\"REQUESTED\",\"id\":\"test-cancel\",\"totalAmount\":1000}}",
                        MediaType.APPLICATION_JSON));
        var outcome = service.cancelPayment("AD-test", 1000, "검증", "ad-refund-test-fixed-key");
        assertThat(outcome.resolveStatus()).isEqualTo(PortoneV2CancelResponse.Status.REQUESTED);
        server.verify();
    }
}
