package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.service.PortoneService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class PortonePaymentLookupContractTest {
    private PortoneService service;
    private MockRestServiceServer server;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach void setUp() {
        RestTemplate http = new RestTemplate();
        server = MockRestServiceServer.bindTo(http).build();
        service = new PortoneService(http);
        ReflectionTestUtils.setField(service, "v2Secret", "fixture-secret");
        ReflectionTestUtils.setField(service, "storeId", "store-fixture");
    }

    private Map<String, Object> response(String status) {
        return new HashMap<>(Map.of("id", "ORDER-fixture", "storeId", "store-fixture", "currency", "KRW",
                "status", status, "amount", Map.of("total", 10000)));
    }

    private void respond(Map<String, Object> body) throws Exception {
        server.expect(requestTo("https://api.portone.io/payments/ORDER-fixture?storeId=store-fixture"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "PortOne fixture-secret"))
                .andRespond(withSuccess(json.writeValueAsString(body), MediaType.APPLICATION_JSON));
    }

    @ParameterizedTest
    @ValueSource(strings = {"READY", "PAID", "CANCELLED", "PARTIAL_CANCELLED", "FAILED"})
    void scopesLookupToConfiguredStoreWithoutWriting(String status) throws Exception {
        respond(response(status));
        var result = service.getPaymentInfo("ORDER-fixture");
        assertThat(result.getPaymentId()).isEqualTo("ORDER-fixture");
        assertThat(result.getStoreId()).isEqualTo("store-fixture");
        assertThat(result.getStatus()).isEqualTo(status);
        assertThat(result.getAmount()).isEqualTo(10000);
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"id,OTHER-order", "storeId,OTHER-store", "currency,USD", "id,", "storeId,", "currency,"})
    void refusesMismatchedOrMissingPaymentIdentity(String field, String value) throws Exception {
        var body = response("PAID");
        body.put(field, value);
        respond(body);
        assertThatThrownBy(() -> service.getPaymentInfo("ORDER-fixture"))
                .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"NAVERPAY,PaymentMethodEasyPay", "KAKAOPAY,PaymentMethodEasyPay", "TOSSPAY,PaymentMethodEasyPay"})
    void readsEasyPayProviderFromActualV2Response(String provider, String type) throws Exception {
        var body = response("PAID");
        body.put("method", Map.of("type", type, "provider", provider));
        respond(body);
        var result = service.getPaymentInfo("ORDER-fixture");
        assertThat(result.getPayMethod()).isEqualTo(type);
        assertThat(result.getPgProvider()).isEqualTo(provider);
        server.verify();
    }

    @Test void readsLegacyNestedEasyPayProvider() throws Exception {
        var body = response("PAID");
        body.put("method", Map.of("type", "EasyPay", "easyPay", Map.of("provider", "KakaoPay")));
        respond(body);
        assertThat(service.getPaymentInfo("ORDER-fixture").getPgProvider()).isEqualTo("KakaoPay");
        server.verify();
    }

    @Test void refusesUnconfiguredStoreAndBlankOrderBeforeSending() {
        assertThatThrownBy(() -> service.getPaymentInfo(" ")).isInstanceOf(PaymentException.class);
        ReflectionTestUtils.setField(service, "storeId", " ");
        assertThatThrownBy(() -> service.getPaymentInfo("ORDER-fixture"))
                .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test void emptySuccessfulBodyIsUncertainRatherThanAnAbsentPayment() {
        server.expect(requestTo("https://api.portone.io/payments/ORDER-fixture?storeId=store-fixture"))
                .andRespond(withSuccess("", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> service.getPaymentInfo("ORDER-fixture"))
                .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY));
        server.verify();
    }

    @ParameterizedTest @ValueSource(strings = {"", "<html>not found</html>", "{}", "{\"type\":\"STORE_NOT_FOUND\"}"})
    void generic404DoesNotProveAnAbsentPayment(String body) {
        server.expect(requestTo("https://api.portone.io/payments/ORDER-fixture?storeId=store-fixture"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body(body));
        assertThatThrownBy(() -> service.getPaymentInfo("ORDER-fixture"))
                .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.getStatus()).isNotEqualTo(HttpStatus.NOT_FOUND));
        server.verify();
    }

    @Test void onlyDocumentedMissingPaymentResponseIsAuthoritative404() {
        server.expect(requestTo("https://api.portone.io/payments/ORDER-fixture?storeId=store-fixture"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{\"type\":\"PAYMENT_NOT_FOUND\"}"));
        assertThatThrownBy(() -> service.getPaymentInfo("ORDER-fixture"))
                .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        server.verify();
    }
}
