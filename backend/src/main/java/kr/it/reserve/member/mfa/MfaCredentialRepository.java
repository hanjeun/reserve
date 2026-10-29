package kr.it.reserve.member.mfa;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import java.util.List;
import java.util.Optional;

public interface MfaCredentialRepository extends JpaRepository<MfaCredential, String> {
    List<MfaCredential> findByMemberIdOrderByCreatedAtAsc(Long memberId);
    Optional<MfaCredential> findBySlotKey(String slotKey);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT c FROM MfaCredential c WHERE c.slotKey = :slot")
    Optional<MfaCredential> findLockedSlot(@org.springframework.data.repository.query.Param("slot") String slot);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<MfaCredential> findByIdAndMemberId(String id, Long memberId);
    boolean existsByMemberIdAndKind(Long memberId, MfaCredential.Kind kind);
    void deleteByMemberId(Long memberId);
}
