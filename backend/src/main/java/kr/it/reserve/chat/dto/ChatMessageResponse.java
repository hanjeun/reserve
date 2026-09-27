package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class ChatMessageResponse {

    private Long id;
    private String senderRole;
    private Long senderMemberId;
    private String senderName;
    private String senderProfileImage;
    private String content;
    private String clientMessageId;
    private String imageUrl;
    private Integer imageWidth;
    private Integer imageHeight;
    private LocalDateTime createdAt;
    private boolean retracted;
    private Long retractionRevision;

    public static ChatMessageResponse from(ChatMessage m) {
        return build(m, false);
    }

    /** 신고 컨텍스트 전용. 일반 참가자 응답에는 원문/사진을 다시 노출하지 않는다. */
    public static ChatMessageResponse forReport(ChatMessage m) {
        return build(m, true);
    }

    private static ChatMessageResponse build(ChatMessage m, boolean reportContext) {
        // 지원 대화의 담당자는 계정이 바뀌어도 같은 브랜드로 표시하고 개인 프로필은 노출하지 않는다.
        boolean supportAdmin = m.getSenderRole() == SenderRole.ADMIN
                && m.getRoom() != null && m.getRoom().getType() == ChatRoom.RoomType.SUPPORT;
        return ChatMessageResponse.builder()
                .id(m.getId())
                .senderRole(m.getSenderRole().name())
                .senderMemberId(m.getSenderMemberId())
                .senderName(supportAdmin ? ConversationSummaryResponse.SUPPORT_NAME : null)
                .content(m.isRetracted() && !reportContext ? "전송이 취소된 메시지입니다." : m.getContent())
                .clientMessageId(m.getClientMessageId())
                .imageUrl(m.getImageKey() == null || (m.isRetracted() && !reportContext) ? null : "/api/chat/images/" + m.getId())
                .imageWidth(m.isRetracted() && !reportContext ? null : m.getImageWidth())
                .imageHeight(m.isRetracted() && !reportContext ? null : m.getImageHeight())
                .createdAt(m.getCreatedAt())
                .retracted(m.isRetracted())
                .retractionRevision(m.getRetractionRevision())
                .build();
    }

    /** 보낸 사람이 나인지 — 화면이 좌/우 정렬을 정하는 데 쓴다. */
    public boolean isMine(SenderRole viewer) {
        return senderRole.equals(viewer.name());
    }
}
