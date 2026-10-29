package kr.it.reserve.payment.repository;

import kr.it.reserve.payment.entity.TestSettlementPayout;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface TestSettlementPayoutRepository extends JpaRepository<TestSettlementPayout, String> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM TestSettlementPayout p WHERE p.paymentId = :id ORDER BY p.requestKey")
    List<TestSettlementPayout> findByPaymentIdForUpdate(@Param("id") Long id);
    interface Total { Long getPaymentId(); Long getAmount(); }
    @Query("SELECT p.paymentId AS paymentId, SUM(p.amount) AS amount FROM TestSettlementPayout p WHERE p.paymentId IN :ids GROUP BY p.paymentId")
    List<Total> totals(@Param("ids") Collection<Long> ids);
    @Query("SELECT COALESCE(SUM(p.amount),0) FROM TestSettlementPayout p WHERE p.paymentId = :id")
    long total(@Param("id") Long id);
}
