package kr.it.reserve.reservation.service;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.reservation.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "reserve.reservation.auto-completion-enabled", havingValue = "true")
public class ReservationCompletionScheduler {
    private final ReservationRepository reservations;
    private final ReservationAutoCompletion completion;

    @Scheduled(fixedDelayString = "${reserve.reservation.auto-completion-delay-ms:60000}")
    public void completeDue() {
        for (Long id : reservations.findAutoCompletionIds(ServiceTime.now(), PageRequest.of(0, 50))) {
            try { completion.complete(id); }
            catch (RuntimeException e) { log.warn("Reservation completion deferred: reservationId={}, errorType={}", id, e.getClass().getSimpleName()); }
        }
    }
}
