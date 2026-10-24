package kr.it.reserve.reservation.admission;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface ReservationRequestRepository extends JpaRepository<ReservationRequest, Long> {
    // Current read: do not establish an old RR snapshot before the store capacity lock.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ReservationRequest> findByMemberIdAndRequestKey(Long memberId, String requestKey);

    /** Read-only result recovery must never acquire the creation transaction's write lock. */
    @Query("SELECT r FROM ReservationRequest r WHERE r.memberId = :memberId AND r.requestKey = :requestKey")
    Optional<ReservationRequest> findCommittedByMemberIdAndRequestKey(@Param("memberId") Long memberId,
                                                                   @Param("requestKey") String requestKey);
}
