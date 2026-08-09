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

    /**
     * 가게 검색 — MySQL FULLTEXT(ngram) 경로.
     *
     * <h2>왜 필요한가</h2>
     * 위의 {@code searchStoresPaged}는 5개 컬럼에 {@code LOWER(col) LIKE '%kw%'}를 쓴다.
     * <b>앞에 와일드카드가 붙고 컬럼에 함수가 걸려 인덱스를 하나도 타지 못한다</b> —
     * 검색 한 번마다 store 테이블 풀스캔이다. 이 클래스에 걸어둔 @Index들도 이 쿼리엔 쓰이지 않는다.
     * 커넥션 풀 고갈은 대개 "풀이 작아서"가 아니라 이런 느린 쿼리가 커넥션을 오래 붙잡기 때문에 생긴다.
     *
     * <h2>선행 조건 — 수동 DDL이 반드시 필요하다</h2>
     * {@code ddl-auto: update}는 <b>FULLTEXT 인덱스를 만들지 못한다.</b>
     * {@code docs/technical/manual-ddl.md}의 DDL을 먼저 적용해야 이 쿼리가 동작한다.
     * 인덱스가 없으면 MySQL이 {@code Can't find FULLTEXT index matching the column list} 에러를 낸다.
     * ★ {@code MATCH()}의 컬럼 목록은 인덱스 정의와 <b>순서까지 정확히 일치</b>해야 한다.
     *
     * <h2>왜 H2(테스트)에서 쓰면 안 되는가</h2>
     * {@code MATCH ... AGAINST}는 MySQL 전용 문법이고 H2에는 없다. 테스트는 H2({@code create-drop})로 돌고
     * CI가 테스트를 실행하므로, 이 쿼리를 무조건 타게 만들면 CI가 깨진다.
     * 그래서 {@code search.store.fulltext-enabled} 플래그로 갈라 prod에서만 쓰고 그 외에는 LIKE로 폴백한다.
     * (같은 이유로 거리순 Haversine도 네이티브 SQL을 쓰지 않고 인메모리 계산을 택했다 — 위 주석 참고)
     * 네이티브 쿼리는 부팅 시 Hibernate가 파싱하지 않으므로, <b>존재만으로는 H2 컨텍스트를 깨뜨리지 않는다.</b>
     *
     * <h2>ngram 주의</h2>
     * 한글은 {@code ngram} 파서를 쓴다. {@code ngram_token_size}(기본 2)보다 짧은 검색어는 매칭되지 않으므로
     * <b>1글자 검색은 호출측에서 LIKE로 보내야 한다</b>(서비스에서 처리).
     * 또 BOOLEAN MODE는 더하기·빼기·부등호·괄호·물결·별표·큰따옴표·골뱅이를 연산자로 해석하므로
     * 입력을 정제해야 한다(서비스의 {@code toBooleanModeQuery}에서 처리).
     */
    @Query(value = "SELECT * FROM store "
                 + "WHERE MATCH(store_name, description, address, category, keywords) "
                 + "AGAINST(:keyword IN BOOLEAN MODE)",
           countQuery = "SELECT COUNT(*) FROM store "
                      + "WHERE MATCH(store_name, description, address, category, keywords) "
                      + "AGAINST(:keyword IN BOOLEAN MODE)",
           nativeQuery = true)
    Page<Store> searchStoresFulltextPaged(@Param("keyword") String keyword, Pageable pageable);

    @Modifying
    @Query("UPDATE Store s SET s.deletedAt = NULL WHERE s.id = :id")
    void restoreById(Long id);

    @Modifying
    @Query("DELETE FROM Store s WHERE s.deletedAt IS NOT NULL AND s.deletedAt < :cutoff")
    int hardDeleteByDeletedAtBefore(java.time.LocalDateTime cutoff);
}
