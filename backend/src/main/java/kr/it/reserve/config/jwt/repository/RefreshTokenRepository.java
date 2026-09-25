package kr.it.reserve.config.jwt.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.config.jwt.entity.RefreshToken;
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

    // 사용자의 모든 refresh token 조회
    List<RefreshToken> findByMemberId(Long memberId);

    // 서비스에서 한 줄로 지우기 위해 추가
    void deleteByMemberId(Long memberId);

    // 특정 refresh token 조회
    Optional<RefreshToken> findByRefreshToken(String refreshToken);

    // 리프레쉬 토큰 삭제
    @Transactional
    void deleteByRefreshToken(String refreshToken);

    /*
     * refresh 회전용 조회는 두 단계로 나눈다.
     *   1) id만 읽는다(잠금 없음). refresh_token 컬럼은 TEXT라 인덱스가 없어서, 여기에 FOR UPDATE를 걸면
     *      InnoDB가 훑은 행 전부에 잠금을 건다 — 다른 회원의 refresh까지 줄을 서게 된다.
     *   2) 찾은 id 한 행만 FOR UPDATE로 다시 읽는다. 엔티티를 이 시점에 처음 읽으므로
     *      영속성 컨텍스트에 남아 있던 옛 값이 아니라 잠금 뒤의 최신 값을 본다.
     * 목록으로 받는 이유: jti가 없던 배포 전 토큰은 같은 초에 두 번 발급되면 문자열이 같을 수 있다.
     */
    @Query("SELECT r.id FROM RefreshToken r WHERE r.refreshToken = :token ORDER BY r.id")
    List<Long> findIdsByRefreshToken(@Param("token") String token);

    @Query("SELECT r.id FROM RefreshToken r WHERE r.previousTokenHash = :hash ORDER BY r.id")
    List<Long> findIdsByPreviousTokenHash(@Param("hash") String hash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RefreshToken r WHERE r.id = :id")
    Optional<RefreshToken> findByIdForUpdate(@Param("id") Long id);

    // 만료된 토큰 일괄 삭제 (scheduler)
    @Transactional
    @Modifying
    @Query("DELETE FROM RefreshToken r WHERE r.expiresAt < :now")
    int deleteByExpiresAtBefore(@Param("now") LocalDateTime now);
}
