package kr.it.reserve.waiting.repository;

import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface WaitingEntryRepository extends JpaRepository<WaitingEntry, Long> {
    Optional<WaitingEntry> findByStoreIdAndClientRequestId(Long storeId, String clientRequestId);

    Optional<WaitingEntry> findByIdAndStoreId(Long id, Long storeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM WaitingEntry w WHERE w.id = :id AND w.storeId = :storeId")
    Optional<WaitingEntry> findByIdAndStoreIdForUpdate(@Param("id") Long id, @Param("storeId") Long storeId);

    @Query("SELECT w.storeId FROM WaitingEntry w WHERE w.id = :id AND w.memberId = :memberId")
    Optional<Long> findCustomerStoreId(@Param("id") Long id, @Param("memberId") Long memberId);

    @Query("SELECT w.storeId FROM WaitingEntry w WHERE w.id = :id")
    Optional<Long> findStoreId(@Param("id") Long id);

    boolean existsByStoreIdAndMemberIdAndStatusIn(Long storeId, Long memberId, Set<WaitingStatus> statuses);

    @Query("""
            SELECT w FROM WaitingEntry w WHERE w.memberId = :memberId
              AND (w.status IN :active OR w.finishedAt >= :dayStart)
            ORDER BY w.createdAt DESC, w.id DESC
            """)
    Page<WaitingEntry> findPersonal(@Param("memberId") Long memberId, @Param("active") Set<WaitingStatus> active,
                                    @Param("dayStart") LocalDateTime dayStart, Pageable pageable);

    // 필터와 total은 동일한 본인·표시기간 경계를 먼저 적용한다. 가게가 없어도 기존 내역은 유지한다.
    @Query(value = """
            SELECT w.* FROM waiting_entry w LEFT JOIN store s ON s.store_id = w.store_id
             WHERE w.member_id = :memberId
               AND (w.status IN (:active) OR w.finished_at >= :dayStart)
               AND (:status = 'ALL' OR w.status = :status)
               AND (:keyword = '' OR LOWER(COALESCE(s.store_name, '가게')) LIKE :keyword ESCAPE '!'
                    OR CONCAT('', w.entry_number) LIKE :keyword ESCAPE '!')
             ORDER BY CASE WHEN :sort = 'oldest' THEN w.created_at END ASC,
                      CASE WHEN :sort = 'oldest' THEN w.waiting_entry_id END ASC,
                      CASE WHEN :sort = 'recent' THEN w.created_at END DESC,
                      CASE WHEN :sort = 'recent' THEN w.waiting_entry_id END DESC
            """, countQuery = """
            SELECT COUNT(*) FROM waiting_entry w LEFT JOIN store s ON s.store_id = w.store_id
             WHERE w.member_id = :memberId
               AND (w.status IN (:active) OR w.finished_at >= :dayStart)
               AND (:status = 'ALL' OR w.status = :status)
               AND (:keyword = '' OR LOWER(COALESCE(s.store_name, '가게')) LIKE :keyword ESCAPE '!'
                    OR CONCAT('', w.entry_number) LIKE :keyword ESCAPE '!')
            """, nativeQuery = true)
    Page<WaitingEntry> findPersonalFiltered(@Param("memberId") Long memberId, @Param("active") Set<String> active,
                                          @Param("dayStart") LocalDateTime dayStart, @Param("status") String status,
                                          @Param("keyword") String keyword, @Param("sort") String sort, Pageable pageable);

    @Query("""
            SELECT COUNT(w) FROM WaitingEntry w WHERE w.storeId = :storeId AND w.status IN :active
              AND (w.businessDate < :date OR (w.businessDate = :date AND w.entryNumber < :number))
            """)
    long teamsAhead(@Param("storeId") Long storeId, @Param("active") Set<WaitingStatus> active,
                    @Param("date") LocalDate date, @Param("number") int number);

    @Query("SELECT DISTINCT w.memberId FROM WaitingEntry w WHERE w.storeId = :storeId AND w.status IN :active AND w.memberId IS NOT NULL")
    Set<Long> activeMemberIds(@Param("storeId") Long storeId, @Param("active") Set<WaitingStatus> active);

    // 탈퇴 요청과 같은 트랜잭션에서 연결·표시명을 지운다. 진행 접수만 취소하고 종료 이력은 유지한다.
    @Modifying(flushAutomatically = true)
    @Query("""
            UPDATE WaitingEntry w SET w.displayName = NULL, w.memberId = NULL,
              w.finishedAt = CASE WHEN w.status IN :active THEN :now ELSE w.finishedAt END,
              w.updatedAt = :now,
              w.status = CASE WHEN w.status IN :active THEN :cancelled ELSE w.status END
            WHERE w.memberId = :memberId
            """)
    int anonymizeMember(@Param("memberId") Long memberId, @Param("active") Set<WaitingStatus> active,
                        @Param("cancelled") WaitingStatus cancelled, @Param("now") LocalDateTime now);

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
               SET status = :cancelled, display_name = NULL, member_id = NULL, finished_at = :now, updated_at = :now
             WHERE w.status IN (:active)
               AND (w.source = 'STAFF' OR (:includeCustomers = true AND w.privacy_notice_published_at IS NOT NULL))
               AND NOT EXISTS (SELECT 1 FROM store s WHERE s.store_id = w.store_id AND s.deleted_at IS NULL)
            """, nativeQuery = true)
    int cancelForDeletedStores(@Param("active") Set<String> active, @Param("cancelled") String cancelled,
                               @Param("now") LocalDateTime now, @Param("includeCustomers") boolean includeCustomers);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE WaitingEntry w SET w.displayName = NULL, w.memberId = NULL WHERE w.status IN :terminal AND w.finishedAt < :dayStart AND (w.source = kr.it.reserve.waiting.entity.WaitingSource.STAFF OR (:includeCustomers = true AND w.privacyNoticePublishedAt IS NOT NULL)) AND (w.displayName IS NOT NULL OR w.memberId IS NOT NULL)")
    int clearFinishedNames(@Param("terminal") Set<WaitingStatus> terminal, @Param("dayStart") LocalDateTime dayStart, @Param("includeCustomers") boolean includeCustomers);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM WaitingEntry w WHERE w.status IN :terminal AND w.finishedAt < :cutoff AND (w.source = kr.it.reserve.waiting.entity.WaitingSource.STAFF OR (:includeCustomers = true AND w.privacyNoticePublishedAt IS NOT NULL))")
    int deleteFinishedBefore(@Param("terminal") Set<WaitingStatus> terminal, @Param("cutoff") LocalDateTime cutoff, @Param("includeCustomers") boolean includeCustomers);
}
