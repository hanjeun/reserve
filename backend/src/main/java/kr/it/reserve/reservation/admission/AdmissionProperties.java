package kr.it.reserve.reservation.admission;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** Explicit opt-in per sale/slot. Queue capacity never changes the store's booking capacity. */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "reserve.admission")
public class AdmissionProperties {
    private boolean enabled;
    private List<Campaign> campaigns = new ArrayList<>();

    @Getter @Setter
    public static class Campaign {
        private String id;
        private Long storeId;
        private LocalDate date;
        private LocalTime time;
        private Instant opensAt;
        private Instant closesAt;
        private int concurrent = 10;
        private int leaseSeconds = 180;
        private int idleSeconds = 90;
        private int maxWaiting = 10000;
        private int maxParticipants = 100000;
        // Rotate only with an explicit operator reset; missing Redis state must not reopen admission.
        private String epoch;
    }

    @PostConstruct
    public void validate() {
        if (!enabled) return;
        var ids = new HashSet<String>();
        var slots = new HashSet<String>();
        if (campaigns == null || campaigns.isEmpty() || campaigns.size() > 100) invalid();
        for (Campaign c : campaigns) {
            if (c.id == null || !c.id.matches("[a-z0-9][a-z0-9-]{0,47}") || !ids.add(c.id)
                    || c.storeId == null || c.storeId < 1 || c.date == null || c.time == null
                    || c.opensAt == null || c.closesAt == null || !c.opensAt.isBefore(c.closesAt)
                    || c.closesAt.isAfter(c.opensAt.plusSeconds(7 * 86400L))
                    || c.epoch == null || !c.epoch.matches("[a-zA-Z0-9-]{16,64}")
                    || c.concurrent < 1 || c.concurrent > 500 || c.leaseSeconds < 30 || c.leaseSeconds > 600
                    || c.idleSeconds < 30 || c.idleSeconds > 300 || c.maxWaiting < 1 || c.maxWaiting > 100000
                    || c.maxParticipants < c.maxWaiting + c.concurrent || c.maxParticipants > 200000
                    || !slots.add(c.storeId + ":" + c.date + ":" + c.time)) invalid();
        }
    }

    private static void invalid() { throw new IllegalArgumentException("Invalid admission campaign configuration"); }
}
