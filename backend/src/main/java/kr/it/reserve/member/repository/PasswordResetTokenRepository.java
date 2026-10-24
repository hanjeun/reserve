package kr.it.reserve.member.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.member.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findTopByEmailOrderByIdDesc(String email);

    // email 검색에서 여러 행을 잠그지 않고, 최신 토큰 ID 한 행만 현재 값으로 읽는다.
    @Query("SELECT t.id FROM PasswordResetToken t WHERE t.email = :email ORDER BY t.id DESC")
    List<Long> findIdsByEmail(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM PasswordResetToken t WHERE t.id = :id")
    Optional<PasswordResetToken> findByIdForUpdate(@Param("id") Long id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM PasswordResetToken t WHERE t.email = :email")
    void deleteByEmail(@Param("email") String email);

    /** 로그인 수단 변경은 같은 트랜잭션의 회원·인증 요청 변경을 계속 추적해야 한다. */
    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM PasswordResetToken t WHERE t.email = :email")
    void invalidateForEmail(@Param("email") String email);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM PasswordResetToken t WHERE t.expiresAt < :now")
    int deleteExpired(@Param("now") LocalDateTime now);
}
