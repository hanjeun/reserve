package com.reserve.reservation.service;

import com.reserve.reservation.entity.Reservation;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.reservation.util.ReservationCodeGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 표시용 예약번호(reservationCode) 백필 러너.
 *
 * reservationCode 컬럼이 nullable로 새로 추가됐기 때문에, 기존에 이미 저장돼 있던 예약들은
 * 이 값이 null인 상태다. 앱이 완전히 뜬 직후(ApplicationReadyEvent) 1회 실행되어,
 * code가 비어 있는 예약을 모두 찾아 예약 날짜 기준으로 코드를 채워 넣는다.
 *
 * ddl-auto: update 환경이라 별도 마이그레이션 도구(Flyway 등)가 없으므로, 이 러너가
 * "데이터 마이그레이션" 역할을 대신한다. 한 번 채우고 나면 이후엔 대상이 0건이라 사실상 no-op.
 *
 * 코드 생성은 인메모리 Set으로 이번 배치 안에서의 중복을 먼저 거르고, DB 저장 시 unique 제약이
 * 최종 방어선이 된다(같은 날짜에 여러 건이면 랜덤 suffix가 충돌할 여지가 아주 낮지만 대비).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReservationCodeBackfillRunner {

    private final ReservationRepository reservationRepository;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfillMissingCodes() {
        List<Reservation> missing = reservationRepository.findByReservationCodeIsNull();
        if (missing.isEmpty()) {
            log.debug("예약번호 백필 대상 없음 — 건너뜀");
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
        log.info("예약번호 백필 완료: {}건에 reservationCode 채움", filled);
    }
}
