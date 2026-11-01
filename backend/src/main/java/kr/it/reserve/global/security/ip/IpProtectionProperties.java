package kr.it.reserve.global.security.ip;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;

@Getter
@Setter
@ConfigurationProperties(prefix = "reserve.security.ip-protection")
public class IpProtectionProperties {
    private boolean enabled;
    private String fingerprintKey = "";
    private List<String> trustedProxies = List.of();
}
