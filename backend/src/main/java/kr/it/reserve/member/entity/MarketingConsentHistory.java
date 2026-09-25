package kr.it.reserve.member.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/** 선택 마케팅 동의와 철회의 시점·경로·정책 버전을 보존하는 append-only 증거. */
@Entity
@Table(
        name = "marketing_consent_history",
        indexes = @Index(
                name = "idx_marketing_consent_member_created",
                columnList = "member_id,created_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@EntityListeners(AuditingEntityListener.class)
public class MarketingConsentHistory {

    /** 개인정보 처리방침의 현재 최종 수정일. 문서를 바꾸면 이 값도 함께 올린다. */
    public static final String CURRENT_POLICY_VERSION = "2026-09-01";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "marketing_consent_history_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "agreed", nullable = false)
    private boolean agreed;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 30)
    private Source source;

    @Column(name = "policy_version", nullable = false, length = 20)
    private String policyVersion;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public static MarketingConsentHistory record(Member member, boolean agreed, Source source) {
        MarketingConsentHistory history = new MarketingConsentHistory();
        history.member = member;
        history.agreed = agreed;
        history.source = source;
        history.policyVersion = CURRENT_POLICY_VERSION;
        return history;
    }

    public enum Source {
        LOCAL_SIGNUP,
        SOCIAL_SIGNUP,
        SETTINGS
    }
}
