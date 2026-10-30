package kr.it.reserve.member.mfa;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.util.List;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "reserve.mfa")
public class MfaProperties {
    private boolean enabled;
    private String rpId = "app.reserve.it.kr";
    private List<String> origins = List.of("https://app.reserve.it.kr");
    private String encryptionKey = "";

    @jakarta.annotation.PostConstruct
    void validate() {
        if (!enabled) return;
        try {
            if (java.util.Base64.getDecoder().decode(encryptionKey).length != 32) throw new IllegalArgumentException();
            if (rpId == null || !rpId.matches("[a-z0-9][a-z0-9.-]*") || origins == null || origins.isEmpty()) throw new IllegalArgumentException();
            for (String origin : origins) {
                var uri = java.net.URI.create(origin);
                String host = uri.getHost();
                boolean secure = "https".equals(uri.getScheme()) || "localhost".equals(rpId) && "http".equals(uri.getScheme());
                if (!secure || host == null || !(host.equals(rpId) || host.endsWith("." + rpId))
                        || !origin.equals(uri.getScheme() + "://" + uri.getRawAuthority())
                        || uri.getUserInfo() != null) throw new IllegalArgumentException();
            }
        } catch (RuntimeException e) { throw new IllegalStateException("MFA configuration is invalid"); }
    }
}
