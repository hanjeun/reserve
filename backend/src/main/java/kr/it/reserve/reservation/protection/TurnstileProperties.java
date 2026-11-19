package kr.it.reserve.reservation.protection;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties("reserve.reservation-protection.turnstile")
public class TurnstileProperties {
    private boolean enabled;
    private String siteKey;
    private String secretKey;
    private String hostname;

    @PostConstruct
    void validate() {
        if (enabled && (siteKey == null || !siteKey.matches("[A-Za-z0-9_-]{1,200}")
                || secretKey == null || secretKey.isBlank()
                || hostname == null || !hostname.matches("[A-Za-z0-9][A-Za-z0-9.-]{0,252}"))) {
            throw new IllegalStateException("Reservation Turnstile requires a site key, secret key, and hostname");
        }
    }
}
