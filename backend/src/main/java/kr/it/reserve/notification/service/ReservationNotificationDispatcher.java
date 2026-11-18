package kr.it.reserve.notification.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationNotificationDispatcher {
    private final ReservationNotificationService notifications;

    @Scheduled(fixedDelay = 5_000)
    public void dispatch() {
        var now = LocalDateTime.now(Clock.systemUTC());
        for (Long id : notifications.due(now)) {
            try {
                notifications.deliver(id, now);
            } catch (RuntimeException failure) {
                log.warn("Reservation notification delivery failed: id={}, errorType={}", id, failure.getClass().getSimpleName());
                notifications.defer(id, now);
            }
        }
    }
}
