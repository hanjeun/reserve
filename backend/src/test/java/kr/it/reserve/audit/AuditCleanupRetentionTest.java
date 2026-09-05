package kr.it.reserve.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.audit.entity.AuditLog;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.audit.service.AuditCleanupWorker;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuditCleanupRetentionTest {

    @Mock private AuditLogRepository auditLogRepository;
    @Mock private AdminSentMailRepository adminSentMailRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private ReviewRepository reviewRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private ObjectMapper objectMapper;
    @Mock private AuditCleanupWorker auditCleanupWorker;

    @InjectMocks private AuditLogService auditLogService;

    @Test
    @DisplayName("감사로그는 expiresAt 시각에 정리하고 실패 재시도용 휴지통 로그는 일괄삭제하지 않는다")
    void cleanupUsesStoredExpiryWithoutAddingAnotherNinetyDays() {
        AuditLog item = AuditLog.builder()
                .entityType("REVIEW")
                .entityId(4L)
                .action("SOFT_DELETE")
                .actorEmail("actor@example.com")
                .snapshot("{}")
                .expiresAt(LocalDateTime.now().minusDays(1))
                .build();
        ReflectionTestUtils.setField(item, "id", 99L);
        when(auditLogRepository.findExpiredSoftDeletes(any(LocalDateTime.class)))
                .thenReturn(List.of(item));
        when(auditCleanupWorker.deleteOneItem(any(Long.class), any(LocalDateTime.class)))
                .thenReturn(true);

        auditLogService.performScheduledCleanup();

        ArgumentCaptor<LocalDateTime> scanTime = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> purgeTime = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(auditLogRepository).findExpiredSoftDeletes(scanTime.capture());
        verify(auditLogRepository).deleteExpiredNonTrash(purgeTime.capture());
        assertThat(purgeTime.getValue()).isEqualTo(scanTime.getValue());
        verify(auditCleanupWorker).deleteOneItem(99L, scanTime.getValue());
    }

    @Test
    @DisplayName("항목별 삭제 작업은 실제 프록시 경계를 타는 REQUIRES_NEW 메서드다")
    void workerHasIndependentTransactionBoundary() throws Exception {
        Method method = AuditCleanupWorker.class.getMethod(
                "deleteOneItem", Long.class, LocalDateTime.class);
        Transactional transactional = method.getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
    }
}
