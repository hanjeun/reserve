package com.reserve.audit.scheduler;

import com.reserve.audit.repository.AuditLogRepository;
import com.reserve.mailbox.repository.AdminMailRepository;
import com.reserve.mailbox.repository.AdminSentMailRepository;
import com.reserve.member.repository.MemberRepository;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.review.repository.ReviewRepository;
import com.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 소프트 삭제된 항목을 30일 후 자동 영구 삭제
 * AuditLog는 90일 후 자동 삭제
 * 매일 새벽 3시 실행
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TrashCleanupScheduler {

    private final AdminMailRepository adminMailRepository;
    private final AdminSentMailRepository adminSentMailRepository;
    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;
    private final ReservationRepository reservationRepository;
    private final ReviewRepository reviewRepository;
    private final AuditLogRepository auditLogRepository;

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void cleanupExpiredSoftDeletes() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(30);
        log.info("TrashCleanupScheduler started: cutoff={}", cutoff);

        int mailDeleted = adminMailRepository.hardDeleteByDeletedAtBefore(cutoff);
        int sentMailDeleted = adminSentMailRepository.hardDeleteByDeletedAtBefore(cutoff);
        int memberDeleted = memberRepository.hardDeleteByDeletedAtBefore(cutoff);
        int storeDeleted = storeRepository.hardDeleteByDeletedAtBefore(cutoff);
        int reservationDeleted = reservationRepository.hardDeleteByDeletedAtBefore(cutoff);
        int reviewDeleted = reviewRepository.hardDeleteByDeletedAtBefore(cutoff);

        log.info("Trash cleanup complete: mail={}, sentMail={}, member={}, store={}, reservation={}, review={}",
                mailDeleted, sentMailDeleted, memberDeleted, storeDeleted, reservationDeleted, reviewDeleted);

        // AuditLog 90일 경과분 삭제
        int auditDeleted = auditLogRepository.deleteExpired(LocalDateTime.now());
        log.info("AuditLog cleanup complete: deleted={}", auditDeleted);
    }
}
