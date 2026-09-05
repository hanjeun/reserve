package kr.it.reserve.audit;

import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.audit.entity.AuditLog;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.audit.service.AuditCleanupWorker;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuditCleanupWorkerTest {

    @Mock private AuditLogRepository auditLogRepository;
    @Mock private AdminSentMailRepository adminSentMailRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private ReviewRepository reviewRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private PaymentRepository paymentRepository;

    @InjectMocks private AuditCleanupWorker worker;

    @Test
    @DisplayName("결제와 연결된 예약은 30일이 지나도 물리 삭제하지 않고 보존 홀드로 전환한다")
    void paidReservationBecomesRetentionHold() {
        LocalDateTime now = LocalDateTime.of(2026, 9, 1, 0, 0);
        AuditLog softDelete = AuditLog.builder()
                .entityType("RESERVATION")
                .entityId(9L)
                .action("SOFT_DELETE")
                .actorEmail("actor@example.com")
                .snapshot("{}")
                .expiresAt(now.minusSeconds(1))
                .build();
        when(auditLogRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(softDelete));
        when(paymentRepository.existsByReservationId(9L)).thenReturn(true);

        assertThat(worker.deleteOneItem(1L, now)).isTrue();

        verify(reservationRepository, never()).deleteById(9L);
        verify(auditLogRepository).deleteSoftDeleteLog("RESERVATION", 9L);
        ArgumentCaptor<AuditLog> saved = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(saved.capture());
        assertThat(saved.getValue().getAction()).isEqualTo("RETENTION_HOLD");
        assertThat(saved.getValue().getExpiresAt()).isEqualTo(now.plusDays(90));
    }
}
