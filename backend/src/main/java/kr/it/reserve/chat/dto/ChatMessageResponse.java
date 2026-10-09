package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.ChatReportEvidence;
import kr.it.reserve.chat.entity.SenderRole;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class ChatMessageResponse {

    private Long id;
    private String senderRole;
    private boolean canRetract;
    private String senderName;
    private String senderProfileImage;
    private String content;
    private String clientMessageId;
    private String imageUrl;
    private String imageOriginalFilename;
    private Integer imageWidth;
    private Integer imageHeight;
    private LocalDateTime createdAt;
    private boolean retracted;
    private boolean expired;
    private Long retractionRevision;

    public static ChatMessageResponse forEvidence(ChatReportEvidence evidence) {
        return builder().id(evidence.getMessageId()).senderRole(evidence.getSenderRole().name())
                .content(evidence.getContent()).imageUrl(evidence.getImageKey() == null ? null
                        : "/api/admin/chat/reports/" + evidence.getReportId() + "/images/" + evidence.getMessageId())
                .imageOriginalFilename(evidence.getImageKey() == null ? null : evidence.getImageOriginalFilename())
                .imageWidth(evidence.getImageWidth()).imageHeight(evidence.getImageHeight())
                .createdAt(evidence.getMessageCreatedAt()).retracted(evidence.isRetractedAtCapture()).build();
    }

    public static ChatMessageResponse from(ChatMessage m) {
        return from(m, null);
    }

    /** 신원 ID를 직렬화하지 않고, 인증된 조회자의 본인 메시지 여부만 내려준다. */
    public static ChatMessageResponse from(ChatMessage m, Long viewerId) {
        return build(m, false, viewerId);
    }

    /** 신고 컨텍스트 전용. 일반 참가자 응답에는 원문/사진을 다시 노출하지 않는다. */
    public static ChatMessageResponse forReport(ChatMessage m) {
        return build(m, true, null);
    }

    private static ChatMessageResponse build(ChatMessage m, boolean reportContext, Long viewerId) {
        // 지원 대화의 담당자는 계정이 바뀌어도 같은 브랜드로 표시하고 개인 프로필은 노출하지 않는다.
        boolean supportAdmin = m.getSenderRole() == SenderRole.ADMIN
                && m.getRoom() != null && m.getRoom().getType() == ChatRoom.RoomType.SUPPORT;
        return ChatMessageResponse.builder()
                .id(m.getId())
                .senderRole(m.getSenderRole().name())
                .canRetract(!reportContext && !m.isPurged() && !m.isRetracted() && viewerId != null && viewerId.equals(m.getSenderMemberId()))
                .senderName(supportAdmin ? ConversationSummaryResponse.SUPPORT_NAME : null)
                .content(resolveContent(m, reportContext))
                .clientMessageId(m.getClientMessageId())
                .imageUrl(m.getImageKey() == null || (m.isRetracted() && !reportContext) ? null : "/api/chat/images/" + m.getId())
                .imageOriginalFilename(m.getImageKey() == null || (m.isRetracted() && !reportContext) ? null : m.getImageOriginalFilename())
                .imageWidth(m.isRetracted() && !reportContext ? null : m.getImageWidth())
                .imageHeight(m.isRetracted() && !reportContext ? null : m.getImageHeight())
                .createdAt(m.getCreatedAt())
                .retracted(m.isRetracted())
                .expired(m.isPurged())
                .retractionRevision(m.getRetractionRevision())
                .build();
    }

    private static String resolveContent(ChatMessage message, boolean reportContext) {
        if (message.isPurged()) {
            return "보존 기간이 지난 메시지예요.";
        }
        if (message.isRetracted() && !reportContext) {
            return "전송이 취소된 메시지예요.";
        }
        return message.getContent();
    }

    /** 보낸 사람이 나인지 — 화면이 좌/우 정렬을 정하는 데 쓴다. */
    public boolean isMine(SenderRole viewer) {
        return senderRole.equals(viewer.name());
    }
}
