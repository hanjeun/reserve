package kr.it.reserve.member.repository;

import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmailAndDeletedAtIsNull(String email);
    Optional<Member> findByIdAndDeletedAtIsNull(Long id);

    /** 탈퇴와 회원 상태 변경이 서로의 값을 덮어쓰지 않게 하는 공통 쓰기 잠금. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.id = :id AND m.deletedAt IS NULL")
    Optional<Member> findActiveByIdForUpdate(@Param("id") Long id);

    /** 금융 이력의 처리와 탈퇴를 직렬화한다. 탈퇴한 회원의 환불 이력도 잠글 수 있어야 한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.id = :id")
    Optional<Member> findByIdForPaymentUpdate(@Param("id") Long id);

    /** 비밀번호 재설정과 탈퇴를 이메일 기준으로 직렬화한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.email = :email AND m.deletedAt IS NULL")
    Optional<Member> findActiveByEmailForUpdate(@Param("email") String email);

    // 관리자용 — 삭제되지 않은 전체 회원 목록
    Page<Member> findByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

    /** 관리자 검색은 이름·이메일 전체 집합에 적용한다. 선행 와일드카드 검색은 일반 인덱스의 범위 탐색을 기대할 수 없다. */
    @Query("""
            SELECT m FROM Member m
             WHERE m.deletedAt IS NULL
               AND (LOWER(m.name)  LIKE LOWER(CONCAT('%', :keyword, '%'))
                 OR LOWER(m.email) LIKE LOWER(CONCAT('%', :keyword, '%')))
             ORDER BY m.id DESC
            """)
    Page<Member> searchByNameOrEmail(@Param("keyword") String keyword, Pageable pageable);

    // 하위 호환 — 삭제된 계정 포함 (비밀번호 재설정 등 예외 케이스)
    Optional<Member> findByEmail(String email);

    // OAuth2 로그인용: provider와 providerId로 회원 조회
    Optional<Member> findByProviderAndProviderIdAndDeletedAtIsNull(AuthProvider provider, String providerId);

    /** RR의 이전 snapshot도 우회하는 current read. 주체 잠금을 먼저 잡은 호출부만 사용한다. */
    @Query(value = "SELECT member_id FROM member WHERE provider = :provider AND provider_id = :providerId "
            + "AND deleted_at IS NULL ORDER BY member_id FOR UPDATE", nativeQuery = true)
    List<Long> findActiveIdsByProviderAndProviderIdForUpdate(@Param("provider") String provider,
            @Param("providerId") String providerId);

    // 하위 호환
    Optional<Member> findByProviderAndProviderId(AuthProvider provider, String providerId);

}
