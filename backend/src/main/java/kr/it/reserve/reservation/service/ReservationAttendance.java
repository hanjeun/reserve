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
import java.util.function.Consumer;

/** QR 발급과 멱등 체크인·완료·노쇼는 서비스 트랜잭션 안에서 처리한다. */
@Slf4j(topic = "kr.it.reserve.reservation.service.ReservationService")
final class ReservationAttendance {
    private static final String RESERVATION_NOT_FOUND_MESSAGE = "예약을 찾을 수 없어요.";
    private final ReservationRepository reservationRepository;
    private final QrCheckinTokenProvider qrCheckinTokenProvider;
    private final ReservationUpdates updates;
    private final Consumer<Long> beforeReservationLock;

    ReservationAttendance(ReservationRepository reservations, QrCheckinTokenProvider tokens,
                          ReservationUpdates updates, Consumer<Long> beforeReservationLock) {
        reservationRepository = reservations;
        qrCheckinTokenProvider = tokens;
        this.updates = updates;
        this.beforeReservationLock = beforeReservationLock;
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
        Reservation reservation = findByIdForUpdateOrThrow(reservationId);
        ReservationAccess.owner(reservation, owner);

        // 체크인은 한국 시간의 방문 당일에만 허용한다.
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
        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);
        changed(reservation);

        // 출석 시각은 DB에 보존하고 로그에는 업무 식별자만 남긴다.
        log.info("QR check-in recorded: reservationId={}, storeId={}, ownerId={}, reservationDate={}, reservationTime={}",
                reservation.getId(), reservation.getStore().getId(), owner.getId(),
                reservation.getReservationDate(), reservation.getReservationTime());

        return new QrCheckinResponse(ReservationResponse.fromEntity(reservation), false);
    }

    void completeReservation(Long id, Member owner) {
        Reservation reservation = findByIdForUpdateOrThrow(id);
        ReservationAccess.owner(reservation, owner);

        if (reservation.getStatus() == Reservation.ReservationStatus.COMPLETED) return;
        // 승인 후 시간이 지난 UNCONFIRMED도 완료·노쇼 처리할 수 있다.
        if (!ReservationAccess.approved(reservation)) {
            throw new ReservationException("승인된 예약만 이용완료 처리할 수 있어요.", HttpStatus.BAD_REQUEST);
        }

        if (Boolean.TRUE.equals(reservation.getAttendanceRefundEnabled()) && reservation.getCheckedInAt() == null) {
            throw new ReservationException("QR 체크인을 확인한 뒤 이용 완료할 수 있어요.", HttpStatus.BAD_REQUEST);
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
        beforeReservationLock.accept(id);
        return reservationRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ReservationException(RESERVATION_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND));
    }
}
