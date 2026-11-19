package kr.it.reserve.reservation.repository;

import kr.it.reserve.reservation.entity.StoreBookingRestriction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;

public interface StoreBookingRestrictionRepository extends JpaRepository<StoreBookingRestriction, Long> {
    Optional<StoreBookingRestriction> findByStoreIdAndMemberId(Long storeId, Long memberId);

    @Query("SELECT r.memberId FROM StoreBookingRestriction r WHERE r.id = :id AND r.storeId = :storeId")
    Optional<Long> findMemberIdForStore(Long id, Long storeId);

    @Modifying
    @Query("DELETE FROM StoreBookingRestriction r WHERE r.endsAt <= :now")
    int deleteExpired(LocalDateTime now);
}
