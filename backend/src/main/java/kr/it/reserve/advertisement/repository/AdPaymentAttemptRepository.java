package kr.it.reserve.advertisement.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.advertisement.entity.AdPaymentAttempt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AdPaymentAttemptRepository extends JpaRepository<AdPaymentAttempt, Long> {
    Optional<AdPaymentAttempt> findByMerchantUid(String merchantUid);
    @Query("SELECT p.adId FROM AdPaymentAttempt p WHERE p.merchantUid = :uid")
    Optional<Long> findAdId(@Param("uid") String uid);
    @Query("SELECT p.adId FROM AdPaymentAttempt p WHERE p.id = :id")
    Optional<Long> findAdIdByAttemptId(@Param("id") Long id);
    List<AdPaymentAttempt> findByAdIdOrderByIdAsc(Long adId);
    boolean existsByAdId(Long adId);
    long countByStoreIdAndStateIn(Long storeId, Collection<AdPaymentAttempt.State> states);
    long countByOwnerIdAndStateIn(Long ownerId, Collection<AdPaymentAttempt.State> states);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM AdPaymentAttempt p WHERE p.merchantUid = :uid")
    Optional<AdPaymentAttempt> findForUpdate(@Param("uid") String uid);

    @Query("SELECT p.merchantUid FROM AdPaymentAttempt p WHERE p.nextCheckAt <= :now "
            + "AND (p.leaseUntil IS NULL OR p.leaseUntil <= :now) ORDER BY p.nextCheckAt, p.id")
    List<String> findDue(@Param("now") LocalDateTime now, Pageable pageable);

    @Query("SELECT p FROM AdPaymentAttempt p WHERE :openOnly = false OR p.issueCode IS NOT NULL "
            + "ORDER BY p.createdAt DESC, p.id DESC")
    Page<AdPaymentAttempt> findOperations(@Param("openOnly") boolean openOnly, Pageable pageable);
}
