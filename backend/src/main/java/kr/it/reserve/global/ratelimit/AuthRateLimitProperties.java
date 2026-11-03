package kr.it.reserve.global.ratelimit;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "reserve.security.auth-limits")
public class AuthRateLimitProperties {
    private boolean enabled;
    private String fingerprintKey = "";
    private String epoch = "";
}
