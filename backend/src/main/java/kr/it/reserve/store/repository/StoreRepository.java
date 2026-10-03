package kr.it.reserve.store.repository;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.dto.StoreSitemapEntry;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StoreRepository extends JpaRepository<Store, Long>, JpaSpecificationExecutor<Store> {

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

    /** 지역 선택기는 가게 엔티티 대신 현재 공개 가능한 주소만 투영한다. */
    @Query("SELECT s.address FROM Store s WHERE s.deletedAt IS NULL " +
           "AND s.status = kr.it.reserve.store.entity.StoreStatus.ACTIVE " +
           "AND s.address IS NOT NULL AND s.address <> ''")
    List<String> findPublicAddresses();

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

}
