package kr.it.reserve.member.mfa;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import java.time.LocalDateTime;
import java.util.Optional;

public interface MfaChallengeRepository extends JpaRepository<MfaChallenge, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from MfaChallenge c where c.id = :id")
    Optional<MfaChallenge> findLocked(String id);
    java.util.List<MfaChallenge> findTop200ByExpiresAtBefore(LocalDateTime now);
    void deleteByMemberId(Long memberId);
}
