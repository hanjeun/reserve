package kr.it.reserve.config.oauth2.subject;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface OAuthSubjectSecurityRepository extends JpaRepository<OAuthSubjectSecurity, String> {
    /** MySQL의 누락 행 경합도 같은 트랜잭션에서 직렬화한다. 다른 입력 오류는 무시하지 않는다. */
    @Modifying
    @Query(value = """
            INSERT INTO oauth_subject_security
                (subject_key, provider, last_authenticated_at, revoked_at, updated_at)
            VALUES (:key, :provider, NULL, NULL, :now)
            ON DUPLICATE KEY UPDATE subject_key = subject_key
            """, nativeQuery = true)
    void createIfAbsent(@Param("key") String subjectKey, @Param("provider") String provider,
            @Param("now") LocalDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT subject FROM OAuthSubjectSecurity subject WHERE subject.subjectKey = :key")
    Optional<OAuthSubjectSecurity> findByKeyForUpdate(@Param("key") String subjectKey);
}
