package kr.it.reserve.reservation.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.reservation.entity.ReservationNoShowRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface ReservationNoShowRecordRepository extends JpaRepository<ReservationNoShowRecord, Long> {
    List<ReservationNoShowRecord> findByReservationIdIn(List<Long> reservationIds);

    String OWNER_MEMBER_ACTIVITY = """
            WITH owned_stores AS (
                SELECT store_id, store_name FROM store
                WHERE owner_id = :ownerId AND deleted_at IS NULL AND (:storeId IS NULL OR store_id = :storeId)
            ), events AS (
                SELECT n.store_id, n.member_id, CAST(n.confirmed_at AS DATE) AS event_date, n.confirmed_at
                FROM reservation_no_show_record n JOIN owned_stores s ON s.store_id = n.store_id
                WHERE n.corrected_at IS NULL AND n.confirmed_at BETWEEN :fromTime AND :now
                UNION ALL
                SELECT r.store_id, r.member_id, r.reservation_date, NULL
                FROM reservation r JOIN owned_stores s ON s.store_id = r.store_id
                WHERE r.status = 'NO_SHOW' AND r.deleted_at IS NULL
                  AND r.reservation_date BETWEEN :fromDate AND :today
                  AND NOT EXISTS (SELECT 1 FROM reservation_no_show_record n WHERE n.reservation_id = r.reservation_id)
            ), activity AS (
                SELECT store_id, member_id, COUNT(*) AS retained_count,
                       COUNT(CASE WHEN confirmed_at >= :recentFrom THEN 1 END) AS recent_count,
                       MAX(event_date) AS latest_no_show_date, MAX(confirmed_at) AS latest_confirmed_at
                FROM events GROUP BY store_id, member_id
            ), candidates AS (
                SELECT store_id, member_id FROM activity
                UNION
                SELECT b.store_id, b.member_id FROM store_booking_restriction b JOIN owned_stores s ON s.store_id = b.store_id
                WHERE b.ends_at > :now
            ), visible_members AS (
                SELECT r.store_id, r.member_id, MAX(CASE WHEN r.status = 'NO_SHOW' AND r.reservation_date <= :today
                       AND NOT EXISTS (SELECT 1 FROM reservation_no_show_record n WHERE n.reservation_id = r.reservation_id AND n.corrected_at IS NOT NULL)
                       THEN 1 ELSE 0 END) AS restrictable
                FROM reservation r JOIN candidates c ON c.store_id = r.store_id AND c.member_id = r.member_id
                WHERE r.deleted_at IS NULL
                  AND (r.usage_ends_at > :visibilityCutoff OR r.usage_ends_at IS NULL AND r.reservation_date > :legacyVisibilityCutoff)
                GROUP BY r.store_id, r.member_id
            )
            """;
    String OWNER_MEMBER_FILTER = """
            FROM candidates c JOIN member m ON m.member_id = c.member_id AND m.deleted_at IS NULL
            JOIN owned_stores s ON s.store_id = c.store_id
            LEFT JOIN activity a ON a.store_id = c.store_id AND a.member_id = c.member_id
            LEFT JOIN visible_members v ON v.store_id = c.store_id AND v.member_id = c.member_id
            LEFT JOIN store_booking_restriction b ON b.store_id = c.store_id AND b.member_id = c.member_id AND b.ends_at > :now
            WHERE (v.member_id IS NOT NULL OR b.id IS NOT NULL)
              AND (:keyword = '' OR (v.member_id IS NOT NULL AND (m.member_id = :memberNumber
                    OR LOWER(m.member_name) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!')))
              AND (:filter = 'all' OR (:filter = 'restricted' AND b.id IS NOT NULL) OR (:filter = 'available' AND b.id IS NULL))
            """;

    interface OwnerNoShowMember {
        Long getStoreId();
        String getStoreName();
        Long getScopedMemberId();
        Long getMemberId();
        String getName();
        Long getRetainedCount();
        Long getRecentCount();
        LocalDate getLatestNoShowDate();
        LocalDateTime getLatestConfirmedAt();
        LocalDateTime getManualUntil();
        Long getRestrictionId();
        Integer getRestrictable();
        String getReason();
    }

    @Query(value = OWNER_MEMBER_ACTIVITY + """
            SELECT c.store_id AS storeId, s.store_name AS storeName, c.member_id AS scopedMemberId, v.member_id AS memberId,
                   CASE WHEN v.member_id IS NOT NULL THEN m.member_name END AS name,
                   COALESCE(a.retained_count, 0) AS retainedCount, COALESCE(a.recent_count, 0) AS recentCount,
                   a.latest_no_show_date AS latestNoShowDate, a.latest_confirmed_at AS latestConfirmedAt,
                   b.ends_at AS manualUntil, b.id AS restrictionId, COALESCE(v.restrictable, 0) AS restrictable,
                   CASE WHEN v.member_id IS NOT NULL THEN b.reason END AS reason
            """ + OWNER_MEMBER_FILTER + """
            ORDER BY CASE WHEN :sortByCount = TRUE THEN a.retained_count ELSE 0 END DESC,
                     a.latest_no_show_date DESC, a.latest_confirmed_at DESC, c.member_id DESC, c.store_id DESC
            """, countQuery = OWNER_MEMBER_ACTIVITY + "SELECT COUNT(*) " + OWNER_MEMBER_FILTER, nativeQuery = true)
    Page<OwnerNoShowMember> findOwnerNoShowMembers(Long ownerId, Long storeId, String keyword, Long memberNumber, String filter,
            boolean sortByCount, LocalDateTime fromTime, LocalDateTime now, LocalDate fromDate, LocalDate today,
            LocalDateTime recentFrom, LocalDateTime visibilityCutoff, LocalDate legacyVisibilityCutoff, Pageable pageable);

    @Query("""
            SELECT r FROM ReservationNoShowRecord r
            WHERE r.storeId IN :storeIds AND r.memberId IN :memberIds AND r.correctedAt IS NULL
              AND r.confirmedAt BETWEEN :from AND :to
            ORDER BY r.confirmedAt DESC
            """)
    List<ReservationNoShowRecord> findActiveForMembers(List<Long> storeIds, List<Long> memberIds, LocalDateTime from, LocalDateTime to);

    @Query("""
            SELECT COUNT(r) > 0 FROM Reservation r
            WHERE r.store.id = :storeId AND r.member.id = :memberId AND r.status = 'NO_SHOW'
              AND r.deletedAt IS NULL AND r.reservationDate <= :today
              AND (r.usageEndsAt > :visibilityCutoff OR r.usageEndsAt IS NULL AND r.reservationDate > :legacyVisibilityCutoff)
              AND NOT EXISTS (SELECT 1 FROM ReservationNoShowRecord n WHERE n.reservationId = r.id AND n.correctedAt IS NOT NULL)
            """)
    boolean hasRestrictableNoShow(Long storeId, Long memberId, LocalDate today,
            LocalDateTime visibilityCutoff, LocalDate legacyVisibilityCutoff);

    @Query("""
            SELECT r.confirmedAt FROM ReservationNoShowRecord r
            WHERE r.memberId = :memberId AND r.storeId = :storeId AND r.correctedAt IS NULL
              AND r.confirmedAt BETWEEN :from AND :to
            ORDER BY r.confirmedAt DESC
            """)
    List<LocalDateTime> findConfirmations(@Param("memberId") Long memberId, @Param("storeId") Long storeId,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("""
            SELECT r.reservationId FROM ReservationNoShowRecord r
            WHERE r.reservationId IN :ids AND r.correctedAt IS NULL AND r.confirmedAt >= :from
            """)
    Set<Long> findCorrectableIds(@Param("ids") List<Long> ids, @Param("from") LocalDateTime from);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ReservationNoShowRecord r WHERE r.reservationId = :reservationId")
    Optional<ReservationNoShowRecord> findByReservationIdForUpdate(@Param("reservationId") Long reservationId);

    @Modifying
    @Query("DELETE FROM ReservationNoShowRecord r WHERE r.confirmedAt < :before")
    int deleteBefore(@Param("before") LocalDateTime before);
}
