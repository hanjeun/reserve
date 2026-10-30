package kr.it.reserve.payment.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentReconciliationIssueRepository
        extends JpaRepository<PaymentReconciliationIssue, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM PaymentReconciliationIssue i WHERE i.issueKey = :issueKey")
    Optional<PaymentReconciliationIssue> findByIssueKeyForUpdate(@Param("issueKey") String issueKey);

    List<PaymentReconciliationIssue> findByPaymentIdAndStatus(
            Long paymentId,
            PaymentReconciliationIssue.IssueStatus status);

    Page<PaymentReconciliationIssue> findAllByOrderByLastSeenAtDesc(Pageable pageable);

    Page<PaymentReconciliationIssue> findByStatusOrderByLastSeenAtDesc(
            PaymentReconciliationIssue.IssueStatus status,
            Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM PaymentReconciliationIssue i WHERE i.paymentId = :id AND i.status = 'OPEN'")
    List<PaymentReconciliationIssue> findOpenByPaymentIdForUpdate(@Param("id") Long id);

    @Query("SELECT DISTINCT i.paymentId FROM PaymentReconciliationIssue i WHERE i.paymentId IN :ids AND i.status = 'OPEN'")
    List<Long> findOpenPaymentIds(@Param("ids") java.util.Collection<Long> ids);

    long countByStatus(PaymentReconciliationIssue.IssueStatus status);

    @Query("""
            SELECT COUNT(i) > 0 FROM PaymentReconciliationIssue i
             WHERE i.status = 'OPEN' AND (i.reservationId = :reservationId
                OR i.paymentId IN (SELECT p.id FROM Payment p WHERE p.reservation.id = :reservationId)
                OR i.merchantUid IN (SELECT p.merchantUid FROM Payment p WHERE p.reservation.id = :reservationId))
            """)
    boolean existsOpenForReservation(@Param("reservationId") Long reservationId);

    @Query("""
            SELECT COUNT(i) > 0 FROM PaymentReconciliationIssue i
             WHERE i.status = 'OPEN' AND i.issueType IN :types
               AND (i.reservationId = :reservationId
                OR i.paymentId IN (SELECT p.id FROM Payment p WHERE p.reservation.id = :reservationId)
                OR i.merchantUid IN (SELECT p.merchantUid FROM Payment p WHERE p.reservation.id = :reservationId))
            """)
    boolean existsOpenConflictForReservation(@Param("reservationId") Long reservationId,
            @Param("types") java.util.Collection<PaymentReconciliationIssue.IssueType> types);

    @Query("""
            SELECT COUNT(i) FROM PaymentReconciliationIssue i
             WHERE i.status = :status
               AND i.paymentId IN (
                   SELECT p.id FROM Payment p WHERE p.reservation.store.id = :storeId)
            """)
    long countOpenByStoreId(
            @Param("storeId") Long storeId,
            @Param("status") PaymentReconciliationIssue.IssueStatus status);

    @Query("""
            SELECT COUNT(i) FROM PaymentReconciliationIssue i
             WHERE i.status = :status
               AND i.paymentId IN (
                   SELECT p.id FROM Payment p WHERE p.member.id = :memberId)
            """)
    long countOpenByMemberId(
            @Param("memberId") Long memberId,
            @Param("status") PaymentReconciliationIssue.IssueStatus status);
}
