package kr.it.reserve.global.admission;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** 방문 입장량만 제어한다. 인증과 예약 정원은 별도 경계다. */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "reserve.service-admission")
public class ServiceAdmissionProperties {
    private boolean enabled;
    private int capacity = 20;
    private int sessionSeconds = 900;
    private int maxSessionSeconds = 7200;
    private int heartbeatTimeoutSeconds = 90;
    private int maxWaiting = 1000;
    private String epoch;
    private Automatic automatic = new Automatic();

    @Getter
    @Setter
    public static class Automatic {
        private boolean enabled;
        private int memoryPressureMib = 128;
        private int memoryClearMib = 256;
        private int cpuPressurePercent = 90;
        private int cpuClearPercent = 65;
        private int heapPressurePercent = 90;
        private int heapClearPercent = 75;
        private int pressureSeconds = 30;
        private int recoverySeconds = 120;
        private int minimumEmergencySeconds = 120;

        private void validate() {
            if (!enabled) return;
            if (memoryPressureMib < 1 || memoryClearMib <= memoryPressureMib || memoryClearMib > 65536
                    || cpuClearPercent < 1 || cpuPressurePercent <= cpuClearPercent || cpuPressurePercent > 100
                    || heapClearPercent < 1 || heapPressurePercent <= heapClearPercent || heapPressurePercent > 100
                    || pressureSeconds < 30 || pressureSeconds > 600
                    || recoverySeconds < 120 || recoverySeconds > 3600
                    || minimumEmergencySeconds < 120 || minimumEmergencySeconds > 3600) {
                throw new IllegalArgumentException("Invalid automatic service admission configuration");
            }
        }
    }

    @PostConstruct
    public void validate() {
        if (!enabled) return;
        if (capacity < 1 || capacity > 10000 || sessionSeconds < 30 || sessionSeconds > 86400
                || maxSessionSeconds < sessionSeconds || maxSessionSeconds > 7 * 86400
                || heartbeatTimeoutSeconds < 30 || heartbeatTimeoutSeconds > 300
                || maxWaiting < 1 || maxWaiting > 100000
                || epoch == null || !epoch.matches("[A-Za-z0-9-]{16,64}")) {
            throw new IllegalArgumentException("Invalid service admission configuration");
        }
        if (automatic == null) throw new IllegalArgumentException("Missing automatic service admission configuration");
        automatic.validate();
    }
}
