package com.reserve.audit.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reserve.audit.entity.AuditLog;
import com.reserve.audit.repository.AuditLogRepository;
import com.reserve.mailbox.entity.AdminMail;
import com.reserve.mailbox.entity.AdminSentMail;
import com.reserve.mailbox.repository.AdminMailRepository;
import com.reserve.mailbox.repository.AdminSentMailRepository;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import com.reserve.reservation.entity.Reservation;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.review.entity.Review;
import com.reserve.review.repository.ReviewRepository;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditLogService {

    private static final int SOFT_DELETE_RETENTION_DAYS = 30;
    private static final int AUDIT_LOG_RETENTION_DAYS = 90;

    private final AuditLogRepository auditLogRepository;
    private final AdminMailRepository adminMailRepository;
    private final AdminSentMailRepository adminSentMailRepository;
    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;
    private final ReservationRepository reservationRepository;
    private final ReviewRepository reviewRepository;
    private final ObjectMapper objectMapper;

    // ── 소프트 삭제 + 스냅샷 저장 ──────────────────────────────

    @Transactional
    public void softDeleteMail(Long mailId) {
        AdminMail mail = adminMailRepository.findById(mailId)
                .orElseThrow(() -> new IllegalArgumentException("Mail not found: " + mailId));
        mail.softDelete();
        saveAuditLog("MAIL", mailId, "SOFT_DELETE",
                Map.of("fromEmail", mail.getFromEmail(), "subject", nullSafe(mail.getSubject())));
        log.info("Mail soft-deleted: id={}", mailId);
    }

    @Transactional
    public void softDeleteSentMail(Long mailId) {
        AdminSentMail mail = adminSentMailRepository.findById(mailId)
                .orElseThrow(() -> new IllegalArgumentException("SentMail not found: " + mailId));
        mail.softDelete();
        saveAuditLog("SENT_MAIL", mailId, "SOFT_DELETE",
                Map.of("toEmail", mail.getToEmail(), "subject", nullSafe(mail.getSubject())));
        log.info("SentMail soft-deleted: id={}", mailId);
    }

    @Transactional
    public void softDeleteMember(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("Member not found: " + memberId));
        member.softDelete();
        saveAuditLog("MEMBER", memberId, "SOFT_DELETE",
                Map.of("email", member.getEmail(), "name", nullSafe(member.getName()), "role", member.getRole().name()));
        log.info("Member soft-deleted: id={}", memberId);
    }

    @Transactional
    public void softDeleteStore(Long storeId) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new IllegalArgumentException("Store not found: " + storeId));
        store.softDelete();
        saveAuditLog("STORE", storeId, "SOFT_DELETE",
                Map.of("name", store.getName(), "ownerEmail", store.getOwner().getEmail(), "category", nullSafe(store.getCategory())));
        log.info("Store soft-deleted: id={}", storeId);
    }

    @Transactional
    public void softDeleteReservation(Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new IllegalArgumentException("Reservation not found: " + reservationId));
        reservation.softDelete();
        saveAuditLog("RESERVATION", reservationId, "SOFT_DELETE",
                Map.of("memberEmail", reservation.getMember().getEmail(), "storeId", reservation.getStore().getId().toString()));
        log.info("Reservation soft-deleted: id={}", reservationId);
    }

    @Transactional
    public void softDeleteReview(Long reviewId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new IllegalArgumentException("Review not found: " + reviewId));
        review.softDelete();
        saveAuditLog("REVIEW", reviewId, "SOFT_DELETE",
                Map.of("memberEmail", review.getMember().getEmail(), "storeId", review.getStore().getId().toString(), "rating", review.getRating().toString()));
        log.info("Review soft-deleted: id={}", reviewId);
    }

    // ── 복구 ──────────────────────────────────────────────────

    @Transactional
    public void restore(String entityType, Long entityId) {
        switch (entityType.toUpperCase()) {
            case "MAIL"        -> adminMailRepository.restoreById(entityId);
            case "SENT_MAIL"   -> adminSentMailRepository.restoreById(entityId);
            case "MEMBER"      -> memberRepository.restoreById(entityId);
            case "STORE"       -> storeRepository.restoreById(entityId);
            case "RESERVATION" -> reservationRepository.restoreById(entityId);
            case "REVIEW"      -> reviewRepository.restoreById(entityId);
            default -> throw new IllegalArgumentException("Unknown entity type: " + entityType);
        }
        saveAuditLog(entityType, entityId, "RESTORE", Map.of());
        log.info("Entity restored: type={}, id={}", entityType, entityId);
    }

    // ── 영구 삭제 ──────────────────────────────────────────────

    @Transactional
    public void hardDelete(String entityType, Long entityId) {
        switch (entityType.toUpperCase()) {
            case "MAIL"        -> adminMailRepository.deleteById(entityId);
            case "SENT_MAIL"   -> adminSentMailRepository.deleteById(entityId);
            case "MEMBER"      -> memberRepository.deleteById(entityId);
            case "STORE"       -> storeRepository.deleteById(entityId);
            case "RESERVATION" -> reservationRepository.deleteById(entityId);
            case "REVIEW"      -> reviewRepository.deleteById(entityId);
            default -> throw new IllegalArgumentException("Unknown entity type: " + entityType);
        }
        saveAuditLog(entityType, entityId, "HARD_DELETE", Map.of());
        log.info("Entity hard-deleted: type={}, id={}", entityType, entityId);
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

    private void saveAuditLog(String entityType, Long entityId, String action, Map<String, String> snapshotData) {
        String actorEmail = getCurrentUserEmail();
        String snapshot = toJson(snapshotData);
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(
                "SOFT_DELETE".equals(action) ? SOFT_DELETE_RETENTION_DAYS : AUDIT_LOG_RETENTION_DAYS
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
        return (auth != null) ? auth.getName() : "system";
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
