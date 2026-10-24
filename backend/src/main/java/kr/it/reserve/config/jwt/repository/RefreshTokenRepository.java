package kr.it.reserve.config.jwt.repository;

import kr.it.reserve.config.jwt.entity.RefreshToken;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    List<RefreshToken> findByMemberId(Long memberId);

    /** Always lock the member first. A locking read also avoids an older MySQL RR snapshot. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RefreshToken r WHERE r.memberId = :memberId ORDER BY r.createdAt, r.id")
    List<RefreshToken> findByMemberIdForUpdate(@Param("memberId") Long memberId);

    void deleteByMemberId(Long memberId);
    Optional<RefreshToken> findBySessionIdAndMemberId(String sessionId, Long memberId);

    /** Access authentication only. Issuance, rotation and revocation retain their member -> session locks. */
    @Query("SELECT new kr.it.reserve.config.jwt.repository.LoginSessionAuthentication(m, r) "
            + "FROM RefreshToken r JOIN Member m ON m.id = r.memberId "
            + "WHERE r.sessionId = :sid AND r.memberId = :memberId AND m.deletedAt IS NULL")
    Optional<LoginSessionAuthentication> findAuthenticationBySessionIdAndMemberId(
            @Param("sid") String sessionId, @Param("memberId") Long memberId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RefreshToken r WHERE r.sessionId = :sid AND r.memberId = :memberId")
    Optional<RefreshToken> findBySessionIdForUpdate(@Param("sid") String sessionId, @Param("memberId") Long memberId);

    Optional<RefreshToken> findByRefreshTokenHash(String hash);

    /** Compatibility lookup: the supplied bearer is hashed before any database query. */
    default Optional<RefreshToken> findByRefreshToken(String token) {
        return findByRefreshTokenHash(RefreshToken.hash(token));
    }
    default List<Long> findIdsByRefreshToken(String token) {
        return findIdsByRefreshTokenHash(RefreshToken.hash(token));
    }
    @Query("SELECT r.id FROM RefreshToken r WHERE r.refreshTokenHash = :hash ORDER BY r.id")
    List<Long> findIdsByRefreshTokenHash(@Param("hash") String hash);
    @Query("SELECT r.id FROM RefreshToken r WHERE r.previousTokenHash = :hash ORDER BY r.id")
    List<Long> findIdsByPreviousTokenHash(@Param("hash") String hash);

    @Transactional
    default void deleteByRefreshToken(String token) { deleteAllById(findIdsByRefreshToken(token)); }

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RefreshToken r WHERE r.id = :id")
    Optional<RefreshToken> findByIdForUpdate(@Param("id") Long id);

    @Transactional @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.expiresAt <= :now OR r.absoluteExpiresAt <= :now")
    int deleteByExpiresAtBefore(@Param("now") LocalDateTime now);
}
