package kr.it.reserve.member.mfa;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor(access = lombok.AccessLevel.PROTECTED)
@Entity
@Table(name = "mfa_credential", uniqueConstraints = @UniqueConstraint(name = "uk_mfa_credential_slot", columnNames = "slot_key"),
        indexes = @Index(name = "idx_mfa_credential_member", columnList = "member_id"))
public class MfaCredential {
    public enum Kind { PASSKEY, TOTP }
    @Id @Column(length = 36) private String id;
    @Column(name = "member_id", nullable = false) private Long memberId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private Kind kind;
    @Column(name = "slot_key", nullable = false, length = 80) private String slotKey;
    @Column(nullable = false, length = 80) private String name;
    @Column(name = "credential_id", length = 2048) private String credentialId;
    @Column(name = "public_key_cose", length = 4096) private String publicKeyCose;
    @Column(name = "signature_count", nullable = false) private long signatureCount;
    @Column(length = 255) private String transports;
    @Column(name = "backup_eligible", nullable = false) private boolean backupEligible;
    @Column(name = "backed_up", nullable = false) private boolean backedUp;
    @Column(name = "secret_ciphertext", length = 512) private String secretCiphertext;
    @Column(name = "last_accepted_step", nullable = false) private long lastAcceptedStep = -1;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "last_used_at") private LocalDateTime lastUsedAt;

    public static MfaCredential totp(Long memberId, String cipher, long step, LocalDateTime now) {
        MfaCredential result = base(memberId, Kind.TOTP, "인증 앱", "TOTP:" + memberId, now);
        result.secretCiphertext = cipher;
        result.lastAcceptedStep = step;
        return result;
    }
    public static MfaCredential passkey(Long memberId, String name, String credentialId, String digest, String publicKey,
            long count, String transports, boolean backupEligible, boolean backedUp, LocalDateTime now) {
        MfaCredential result = base(memberId, Kind.PASSKEY, name, "PASSKEY:" + digest, now);
        result.credentialId = credentialId;
        result.publicKeyCose = publicKey;
        result.signatureCount = count;
        result.transports = transports;
        result.backupEligible = backupEligible;
        result.backedUp = backedUp;
        return result;
    }
    private static MfaCredential base(Long memberId, Kind kind, String name, String slot, LocalDateTime now) {
        MfaCredential result = new MfaCredential();
        result.id = UUID.randomUUID().toString();
        result.memberId = memberId;
        result.kind = kind;
        result.name = name;
        result.slotKey = slot;
        result.createdAt = now;
        return result;
    }
    public void usedTotp(long step, LocalDateTime now) {
        if (step <= lastAcceptedStep) throw new IllegalArgumentException("TOTP step was already consumed");
        lastAcceptedStep = step;
        lastUsedAt = now;
    }
    public void usedPasskey(long count, boolean backedUp, LocalDateTime now) {
        signatureCount = count;
        this.backedUp = backedUp;
        lastUsedAt = now;
    }
}
