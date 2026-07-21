package kr.it.reserve.audit.scheduler;

import kr.it.reserve.audit.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 소프트 삭제된 항목을 30일 후 자동 영구 삭제
 * AuditLog는 90일 후 자동 삭제
 * 매일 새벽 3시 실행
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TrashCleanupScheduler {

    private final AuditLogService auditLogService;

    @Scheduled(cron = "0 0 3 * * *")
    public void cleanupExpiredSoftDeletes() {
        log.info("TrashCleanupScheduler triggered");
        auditLogService.performScheduledCleanup();
    }
}
