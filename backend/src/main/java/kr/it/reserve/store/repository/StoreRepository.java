package kr.it.reserve.store.repository;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.dto.StoreSitemapEntry;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StoreRepository extends JpaRepository<Store, Long> {

    /**
     * 예약 생성·수정·광고 신청·가게 영업 종료의 공통 비관적 락 조회.
     * 같은 가게에 대한 운영 변경과 영업 종료가 순서대로 처리되도록 트랜잭션 종료까지 row를 잠근다.
     * 단순 조회에는 findById 그대로 사용한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Store s WHERE s.id = :id")
    Optional<Store> findByIdForUpdate(@Param("id") Long id);

    // 사업자 — 본인 가게 목록 (소프트 삭제된 가게 제외)
    List<Store> findByOwnerAndDeletedAtIsNullOrderByCreatedAtDesc(Member owner);
    List<Store> findByOwnerOrderByCreatedAtDesc(Member owner); // 내부 로직용
    List<Store> findByOwnerId(Long ownerId);
    long countByOwnerIdAndDeletedAtIsNull(Long ownerId);

    // 관리자용 — 삭제되지 않은 전체 가게 목록
    Page<Store> findByDeletedAtIsNullOrderByCreatedAtDesc(Pageable pageable);

    /** 관리자 목록용 이름·주소·카테고리 검색. 공개 검색과 달리 제재된 가게도 포함한다. */
    @Query(value = """
            SELECT s FROM Store s
              LEFT JOIN FETCH s.owner
             WHERE s.deletedAt IS NULL
               AND (:keyword = ''
                    OR LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%'))
                    OR LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%'))
                    OR LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')))
             ORDER BY s.createdAt DESC, s.id DESC
            """,
            countQuery = """
            SELECT COUNT(s) FROM Store s
             WHERE s.deletedAt IS NULL
               AND (:keyword = ''
                    OR LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%'))
                    OR LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%'))
                    OR LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')))
            """)
    Page<Store> searchForAdmin(@Param("keyword") String keyword, Pageable pageable);
    List<Store> findByNameContainingIgnoreCase(String keyword);
    List<Store> findByCategory(String category);

    // 공개 가게 목록 — 소프트 삭제 + 제재(정지/영구정지) 가게 제외 (정렬별)
    Page<Store> findByDeletedAtIsNullAndStatusOrderByRatingDesc(StoreStatus status, Pageable pageable);
    Page<Store> findByDeletedAtIsNullAndStatusOrderByReviewCountDesc(StoreStatus status, Pageable pageable);
    Page<Store> findByDeletedAtIsNullAndStatusOrderByCreatedAtDesc(StoreStatus status, Pageable pageable);

    // 거리순 정렬용 — 정렬 없이 전체 가져와 서비스 계층에서 Haversine 계산 후 인메모리 정렬/페이지네이션
    // 네이티브 Haversine을 쓰지 않는 현재 계약이다. 전체 집합 비용은 데이터 증가 시 별도 측정한다.
    List<Store> findByDeletedAtIsNullAndStatus(StoreStatus status);
    Page<Store> findByDeletedAtIsNullAndStatus(StoreStatus status, Pageable pageable);

    /**
     * 공개 sitemap 전용 최소 투영. 목록과 같은 공개 정책(ACTIVE + 미삭제)을 사용한다.
     * 개인정보와 이미지 필드를 엔티티째 읽지 않도록 id와 수정 시각만 가져온다.
     */
    @Query("""
            SELECT new kr.it.reserve.store.dto.StoreSitemapEntry(s.id, s.updatedAt, s.createdAt)
              FROM Store s
             WHERE s.deletedAt IS NULL
               AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
            """)
    List<StoreSitemapEntry> findPublicSitemapEntries(Pageable pageable);

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

    /** 공개 정책과 검색 조건을 count/content에서 똑같이 적용한다. 정렬은 Pageable의 허용 필드만 쓴다. */
    @Query(value = """
            SELECT s FROM Store s WHERE s.deletedAt IS NULL AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
              AND (LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.description) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.keywords) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!')
            """,
            countQuery = """
            SELECT COUNT(s) FROM Store s WHERE s.deletedAt IS NULL AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE
              AND (LOWER(s.name) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.description) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.address) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.category) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!'
                OR LOWER(s.keywords) LIKE LOWER(CONCAT('%', :keyword, '%')) ESCAPE '!')
            """)
    Page<Store> searchStoresPaged(@Param("keyword") String keyword, Pageable pageable);

    /**
     * MySQL FULLTEXT(ngram) 전용. MATCH 대상 인덱스를 먼저 적용한 뒤 기능 플래그를 켠다.
     * 허용 정렬은 서비스가 고르고 DB에서 전체 정렬 후 페이지를 제한한다.
     * 짧은 토큰/연산자 정제와 H2 폴백, 실제 MySQL 검증 절차는 docs/technical/manual-ddl.md를 따른다.
     */
    @Query(value = """
            SELECT * FROM store WHERE deleted_at IS NULL AND status = 'ACTIVE'
              AND MATCH(store_name, description, address, category, keywords) AGAINST(:keyword IN BOOLEAN MODE)
            ORDER BY CASE WHEN :sort = 'recent' THEN created_at END DESC,
                     CASE WHEN :sort = 'reviews' THEN review_count END DESC,
                     CASE WHEN :sort = 'rating' THEN rating END DESC,
                     store_id DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM store WHERE deleted_at IS NULL AND status = 'ACTIVE'
              AND MATCH(store_name, description, address, category, keywords) AGAINST(:keyword IN BOOLEAN MODE)
            """, nativeQuery = true)
    Page<Store> searchStoresFulltextPaged(@Param("keyword") String keyword, @Param("sort") String sort, Pageable pageable);

}
