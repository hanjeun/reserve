package kr.it.reserve.config.jwt;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Getter
@Setter
@Component
@ConfigurationProperties("jwt")
public class JwtProperties {

    private String issuer;
    private String secretKey;
    private TokenConfig accessToken = new TokenConfig();
    private TokenConfig refreshToken = new TokenConfig();
    /** Sliding refresh expiry never extends this limit; new credentials require a new login. */
    private Duration absoluteSessionLifetime = Duration.ofDays(30);
    private String accessAudience;
    private String refreshAudience;
    private String activeKeyId;
    /** Optional rotation keyring. No environment key is created or changed by the application. */
    private Map<String, String> signingKeys = new LinkedHashMap<>();

    @PostConstruct
    public void validate() {
        if (issuer == null || issuer.isBlank()) {
            throw new IllegalStateException("JWT issuer is not configured");
        }
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException("JWT secret key is not configured");
        }

        if (secretKey.length() < 64) {
            throw new IllegalStateException("JWT secret key must contain at least 64 characters");
        }
        if (accessToken == null || refreshToken == null) {
            throw new IllegalStateException("JWT token expiration is not configured");
        }
        getAccessTokenExpiration();
        getRefreshTokenExpiration();
        if (absoluteSessionLifetime == null || absoluteSessionLifetime.getSeconds() < 1 || absoluteSessionLifetime.getNano() != 0
                || absoluteSessionLifetime.compareTo(Duration.ofDays(365)) > 0) {
            throw new IllegalStateException("Absolute session lifetime must be positive and at most 365 days");
        }
        if (getAccessAudience().isBlank() || getRefreshAudience().isBlank()
                || getAccessAudience().equals(getRefreshAudience())) {
            throw new IllegalStateException("Access and refresh audiences must be nonempty and distinct");
        }
        if (signingKeys == null || signingKeys.size() > 8) throw new IllegalStateException("Invalid JWT keyring size");
        signingKeys.forEach((id, key) -> {
            if (id == null || !id.matches("[A-Za-z0-9_-]{1,48}") || key == null || key.length() < 64) {
                throw new IllegalStateException("Invalid JWT keyring entry");
            }
        });
        if (activeKeyId != null && !signingKeys.containsKey(activeKeyId)) {
            throw new IllegalStateException("Active JWT signing key is not in the keyring");
        }

        log.info("JWT config loaded: issuer={}, accessTokenExpiry={}m, refreshTokenExpiry={}d",
                issuer, accessToken.expirationMinutes, refreshToken.expirationDays);
    }

    @Getter
    @Setter
    public static class TokenConfig {
        private Integer expirationMinutes;
        private Integer expirationDays;

        public Duration getExpirationDuration() {
            if ((expirationMinutes == null) == (expirationDays == null)) {
                throw new IllegalStateException("Configure exactly one token expiration unit");
            }
            Duration duration = expirationMinutes != null
                    ? Duration.ofMinutes(expirationMinutes) : Duration.ofDays(expirationDays);
            if (duration.isZero() || duration.isNegative()) {
                throw new IllegalStateException("Token expiration must be positive");
            }
            return duration;
        }
    }

    public Duration getAccessTokenExpiration() {
        return accessToken.getExpirationDuration();
    }

    public Duration getRefreshTokenExpiration() {
        return refreshToken.getExpirationDuration();
    }

    public String getAccessAudience() { return accessAudience == null ? issuer + ":access" : accessAudience; }
    public String getRefreshAudience() { return refreshAudience == null ? issuer + ":refresh" : refreshAudience; }
}
