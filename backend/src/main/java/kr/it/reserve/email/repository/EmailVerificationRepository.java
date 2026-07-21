package kr.it.reserve.email.repository;

import kr.it.reserve.email.entity.EmailVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    /**
     * 이메일로 가장 최근 인증 정보 조회
     */
    Optional<EmailVerification> findTopByEmailOrderByCreatedAtDesc(String email);

    /**
     * 이메일로 인증 완료된 정보 조회
     */
    Optional<EmailVerification> findByEmailAndVerifiedTrue(String email);

    /**
     * 해당 이메일의 모든 인증 정보 삭제
     */
    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM EmailVerification e WHERE e.email = :email")
    void deleteByEmail(@Param("email") String email);

    /**
     * 만료된 인증 정보 삭제 (스케줄러용)
     */
    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM EmailVerification e WHERE e.expiresAt < :now")
    void deleteExpiredVerifications(@Param("now") LocalDateTime now);
}
