package com.reserve.store.repository;

import com.reserve.member.entity.Member;
import com.reserve.store.entity.Store;
import com.reserve.store.entity.StoreStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.jpa.repository.Modifying;

import java.util.List;

public interface StoreRepository extends JpaRepository<Store, Long> {

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
