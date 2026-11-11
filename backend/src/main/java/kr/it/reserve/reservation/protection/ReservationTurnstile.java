package kr.it.reserve.reservation.protection;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import kr.it.reserve.global.error.ReservationException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.List;

@Component
public class ReservationTurnstile {
    static final String ACTION = "reservation_submit";
    static final String SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    private final TurnstileProperties properties;
    private final RestClient client;

    @Autowired
    public ReservationTurnstile(TurnstileProperties properties) {
        this(properties, verificationClient());
    }

    ReservationTurnstile(TurnstileProperties properties, RestClient client) {
        this.properties = properties;
        this.client = client;
    }

    private static RestClient verificationClient() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        return RestClient.builder().requestFactory(factory).build();
    }

    public boolean verify(String token, String requestId) {
        var body = new LinkedMultiValueMap<String, String>();
        body.add("secret", properties.getSecretKey());
        body.add("response", token);
        Verification result;
        try {
            result = client.post().uri(SITEVERIFY).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(body).retrieve().body(Verification.class);
        } catch (RestClientException failure) {
            throw ReservationException.challengeUnavailable();
        }
        if (result == null || result.errors() != null && result.errors().stream().anyMatch(ReservationTurnstile::providerFailure)) {
            throw ReservationException.challengeUnavailable();
        }
        return result.success() && properties.getHostname().equalsIgnoreCase(result.hostname())
                && ACTION.equals(result.action()) && requestId.equals(result.cdata());
    }

    private static boolean providerFailure(String code) {
        return "internal-error".equals(code) || "invalid-input-secret".equals(code) || "missing-input-secret".equals(code);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Verification(boolean success, String hostname, String action, String cdata,
                                @JsonProperty("error-codes") List<String> errors) {}
}
