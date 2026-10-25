package kr.it.reserve.reservation.service;

import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.util.ReservationCodeGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 표시 코드가 없는 예약을 날짜 기준으로 보완한다. 배치 내부 중복과 DB 유일성 제약을 함께 확인한다. */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "reservation.code-backfill.enabled", havingValue = "true", matchIfMissing = true)
public class ReservationCodeBackfillRunner {

    private final ReservationRepository reservationRepository;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfillMissingCodes() {
        List<Reservation> missing = reservationRepository.findByReservationCodeIsNull();
        if (missing.isEmpty()) {
            log.debug("Reservation code backfill skipped: no missing codes");
            return;
        }

        Set<String> usedInThisBatch = new HashSet<>();
        int filled = 0;
        for (Reservation reservation : missing) {
            String code;
            do {
                code = ReservationCodeGenerator.generate(reservation.getReservationDate());
            } while (!usedInThisBatch.add(code) || reservationRepository.existsByReservationCode(code));
            reservation.setReservationCode(code);
            filled++;
        }
        log.info("Reservation code backfill completed: filled={}", filled);
    }
}
