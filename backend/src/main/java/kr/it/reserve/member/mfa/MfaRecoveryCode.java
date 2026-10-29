package kr.it.reserve.member.mfa;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = lombok.AccessLevel.PROTECTED)
@Entity
@Table(name = "mfa_recovery_code", indexes = @Index(name = "idx_mfa_recovery_member", columnList = "member_id"))
public class MfaRecoveryCode {
    @Id @Column(length = 64) private String digest;
    @Column(name = "member_id", nullable = false) private Long memberId;
    public MfaRecoveryCode(String digest, Long memberId) { this.digest = digest; this.memberId = memberId; }
}
