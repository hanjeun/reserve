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
