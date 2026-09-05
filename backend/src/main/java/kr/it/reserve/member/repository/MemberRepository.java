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

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmailAndDeletedAtIsNull(String email);
    Optional<Member> findByIdAndDeletedAtIsNull(Long id);

    /** 탈퇴와 회원 상태 변경이 서로의 값을 덮어쓰지 않게 하는 공통 쓰기 잠금. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.id = :id AND m.deletedAt IS NULL")
    Optional<Member> findActiveByIdForUpdate(@Param("id") Long id);

    /** 비밀번호 재설정과 탈퇴를 이메일 기준으로 직렬화한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.email = :email AND m.deletedAt IS NULL")
    Optional<Member> findActiveByEmailForUpdate(@Param("email") String email);

    // 관리자용 — 삭제되지 않은 전체 회원 목록
    Page<Member> findByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

    /**
     * 관리자용 — 이름·이메일 키워드 검색(서버 사이드).
     *
     * <p>예전에는 프론트가 {@code size=100} 으로 받아온 배열을 {@code Array.filter} 했다.
     * 그러면 <b>101번째 회원부터는 검색은커녕 조회 자체가 되지 않는다</b>.
     * 검색을 서버로 올려야 전체 집합을 대상으로 필터된다.
     *
     * <p>{@code m.name} 은 null 일 수 있다. SQL 에서 null 과의 비교는 true 가 아니므로
     * 이름이 없는 회원은 자연스럽게 이메일 쪽 조건으로만 매칭된다.
     *
     * <p>⚠️ 앞에 와일드카드가 붙은 LIKE 라 인덱스를 타지 못한다(member 풀스캔).
     * 가게 검색과 같은 한계지만, 관리자 화면은 호출 빈도가 낮고 로그인한 ADMIN 만 쓰므로
     * 가게 검색(FULLTEXT)처럼 따로 최적화하지 않았다. 회원이 수십만 명이 되면 그때 재검토한다.
     */
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

    // 하위 호환
    Optional<Member> findByProviderAndProviderId(AuthProvider provider, String providerId);

}
