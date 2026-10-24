package kr.it.reserve.member.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.member.entity.LoginMethodChallenge;
import kr.it.reserve.member.entity.LoginMethodChallenge.Purpose;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface LoginMethodChallengeRepository extends JpaRepository<LoginMethodChallenge, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from LoginMethodChallenge c where c.id = :id")
    Optional<LoginMethodChallenge> findForUpdate(@Param("id") String id);
    Optional<LoginMethodChallenge> findByMemberIdAndPurpose(Long memberId, Purpose purpose);
    void deleteByMemberId(Long memberId);
    long deleteByExpiresAtBefore(LocalDateTime now);
}
