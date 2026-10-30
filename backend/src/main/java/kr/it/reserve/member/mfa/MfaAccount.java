package kr.it.reserve.member.mfa;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor(access = lombok.AccessLevel.PROTECTED)
@Entity
@Table(name = "mfa_account", uniqueConstraints = @UniqueConstraint(name = "uk_mfa_account_handle", columnNames = "user_handle"))
public class MfaAccount {
    @Id @Column(name = "member_id") private Long memberId;
    @Column(name = "user_handle", nullable = false, length = 36) private String userHandle;
    @Column(nullable = false) private boolean enabled;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

    public MfaAccount(Long memberId, LocalDateTime now) {
        this.memberId = memberId;
        userHandle = UUID.randomUUID().toString();
        createdAt = now;
    }
    public void enable() { enabled = true; }
    public void disable() { enabled = false; }
}
