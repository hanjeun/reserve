package kr.it.reserve.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.audit.service.*;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminReservationRemovalTest {
    @Mock AuditLogRepository logs;
    @Mock AdminSentMailRepository mails;
    @Mock ReservationRepository reservations;
    @Mock ReviewRepository reviews;
    @Mock AdvertisementRepository ads;
    @Mock ObjectMapper json;
    @Mock AuditCleanupWorker cleanup;
    @Mock PaymentService payments;
    @InjectMocks AuditLogService service;

    @ParameterizedTest
    @EnumSource(value=Reservation.ReservationStatus.class, names={"PENDING","CONFIRMED","UNCONFIRMED"})
    void directAdminTrashCannotRemoveOrRestoreActiveReservations(Reservation.ReservationStatus status) {
        var reservation = Reservation.builder().id(1L).status(status).build();
        when(reservations.findByIdForUpdate(1L)).thenReturn(Optional.of(reservation));
        assertThatThrownBy(() -> service.softDeleteReservation(1L)).isInstanceOf(ReservationException.class);
        assertThat(reservation.isDeleted()).isFalse();
        reservation.softDelete();
        assertThatThrownBy(() -> service.restore("RESERVATION", 1L)).isInstanceOf(ReservationException.class);
        assertThat(reservation.isDeleted()).isTrue();
        verifyNoInteractions(logs);
    }
    @Test void financialRecheckRunsAfterTheSharedLockAndBeforeAnyDeletion() {
        var reservation = Reservation.builder().id(1L).status(Reservation.ReservationStatus.CANCELLED).build();
        when(reservations.findByIdForUpdate(1L)).thenReturn(Optional.of(reservation));
        doThrow(new ReservationException("합성 보류", org.springframework.http.HttpStatus.CONFLICT))
                .when(payments).requireReservationRemovable(reservation);
        assertThatThrownBy(() -> service.softDeleteReservation(1L)).isInstanceOf(ReservationException.class);
        var order = inOrder(payments, reservations);
        order.verify(payments).lockReservationForStateChange(1L);
        order.verify(reservations).findByIdForUpdate(1L);
        order.verify(payments).requireReservationRemovable(reservation);
        assertThat(reservation.isDeleted()).isFalse(); verifyNoInteractions(logs);
    }
}
