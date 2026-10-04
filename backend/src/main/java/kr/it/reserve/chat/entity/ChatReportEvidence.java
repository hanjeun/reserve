package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

/** 신고 접수 당시 고정된 문맥. 일반 메시지의 파기/취소와 분리되며 수정 API가 없다. */
@Entity
@Table(name = "chat_report_evidence", uniqueConstraints = @UniqueConstraint(name = "uk_chat_evidence_report_message", columnNames = {"report_id", "message_id"}),
        indexes = @Index(name = "idx_chat_evidence_image", columnList = "image_key"))
@Getter
@NoArgsConstructor
public class ChatReportEvidence {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "report_id", nullable = false, updatable = false) private Long reportId;
    @Column(name = "message_id", nullable = false, updatable = false) private Long messageId;
    @Column(name = "room_id", nullable = false, updatable = false) private Long roomId;
    @Column(name = "sender_member_id", updatable = false) private Long senderMemberId;
    @Enumerated(EnumType.STRING) @Column(name = "sender_role", length = 10, nullable = false, updatable = false) private SenderRole senderRole;
    @Column(name = "content", columnDefinition = "TEXT", nullable = false, updatable = false) private String content;
    @Column(name = "image_key", length = 512, updatable = false) private String imageKey;
    @Column(name = "image_original_filename", length = 255, updatable = false) private String imageOriginalFilename;
    @Column(name = "image_content_type", length = 40, updatable = false) private String imageContentType;
    @Column(name = "image_width", updatable = false) private Integer imageWidth;
    @Column(name = "image_height", updatable = false) private Integer imageHeight;
    @Column(name = "message_created_at", updatable = false) private LocalDateTime messageCreatedAt;
    @Column(name = "retracted_at_capture", nullable = false, updatable = false) private boolean retractedAtCapture;
    @Column(name = "captured_at", nullable = false, updatable = false) private LocalDateTime capturedAt;

    public static ChatReportEvidence capture(Long reportId, ChatMessage message, LocalDateTime now) {
        ChatReportEvidence evidence = new ChatReportEvidence();
        evidence.reportId = reportId;
        evidence.messageId = message.getId();
        evidence.roomId = message.getRoom().getId();
        evidence.senderMemberId = message.getSenderMemberId();
        evidence.senderRole = message.getSenderRole();
        evidence.content = message.getContent();
        evidence.imageKey = message.getImageKey();
        evidence.imageOriginalFilename = message.getImageOriginalFilename();
        evidence.imageContentType = message.getImageContentType();
        evidence.imageWidth = message.getImageWidth();
        evidence.imageHeight = message.getImageHeight();
        evidence.messageCreatedAt = message.getCreatedAt();
        evidence.retractedAtCapture = message.isRetracted();
        evidence.capturedAt = now;
        return evidence;
    }
}
