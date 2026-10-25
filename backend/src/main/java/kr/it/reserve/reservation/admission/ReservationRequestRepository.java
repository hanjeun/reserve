package kr.it.reserve.reservation.admission;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface ReservationRequestRepository extends JpaRepository<ReservationRequest, Long> {
    // 정원 잠금 전에 이전 읽기 스냅샷을 만들지 않도록 현재 상태를 잠금 조회한다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ReservationRequest> findByMemberIdAndRequestKey(Long memberId, String requestKey);

    /** 결과 복구는 생성 트랜잭션의 쓰기 잠금을 획득하지 않는다. */
    @Query("SELECT r FROM ReservationRequest r WHERE r.memberId = :memberId AND r.requestKey = :requestKey")
    Optional<ReservationRequest> findCommittedByMemberIdAndRequestKey(@Param("memberId") Long memberId,
                                                                   @Param("requestKey") String requestKey);
}
