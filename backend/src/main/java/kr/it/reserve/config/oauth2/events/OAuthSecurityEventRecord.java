package kr.it.reserve.config.oauth2.events;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import kr.it.reserve.member.entity.AuthProvider;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 사건 원문/subject/토큰 없이 중복 수신 방지에 필요한 최소 메타데이터만 보관한다. */
@Entity
@Table(name = "oauth_security_event",
        uniqueConstraints = @UniqueConstraint(name = "uk_oauth_security_event_hash", columnNames = "event_hash"),
        indexes = @Index(name = "idx_oauth_security_event_processed", columnList = "processed_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OAuthSecurityEventRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "oauth_security_event_id")
    private Long id;

    @Column(name = "provider", nullable = false, length = 20)
    private String provider;

    @Column(name = "event_hash", nullable = false, columnDefinition = "CHAR(64)")
    private String eventHash;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;

    @Column(name = "outcome", nullable = false, length = 20)
    private String outcome;

    static OAuthSecurityEventRecord received(AuthProvider provider, String eventHash,
            LocalDateTime occurredAt, LocalDateTime processedAt) {
        OAuthSecurityEventRecord record = new OAuthSecurityEventRecord();
        record.provider = provider.name();
        record.eventHash = eventHash;
        record.occurredAt = occurredAt;
        record.processedAt = processedAt;
        record.outcome = "IGNORED";
        return record;
    }

    void markApplied() { outcome = "APPLIED"; }
}
