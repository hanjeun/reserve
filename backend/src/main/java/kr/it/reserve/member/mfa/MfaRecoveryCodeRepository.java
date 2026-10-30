package kr.it.reserve.member.mfa;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MfaRecoveryCodeRepository extends JpaRepository<MfaRecoveryCode, String> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select code from MfaRecoveryCode code where code.digest = :hash and code.memberId = :memberId")
    java.util.Optional<MfaRecoveryCode> findLocked(@org.springframework.data.repository.query.Param("hash") String hash,
            @org.springframework.data.repository.query.Param("memberId") Long memberId);
    long countByMemberId(Long memberId);
    void deleteByMemberId(Long memberId);
}
