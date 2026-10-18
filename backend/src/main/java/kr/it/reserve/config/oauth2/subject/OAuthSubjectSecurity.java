package kr.it.reserve.config.oauth2.subject;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** provider 식별자의 가명 키와 인증/폐기 고수위만 보관한다. 회원·거래·원문 사건 원장이 아니다. */
@Entity
@Table(name = "oauth_subject_security")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OAuthSubjectSecurity {
    @Id
    @Column(name = "subject_key", columnDefinition = "CHAR(64)")
    private String subjectKey;

    @Column(name = "provider", nullable = false, length = 20)
    private String provider;

    @Column(name = "last_authenticated_at")
    private LocalDateTime lastAuthenticatedAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** 이전 v7 Member 시각이 더 최신이어도 낮추지 않는다. NULL을 임의 추정하지 않는다. */
    public void mergeMemberState(LocalDateTime authenticatedAt, LocalDateTime memberRevokedAt) {
        if (authenticatedAt != null && (lastAuthenticatedAt == null || authenticatedAt.isAfter(lastAuthenticatedAt))) {
            lastAuthenticatedAt = authenticatedAt;
        }
        if (memberRevokedAt != null && (revokedAt == null || memberRevokedAt.isAfter(revokedAt))) {
            revokedAt = memberRevokedAt;
        }
    }

    public boolean acceptsAuthentication(LocalDateTime authenticatedAt) {
        return authenticatedAt != null
                && (revokedAt == null || authenticatedAt.isAfter(revokedAt))
                && (lastAuthenticatedAt == null || !authenticatedAt.isBefore(lastAuthenticatedAt));
    }

    public void authenticated(LocalDateTime authenticatedAt, LocalDateTime now) {
        if (!acceptsAuthentication(authenticatedAt)) throw new IllegalStateException("OAuth authentication is older than subject state");
        lastAuthenticatedAt = authenticatedAt;
        updatedAt = now;
    }

    public void revoked(LocalDateTime occurredAt, LocalDateTime now) {
        if (revokedAt == null || occurredAt.isAfter(revokedAt)) revokedAt = occurredAt;
        updatedAt = now;
    }
}
