package kr.it.reserve.audit.service;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.audit.entity.AuditLog;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.global.error.AuditException;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.Set;

/**
 * 휴지통 항목 하나를 독립 트랜잭션으로 처리한다.
 * 서비스 내부 self-call로는 REQUIRES_NEW가 적용되지 않으므로 별도 빈이어야 한다.
 */
@Service
@RequiredArgsConstructor
public class AuditCleanupWorker {

    private static final Set<AdStatus> FINANCIAL_AD_STATUSES = EnumSet.of(
            AdStatus.ACTIVE,
            AdStatus.EXPIRED,
            AdStatus.SUSPENDED,
            AdStatus.REFUNDED);

    private final AuditLogRepository auditLogRepository;
    private final AdminSentMailRepository adminSentMailRepository;
    private final ReservationRepository reservationRepository;
    private final ReviewRepository reviewRepository;
    private final AdvertisementRepository advertisementRepository;
    private final PaymentRepository paymentRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean deleteOneItem(Long auditLogId, LocalDateTime now) {
        AuditLog item = auditLogRepository.findByIdForUpdate(auditLogId).orElse(null);
        if (item == null
                || !"SOFT_DELETE".equals(item.getAction())
                || item.getExpiresAt().isAfter(now)) {
            return false;
        }

        if (mustRetain(item)) {
            auditLogRepository.deleteSoftDeleteLog(item.getEntityType(), item.getEntityId());
            auditLogRepository.save(systemLog(
                    item,
                    "RETENTION_HOLD",
                    "Financial or linked record retained until an approved retention policy is applied",
                    now));
            return true;
        }

        hardDeleteEntity(item.getEntityType(), item.getEntityId());
        auditLogRepository.deleteSoftDeleteLog(item.getEntityType(), item.getEntityId());
        auditLogRepository.save(systemLog(item, "HARD_DELETE", null, now));
        return true;
    }

    private boolean mustRetain(AuditLog item) {
        if ("RESERVATION".equalsIgnoreCase(item.getEntityType())) {
            return paymentRepository.existsByReservationId(item.getEntityId())
                    || reviewRepository.existsByReservationId(item.getEntityId());
        }
        if ("ADVERTISEMENT".equalsIgnoreCase(item.getEntityType())) {
            return advertisementRepository.findById(item.getEntityId())
                    .map(ad -> FINANCIAL_AD_STATUSES.contains(ad.getStatus()))
                    .orElse(false);
        }
        return false;
    }

    private void hardDeleteEntity(String entityType, Long entityId) {
        switch (entityType.toUpperCase()) {
            case "SENT_MAIL" -> adminSentMailRepository.deleteById(entityId);
            case "RESERVATION" -> reservationRepository.deleteById(entityId);
            case "REVIEW" -> reviewRepository.deleteById(entityId);
            case "ADVERTISEMENT" -> advertisementRepository.deleteById(entityId);
            default -> throw new AuditException("휴지통 영구삭제가 지원되지 않는 항목입니다: " + entityType);
        }
    }

    private AuditLog systemLog(AuditLog item, String action, String reason, LocalDateTime now) {
        return AuditLog.builder()
                .entityType(item.getEntityType())
                .entityId(item.getEntityId())
                .action(action)
                .actorEmail("TrashCleanupScheduler")
                .snapshot("{}")
                .reason(reason)
                .expiresAt(now.plusDays(AuditRetentionPolicy.AUDIT_DAYS))
                .build();
    }
}
