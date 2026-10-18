package kr.it.reserve.reservation.service;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.dto.QrCheckinResponse;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** QR issuance, idempotent attendance, completion/no-show run under the facade transaction. */
@Slf4j(topic = "kr.it.reserve.reservation.service.ReservationService")
final class ReservationAttendance {
    private static final String RESERVATION_NOT_FOUND_MESSAGE = "예약을 찾을 수 없어요.";
    private final ReservationRepository reservationRepository;
    private final QrCheckinTokenProvider qrCheckinTokenProvider;
    private final ReservationUpdates updates;

    ReservationAttendance(ReservationRepository reservations, QrCheckinTokenProvider tokens) {
        this(reservations, tokens, null);
    }

    ReservationAttendance(ReservationRepository reservations, QrCheckinTokenProvider tokens, ReservationUpdates updates) {
        reservationRepository = reservations;
        qrCheckinTokenProvider = tokens;
        this.updates = updates;
    }

    String generateQrCheckinToken(Long reservationId, Member member) {
        Reservation reservation = findByIdOrThrow(reservationId);
        ReservationAccess.member(reservation, member);
        if (!ReservationAccess.approved(reservation)) {
            throw new ReservationException("승인된 예약만 QR 체크인을 사용할 수 있어요.",
                    HttpStatus.BAD_REQUEST);
        }
        return qrCheckinTokenProvider.generateToken(reservationId, reservation.getReservationDate());
    }

    QrCheckinResponse checkInByQrToken(String token, Member owner) {
        Long reservationId = qrCheckinTokenProvider.parseReservationId(token);
        Reservation reservation = reservationRepository.findByIdForUpdate(reservationId)
                .orElseThrow(() -> new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
        ReservationAccess.owner(reservation, owner);

        // ★★ 방문 당일에만 체크인할 수 있다 (2026-08-19 신설).
        //
        //   그 전까지 날짜 검사가 아예 없었다. 토큰 만료는 "방문일 다음 날 새벽" 과 "발급 후 24시간"
        //   중 빠른 쪽인데, **3개월 뒤 예약이라도 방금 발급한 QR 은 24시간 동안 유효하다.**
        //   그래서 손님이 오늘 그 QR 을 보여주면 사장님의 승인 절차를 건너뛰고 곧바로 CONFIRMED 가 됐다.
        //   QR 체크인은 "왔다"를 증명하는 수단이지 "미리 확정받는" 수단이 아니다.
        //
        //   비교 기준은 반드시 KST 다 — reservationDate 는 손님이 고른 한국 날짜이고
        //   컨테이너는 UTC 로 돈다(ServiceTime 참고). 이걸 놓치면 매일 09시 이전에 오탐이 난다.
        LocalDate today = ServiceTime.today();
        if (!today.equals(reservation.getReservationDate())) {
            // 감사 로그: 거부는 WARN 으로 남긴다. Loki 에 level 인덱스가 있어
            // {job="reserve", level="WARN"} |= "QR check-in" 한 줄로 이상 패턴을 볼 수 있다.
            log.warn("QR check-in rejected (date mismatch): reservationId={}, storeId={}, ownerId={}, reservationDate={}, today={}",
                    reservation.getId(), reservation.getStore().getId(), owner.getId(),
                    reservation.getReservationDate(), today);
            throw new ReservationException(
                    "방문 당일에만 QR 체크인을 할 수 있어요. (예약일: " + reservation.getReservationDate() + ")",
                    HttpStatus.BAD_REQUEST
            );
        }

        if (reservation.getCheckedInAt() != null) {
            log.info("QR check-in repeated: reservationId={}, storeId={}, ownerId={}",
                    reservation.getId(), reservation.getStore().getId(), owner.getId());
            return new QrCheckinResponse(ReservationResponse.fromEntity(reservation), true);
        }

        // UNCONFIRMED도 원래 CONFIRMED였다가 예약 시각이 지나도록 마감되지 않은 상태다.
        // 지각 도착 직전에 스케줄러가 상태를 바꿨다는 이유로 실제 출석 기록을 막지 않는다.
        if (!ReservationAccess.approved(reservation)) {
            log.warn("QR check-in rejected (bad status): reservationId={}, storeId={}, ownerId={}, status={}",
                    reservation.getId(), reservation.getStore().getId(), owner.getId(), reservation.getStatus());
            throw new ReservationException(
                    "승인된 예약만 QR 체크인을 할 수 있어요. (현재 상태: " + reservation.getStatus() + ")",
                    HttpStatus.BAD_REQUEST
            );
        }

        // DB timestamp는 createdAt과 같은 JVM(운영 컨테이너 UTC) 시계를 사용하고,
        // 사용자에게 내보낼 때 ReservationResponse에서 한국 시각으로 바꾼다.
        reservation.setCheckedInAt(LocalDateTime.now(Clock.systemDefaultZone()));
        changed(reservation);

        // 개인정보 없이 출석 사실을 운영 로그에 남긴다. checkedInAt은 DB의 장기 근거다.
        //
        //   audit_log 테이블(AuditLogService)이 아니라 로그로 남기는 이유: 그 테이블은
        //   "휴지통 스냅샷 + 관리자 행위"용이고 90일 뒤 스케줄러가 지운다. 체크인은 영업 중 반복되는
        //   일반 동작이라 매 스캔마다 행을 쌓으면 성격이 다른 데이터가 섞이고 조회도 느려진다.
        //   Loki 가 이미 이 로그를 수집하고 level 라벨로 인덱싱하므로 조회는 그쪽이 낫다.
        log.info("QR check-in recorded: reservationId={}, storeId={}, ownerId={}, reservationDate={}, reservationTime={}",
                reservation.getId(), reservation.getStore().getId(), owner.getId(),
                reservation.getReservationDate(), reservation.getReservationTime());

        return new QrCheckinResponse(ReservationResponse.fromEntity(reservation), false);
    }

    void completeReservation(Long id, Member owner) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        ReservationAccess.owner(reservation, owner);

        // UNCONFIRMED 도 받는다 (2026-08-11) — 그건 "승인됐는데 시간이 지나도록 사장님이
        // 처리를 안 한" 상태다. 처리를 안 했다는 이유로 처리 수단을 막으면 영영 못 닫는다.
        if (!ReservationAccess.approved(reservation)) {
            throw new ReservationException("승인된 예약만 이용완료 처리할 수 있어요.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
        changed(reservation);
    }

    void markNoShow(Long id, Member owner) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        ReservationAccess.owner(reservation, owner);

        if (!ReservationAccess.approved(reservation)) {
            throw new ReservationException("승인된 예약만 노쇼 처리할 수 있어요.", HttpStatus.BAD_REQUEST);
        }
        if (reservation.getCheckedInAt() != null) {
            throw new ReservationException("체크인된 예약은 노쇼로 처리할 수 없어요.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.NO_SHOW);
        changed(reservation);
    }

    private void changed(Reservation reservation) {
        if (updates != null) updates.changed(reservation, EntityUpdates.Operation.UPDATED);
    }

    private Reservation findByIdOrThrow(Long id) {
        return reservationRepository.findById(id)
                .orElseThrow(() -> new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
    }

    private Reservation findByIdForUpdateOrThrow(Long id) {
        return reservationRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
    }
}
