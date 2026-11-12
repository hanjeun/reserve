package kr.it.reserve.reservation.protection;

import kr.it.reserve.global.error.ReservationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static kr.it.reserve.reservation.protection.ReservationSubmissionProtectionTest.REQUEST_ID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ReservationTurnstileTest {
    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final TurnstileProperties properties = new TurnstileProperties();

    @ParameterizedTest
    @CsvSource({
            "true, app.example.test, reservation_submit, " + REQUEST_ID + ", true",
            "true, other.example.test, reservation_submit, " + REQUEST_ID + ", false",
            "true, app.example.test, login, " + REQUEST_ID + ", false",
            "true, app.example.test, reservation_submit, other-request, false",
            "false, app.example.test, reservation_submit, " + REQUEST_ID + ", false"
    })
    void checksProviderSuccessHostnameActionAndRequest(boolean success, String hostname, String action, String cdata, boolean accepted) {
        String response = """
                {"success": %s, "hostname": "%s", "action": "%s", "cdata": "%s", "challenge_ts": "2026-01-01T00:00:00Z"}
                """.formatted(success, hostname, action, cdata);
        server.expect(requestTo(ReservationTurnstile.SITEVERIFY)).andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertThat(verifier().verify("sample-proof", REQUEST_ID)).isEqualTo(accepted);
        server.verify();
    }

    @Test
    void providerUnavailableIsAnExplicitRetryableFailure() {
        server.expect(requestTo(ReservationTurnstile.SITEVERIFY)).andRespond(withServerError());
        assertThatThrownBy(() -> verifier().verify("sample-proof", REQUEST_ID))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getCode())
                        .isEqualTo(ReservationException.Code.RESERVATION_CHALLENGE_UNAVAILABLE));
        server.verify();
    }

    private ReservationTurnstile verifier() {
        properties.setHostname("app.example.test");
        properties.setSecretKey("synthetic-test-value");
        return new ReservationTurnstile(properties, builder.build());
    }
}
