package kr.it.reserve.payment.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentWebhookInboxRepository extends JpaRepository<PaymentWebhookInbox, Long> {

    Optional<PaymentWebhookInbox> findByWebhookId(String webhookId);

    Page<PaymentWebhookInbox> findAllByOrderByReceivedAtDesc(Pageable pageable);

    Page<PaymentWebhookInbox> findByStatusInOrderByReceivedAtDesc(
            Collection<PaymentWebhookInbox.InboxStatus> statuses,
            Pageable pageable);

    long countByStatusIn(Collection<PaymentWebhookInbox.InboxStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM PaymentWebhookInbox i WHERE i.webhookId = :webhookId")
    Optional<PaymentWebhookInbox> findByWebhookIdForUpdate(@Param("webhookId") String webhookId);

    @Query("""
            SELECT i.webhookId
            FROM PaymentWebhookInbox i
            WHERE (i.status IN :retryableStatuses
                   AND (i.nextRetryAt IS NULL OR i.nextRetryAt <= :now))
               OR (i.status = :processingStatus
                   AND (i.lastAttemptAt IS NULL OR i.lastAttemptAt < :staleBefore))
            ORDER BY i.receivedAt ASC
            """)
    List<String> findRetryableWebhookIds(
            @Param("retryableStatuses") Collection<PaymentWebhookInbox.InboxStatus> retryableStatuses,
            @Param("processingStatus") PaymentWebhookInbox.InboxStatus processingStatus,
            @Param("now") LocalDateTime now,
            @Param("staleBefore") LocalDateTime staleBefore,
            Pageable pageable);

    @Query("""
            SELECT COUNT(i) FROM PaymentWebhookInbox i
             WHERE i.status IN :statuses
               AND i.merchantUid IN (
                   SELECT p.merchantUid FROM Payment p WHERE p.reservation.store.id = :storeId)
            """)
    long countUnfinishedByStoreId(
            @Param("storeId") Long storeId,
            @Param("statuses") Collection<PaymentWebhookInbox.InboxStatus> statuses);

    @Query("""
            SELECT COUNT(i) FROM PaymentWebhookInbox i
             WHERE i.status IN :statuses
               AND i.merchantUid IN (
                   SELECT p.merchantUid FROM Payment p WHERE p.member.id = :memberId)
            """)
    long countUnfinishedByMemberId(
            @Param("memberId") Long memberId,
            @Param("statuses") Collection<PaymentWebhookInbox.InboxStatus> statuses);
}
