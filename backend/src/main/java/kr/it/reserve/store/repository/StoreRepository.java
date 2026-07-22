package kr.it.reserve.store.repository;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.jpa.repository.Modifying;

import java.util.List;
import java.util.Optional;

public interface StoreRepository extends JpaRepository<Store, Long> {

    /**
     * 예약 정원 체크용 비관적 락 조회.
     * 같은 가게에 대한 동시 예약 요청(check-then-act: 잔여 인원 조회 → 저장)이
     * 순서대로 처리되도록 트랜잭션 종료까지 row를 잠근다.
     * 예약 생성(createReservation)에서만 사용 — 단순 조회에는 findById 그대로 사용.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Store s WHERE s.id = :id")
    Optional<Store> findByIdForUpdate(@Param("id") Long id);

    // 사업자 — 본인 가게 목록 (소프트 삭제된 가게 제외)
    List<Store> findByOwnerAndDeletedAtIsNullOrderByCreatedAtDesc(Member owner);
    List<Store> findByOwnerOrderByCreatedAtDesc(Member owner); // 내부 로직용
    List<Store> findByOwnerId(Long ownerId);

    // 관리자용 — 삭제되지 않은 전체 가게 목록
    Page<Store> findByDeletedAtIsNullOrderByCreatedAtDesc(Pageable pageable);
    List<Store> findByNameContainingIgnoreCase(String keyword);
    List<Store> findByCategory(String category);

    // 공개 가게 목록 — 소프트 삭제 + 제재(정지/영구정지) 가게 제외 (정렬별)
    Page<Store> findByDeletedAtIsNullAndStatusOrderByRatingDesc(StoreStatus status, Pageable pageable);
    Page<Store> findByDeletedAtIsNullAndStatusOrderByReviewCountDesc(StoreStatus status, Pageable pageable);
    Page<Store> findByDeletedAtIsNullAndStatusOrderByCreatedAtDesc(StoreStatus status, Pageable pageable);

    // 거리순 정렬용 — 정렬 없이 전체 가져와 서비스 계층에서 Haversine 계산 후 인메모리 정렬/페이지네이션
    // (가게 수가 적은 현재 규모에서는 문제없음 — native SQL Haversine은 H2(test)/MySQL(prod) 호환성 리스크가 있어 의도적으로 피함)
    List<Store> findByDeletedAtIsNullAndStatus(StoreStatus status);

    @Query("SELECT s FROM Store s WHERE " +
           "LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.description) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.keywords) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    List<Store> searchStores(@Param("keyword") String keyword);

    // ── 페이지네이션 없는 전체 조회 (하위 호환용 — 내부 로직에서만 사용) ──
    List<Store> findAllByOrderByRatingDesc();
    List<Store> findAllByOrderByReviewCountDesc();
    List<Store> findAllByOrderByCreatedAtDesc();

    // ── 페이지네이션 지원 조회 (API 응답용) ──
    Page<Store> findAllByOrderByRatingDesc(Pageable pageable);
    Page<Store> findAllByOrderByReviewCountDesc(Pageable pageable);
    Page<Store> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query(value = "SELECT s FROM Store s WHERE " +
           "LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.description) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.keywords) LIKE LOWER(CONCAT('%', :keyword, '%'))",
           countQuery = "SELECT COUNT(s) FROM Store s WHERE " +
           "LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.description) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')) OR " +
           "LOWER(s.keywords) LIKE LOWER(CONCAT('%', :keyword, '%'))")
    Page<Store> searchStoresPaged(@Param("keyword") String keyword, Pageable pageable);

    @Modifying
    @Query("UPDATE Store s SET s.deletedAt = NULL WHERE s.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM Store s WHERE s.deletedAt IS NOT NULL AND s.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(java.time.LocalDateTime cutoff);
}
