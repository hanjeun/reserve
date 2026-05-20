package com.reserve.config.jwt.repository;

import com.reserve.config.jwt.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

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

    // 만료된 토큰 일괄 삭제 (scheduler)
    @Transactional
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("DELETE FROM RefreshToken r WHERE r.expiresAt < :now")
    int deleteByExpiresAtBefore(@org.springframework.data.repository.query.Param("now") java.time.LocalDateTime now);
}
