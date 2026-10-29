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
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true)
    @org.springframework.data.jpa.repository.Query("""
            UPDATE MfaCredential c SET c.lastAcceptedStep = :step, c.lastUsedAt = :usedAt
            WHERE c.id = :id AND c.memberId = :memberId AND c.kind = kr.it.reserve.member.mfa.MfaCredential.Kind.TOTP
              AND c.lastAcceptedStep < :step
            """)
    int consumeTotp(@org.springframework.data.repository.query.Param("id") String id,
                    @org.springframework.data.repository.query.Param("memberId") Long memberId,
                    @org.springframework.data.repository.query.Param("step") long step,
                    @org.springframework.data.repository.query.Param("usedAt") java.time.LocalDateTime usedAt);
    boolean existsByMemberIdAndKind(Long memberId, MfaCredential.Kind kind);
    void deleteByMemberId(Long memberId);
}
