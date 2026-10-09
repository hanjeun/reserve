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
public class    JwtProperties {

    private String issuer;
    private String secretKey;
    private TokenConfig accessToken = new TokenConfig();
    private TokenConfig refreshToken = new TokenConfig();

    @PostConstruct
    public void validate() {
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException("JWT secret key is not configured");
        }

        if (secretKey.length() < 64) {
            throw new IllegalStateException("JWT secret key must contain at least 64 characters");
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
            if (expirationMinutes != null) return Duration.ofMinutes(expirationMinutes);
            if (expirationDays != null) return Duration.ofDays(expirationDays);
            throw new IllegalStateException("Token expiration is not configured");
        }
    }

    public Duration getAccessTokenExpiration() {
        return accessToken.getExpirationDuration();
    }

    public Duration getRefreshTokenExpiration() {
        return refreshToken.getExpirationDuration();
    }
}
