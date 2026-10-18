package kr.it.reserve.config.jwt;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;

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
}
