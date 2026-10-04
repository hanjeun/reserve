package kr.it.reserve.waiting.repository;

import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface WaitingEntryRepository extends JpaRepository<WaitingEntry, Long> {
    Optional<WaitingEntry> findByStoreIdAndClientRequestId(Long storeId, String clientRequestId);

    Optional<WaitingEntry> findByIdAndStoreId(Long id, Long storeId);

    @Query("SELECT COALESCE(MAX(w.entryNumber), 0) FROM WaitingEntry w WHERE w.storeId = :storeId AND w.businessDate = :date")
    int lastEntryNumber(@Param("storeId") Long storeId, @Param("date") LocalDate date);

    @Query("""
            SELECT w FROM WaitingEntry w
             WHERE w.storeId = :storeId
               AND (w.status IN :active OR (w.status IN :terminal AND w.finishedAt >= :dayStart AND w.finishedAt < :dayEnd))
             ORDER BY w.businessDate ASC, w.entryNumber ASC
            """)
    List<WaitingEntry> findBoard(@Param("storeId") Long storeId,
                                @Param("active") Set<WaitingStatus> active,
                                @Param("terminal") Set<WaitingStatus> terminal,
                                @Param("dayStart") LocalDateTime dayStart,
                                @Param("dayEnd") LocalDateTime dayEnd);

    // Store의 역참조/FK 없이 폐업·영구 삭제 경계를 처리한다. 이미 입장/취소된 상태는 덮어쓰지 않는다.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE waiting_entry w
               SET status = :cancelled, display_name = NULL, finished_at = :now, updated_at = :now
             WHERE w.status IN (:active)
               AND NOT EXISTS (SELECT 1 FROM store s WHERE s.store_id = w.store_id AND s.deleted_at IS NULL)
            """, nativeQuery = true)
    int cancelForDeletedStores(@Param("active") Set<String> active, @Param("cancelled") String cancelled,
                               @Param("now") LocalDateTime now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE WaitingEntry w SET w.displayName = NULL WHERE w.status IN :terminal AND w.finishedAt < :dayStart AND w.displayName IS NOT NULL")
    int clearFinishedNames(@Param("terminal") Set<WaitingStatus> terminal, @Param("dayStart") LocalDateTime dayStart);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM WaitingEntry w WHERE w.status IN :terminal AND w.finishedAt < :cutoff")
    int deleteFinishedBefore(@Param("terminal") Set<WaitingStatus> terminal, @Param("cutoff") LocalDateTime cutoff);
}
