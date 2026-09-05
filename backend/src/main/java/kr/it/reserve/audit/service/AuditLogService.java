package kr.it.reserve.audit.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.audit.entity.AuditLog;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.global.error.AuditException;
import kr.it.reserve.mailbox.entity.AdminSentMail;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 감사 로그(AuditLog) + 휴지통(Trash) 서비스.
 *
 * 설계 메모: 휴지통(소프트 삭제 + 복구)은 "실수로 지워도 되돌릴 수 있어야 하는" 콘텐츠 —
 * 예약(RESERVATION), 리뷰(REVIEW), 메일(MAIL/SENT_MAIL), 광고(ADVERTISEMENT, 2026-07 추가)
 * — 에만 적용한다. 회원(MEMBER)/가게(STORE)는 운영 정책 위반에 대한 제재이므로 정지/영구정지로 처리하며
 * (AdminManagementController 참고) 더 이상 이 서비스에서 소프트 삭제하지 않는다.
 * logMemberSanction/logStoreSanction은 제재 행위를 감사 로그로만 남기고
 * 실제 soft-delete 엔트리(휴지통 표시 대상)를 만들지 않는다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;
    private final AdminSentMailRepository adminSentMailRepository;
    private final ReservationRepository reservationRepository;
    private final ReviewRepository reviewRepository;
    private final AdvertisementRepository advertisementRepository;
    private final ObjectMapper objectMapper;
    private final AuditCleanupWorker auditCleanupWorker;

    // ── 소프트 삭제 + 스냅샷 저장 (예약/리뷰/메일만 해당) ──────────────

    @Transactional
    public void softDeleteSentMail(Long mailId) {
        AdminSentMail mail = adminSentMailRepository.findById(mailId)
                .orElseThrow(() -> AuditException.notFound("SentMail not found: " + mailId));
        mail.softDelete();
        saveAuditLog("SENT_MAIL", mailId, "SOFT_DELETE",
                Map.of("toEmail", mail.getToEmail(), "subject", nullSafe(mail.getSubject())));
        log.info("SentMail soft-deleted: id={}", mailId);
    }

    /**
     * 예약 소프트 삭제 로그만 기록 (entity는 호출측에서 이미 softDelete 호출한 후)
     * 사용자/사업자가 내 예약에서 삭제 시 호출
     */
    public void logReservationDelete(Reservation reservation) {
        saveAuditLog("RESERVATION", reservation.getId(), "SOFT_DELETE", Map.of(
                "가게",   reservation.getStore().getName(),
                "예약자", nullSafe(reservation.getMember().getName()),
                "날짜",   reservation.getReservationDate().toString(),
                "상태",   reservation.getStatus().name()
        ));
    }

    @Transactional
    public void softDeleteReservation(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> AuditException.notFound("Reservation not found: " + reservationId));
        reservation.softDelete();
        saveAuditLog("RESERVATION", reservationId, "SOFT_DELETE", Map.of(
                "가게",   reservation.getStore().getName(),
                "예약자", nullSafe(reservation.getMember().getName()),
                "날짜",   reservation.getReservationDate().toString(),
                "상태",   reservation.getStatus().name()
        ));
        log.info("Reservation soft-deleted: id={}", reservationId);
    }

    @Transactional
    public void softDeleteReview(Long reviewId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> AuditException.notFound("Review not found: " + reviewId));
        review.softDelete();
        saveAuditLog("REVIEW", reviewId, "SOFT_DELETE", Map.of(
                "가게",   review.getStore().getName(),
                "작성자", nullSafe(review.getMember().getName()),
                "별점",   review.getRating().toString() + "점",
                "내용",   review.getContent() != null ? review.getContent().substring(0, Math.min(20, review.getContent().length())) + "..." : ""
        ));
        log.info("Review soft-deleted: id={}", reviewId);
    }

    /**
     * 광고 종료상태 행 숨기기(소프트삭제) — 2026-07 추가.
     * 호출측(AdvertisementService.removeAd)에서 이미 종료상태(EXPIRED/CANCELLED/REFUNDED/SUSPENDED)만
     * 허용하는지 검증한 뒤 호출함.
     */
    @Transactional
    public void softDeleteAdvertisement(Long adId) {
        Advertisement ad = advertisementRepository.findById(adId)
                .orElseThrow(() -> AuditException.notFound("Advertisement not found: " + adId));
        ad.softDelete();
        saveAuditLog("ADVERTISEMENT", adId, "SOFT_DELETE", Map.of(
                "가게",   ad.getStore().getName(),
                "유형",   ad.getAdType().name(),
                "기간",   ad.getStartDate() + " ~ " + ad.getEndDate(),
                "상태",   ad.getStatus().name()
        ));
        log.info("Advertisement soft-deleted: id={}", adId);
    }

    // ── 복구 (예약/리뷰/메일만 해당) ──────────────────────────────

    @Transactional
    public void restore(String entityType, Long entityId) {
        switch (entityType.toUpperCase()) {
            case "SENT_MAIL"      -> adminSentMailRepository.restoreById(entityId);
            case "RESERVATION"    -> reservationRepository.restoreById(entityId);
            case "REVIEW"         -> reviewRepository.restoreById(entityId);
            case "ADVERTISEMENT"  -> advertisementRepository.restoreById(entityId);
            default -> throw new AuditException("휴지통 복구가 지원되지 않는 항목입니다: " + entityType);
        }
        // 휴지통에서 제거 (SOFT_DELETE 로그 삭제)
        auditLogRepository.deleteSoftDeleteLog(entityType.toUpperCase(), entityId);
        saveAuditLog(entityType, entityId, "RESTORE", Map.of());
        log.info("Entity restored: type={}, id={}", entityType, entityId);
    }

    // ── 제재 / 인증 로그 (회원/가게 — 휴지통 미사용, 감사 로그만 기록) ──────

    /**
     * 회원 제재 로그 (정지/영구정지/해제)
     * action: SUSPEND | BAN | UNBAN
     */
    @Transactional
    public void logMemberSanction(Long memberId, String memberEmail, String action, String detail) {
        saveAuditLogWithActor("MEMBER", memberId, action,
                Map.of("이메일", memberEmail, "사유", detail),
                getCurrentUserEmail());
        log.info("Member sanction logged: id={}, action={}", memberId, action);
    }

    /**
     * 가게 제재 로그 (영업정지/영구폐업/해제)
     * action: SUSPEND | BAN | UNBAN
     */
    @Transactional
    public void logStoreSanction(Long storeId, String storeName, String action, String detail) {
        saveAuditLogWithActor("STORE", storeId, action,
                Map.of("가게명", storeName, "사유", detail),
                getCurrentUserEmail());
        log.info("Store sanction logged: id={}, action={}", storeId, action);
    }

    /**
     * 사업자 인증 처리 로그 (승인/거절)
     * action: APPROVED | REJECTED
     */
    @Transactional
    public void logBusinessVerification(Long memberId, String memberEmail, String action, String detail) {
        saveAuditLogWithActor("MEMBER", memberId, action,
                Map.of("이메일", memberEmail, "사유", detail),
                getCurrentUserEmail());
        log.info("Business verification logged: memberId={}, action={}", memberId, action);
    }

    // ── 스케줄러 전용 자동 정리 ────────────────────────────────

    /**
     * 만료된 소프트 삭제 항목 자동 영구 삭제 + AuditLog 기록
     * TrashCleanupScheduler에서 호출
     */
    @Transactional
    public void performScheduledCleanup() {
        LocalDateTime now = LocalDateTime.now();
        List<AuditLog> expired = auditLogRepository.findExpiredSoftDeletes(now);
        log.info("Scheduled cleanup started: {} items to hard-delete", expired.size());

        int success = 0;
        for (AuditLog item : expired) {
            try {
                // 별도 빈의 REQUIRES_NEW 경계를 통과해야 실제로 항목별 트랜잭션이 된다.
                if (auditCleanupWorker.deleteOneItem(item.getId(), now)) {
                    success++;
                }
            } catch (Exception e) {
                log.warn("Auto hard-delete failed: type={}, id={}, errorType={}",
                        item.getEntityType(), item.getEntityId(), e.getClass().getSimpleName());
            }
        }

        // expiresAt 자체가 삭제 시각이다. 여기서 다시 90일을 빼면 의도한 90일이 180일이 된다.
        // 실패한 SOFT_DELETE 로그는 다음 실행에서 재시도해야 하므로 이 일괄 정리에서 제외한다.
        int auditDeleted = auditLogRepository.deleteExpiredNonTrash(now);
        log.info("Scheduled cleanup complete: success={}/{}, auditLogDeleted={}",
                success, expired.size(), auditDeleted);
    }

    // ── 목록 조회 ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<AuditLog> getTrashItems(String entityType, Pageable pageable) {
        LocalDateTime now = LocalDateTime.now();
        if (entityType == null || entityType.isBlank()) {
            return auditLogRepository.findRestorable(now, pageable);
        }
        return auditLogRepository.findRestorableByType(entityType.toUpperCase(), now, pageable);
    }

    @Transactional(readOnly = true)
    public Page<AuditLog> getAuditLogs(String entityType, Pageable pageable) {
        if (entityType == null || entityType.isBlank()) {
            return auditLogRepository.findAllByOrderByCreatedAtDesc(pageable);
        }
        return auditLogRepository.findByEntityTypeOrderByCreatedAtDesc(entityType.toUpperCase(), pageable);
    }

    // ── 내부 유틸 ──────────────────────────────────────────────

    private void saveAuditLogWithActor(String entityType, Long entityId, String action,
                                       Map<String, String> snapshotData, String actorEmail) {
        String snapshot = toJson(snapshotData);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(AuditRetentionPolicy.AUDIT_DAYS);
        auditLogRepository.save(AuditLog.builder()
                .entityType(entityType)
                .entityId(entityId)
                .action(action)
                .actorEmail(actorEmail)
                .snapshot(snapshot)
                .expiresAt(expiresAt)
                .build());
    }

    private void saveAuditLog(String entityType, Long entityId, String action, Map<String, String> snapshotData) {
        String actorEmail = getCurrentUserEmail();
        String snapshot = toJson(snapshotData);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(
                "SOFT_DELETE".equals(action)
                        ? AuditRetentionPolicy.TRASH_DAYS
                        : AuditRetentionPolicy.AUDIT_DAYS
        );
        auditLogRepository.save(AuditLog.builder()
                .entityType(entityType)
                .entityId(entityId)
                .action(action)
                .actorEmail(actorEmail)
                .snapshot(snapshot)
                .expiresAt(expiresAt)
                .build());
    }

    private String getCurrentUserEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return "system";
        Object principal = auth.getPrincipal();
        if (principal instanceof Member m) {
            return m.getEmail();
        }
        String name = auth.getName();
        // Member@... 같은 toString 값이 오면 "system" 으로 대체
        return (name != null && !name.contains("@") && name.contains(".")) ? "system" : name;
    }

    private String toJson(Map<String, String> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            return "{}";
        }
    }

    private String nullSafe(String value) {
        return value != null ? value : "";
    }
}
