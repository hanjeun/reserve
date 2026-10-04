package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.service.ChatRetentionPolicy;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;

/** 공개 고지의 유효 시각만 반환하며 관리자 변경 근거·개인정보는 포함하지 않는다. */
public record ChatRetentionPolicyResponse(int ordinaryDays, int legacyGraceDays, OffsetDateTime noticePublishedAt,
                                           OffsetDateTime effectiveAt, boolean enabled, boolean active) {
    public static ChatRetentionPolicyResponse from(ChatRetentionPolicy policy, LocalDateTime now) {
        return new ChatRetentionPolicyResponse(ChatRetentionPolicy.MESSAGE_RETENTION_DAYS,
                ChatRetentionPolicy.NOTICE_GRACE_DAYS, policy.publishedAt(now), policy.effectiveAt(now),
                policy.isEnabled(), policy.isActive(now));
    }
}
