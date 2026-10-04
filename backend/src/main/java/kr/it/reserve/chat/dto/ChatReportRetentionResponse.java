package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatReport;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/** 보존 변경 근거와 관리자 ID는 신고 제출자 응답에 합치지 않는다. */
public record ChatReportRetentionResponse(Long reportId, ChatReport.RetentionCategory category, boolean hold,
                                           OffsetDateTime retentionBasisAt, OffsetDateTime minimumRetentionUntil,
                                           String note, Long changedByMemberId, OffsetDateTime changedAt) {
    public static ChatReportRetentionResponse from(ChatReport report) {
        return new ChatReportRetentionResponse(report.getId(), report.getRetentionCategory(),
                report.isRetentionHold(), utc(report.getRetentionBasisAt()), utc(report.getMinimumRetentionUntil()),
                report.getRetentionNote(), report.getRetentionChangedByMemberId(), utc(report.getRetentionChangedAt()));
    }

    private static OffsetDateTime utc(LocalDateTime value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }
}
