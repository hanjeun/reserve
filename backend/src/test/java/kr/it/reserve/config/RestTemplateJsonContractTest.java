package kr.it.reserve.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class RestTemplateJsonContractTest {
    @Test
    void configuredJsonAndPaymentAliasesRemainConsistentForExternalRequests() {
        var mapper = new ObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        var http = new RestTemplateConfig().restTemplate(mapper);
        var server = MockRestServiceServer.bindTo(http).build();
        server.expect(requestTo("https://synthetic.example.test/payment"))
                .andExpect(content().json("{\"request_key\":\"fixture\"}"))
                .andRespond(withSuccess("""
                        {"id":"fixture-order","status":"PAID","currency":"KRW",
                         "amount":{"total":1000,"cancelled":0},"unknown_field":"ignored"}
                        """, MediaType.APPLICATION_JSON));
        var response = http.postForObject("https://synthetic.example.test/payment",
                new Request("fixture"), PortoneV2PaymentResponse.class);
        assertThat(response).isNotNull();
        assertThat(response.getPaymentId()).isEqualTo("fixture-order");
        assertThat(response.getAmount()).isEqualTo(1000);
        assertThat(response.isPaid()).isTrue();
        server.verify();
    }

    private record Request(String requestKey) { }
}
