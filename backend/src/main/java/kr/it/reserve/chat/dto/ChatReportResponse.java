package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatReport;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class ChatReportResponse {
    private Long id;
    private Long roomId;
    private Long storeId;
    private String storeName;
    private Long messageId;
    private Long reporterMemberId;
    private String reporterRole;
    private String reason;
    private String details;
    private String status;
    private String resolutionNote;
    private Long reviewedByMemberId;
    private LocalDateTime reviewedAt;
    private LocalDateTime createdAt;

    public static ChatReportResponse from(ChatReport report) {
        return ChatReportResponse.builder()
                .id(report.getId())
                .roomId(report.getRoom().getId())
                .storeId(report.getRoom().getStoreId())
                .storeName(report.getRoom().getStoreNameSnapshot())
                .messageId(report.getMessageId())
                .reporterMemberId(report.getReporterMemberId())
                .reporterRole(report.getReporterRole().name())
                .reason(report.getReason().name())
                .details(report.getDetails())
                .status(report.getStatus().name())
                .resolutionNote(report.getResolutionNote())
                .reviewedByMemberId(report.getReviewedByMemberId())
                .reviewedAt(report.getReviewedAt())
                .createdAt(report.getCreatedAt())
                .build();
    }
}
