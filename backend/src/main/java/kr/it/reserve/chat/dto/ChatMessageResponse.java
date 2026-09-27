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
    private String senderName;
    private String senderProfileImage;
    private String content;
    private String clientMessageId;
    private String imageUrl;
    private Integer imageWidth;
    private Integer imageHeight;
    private LocalDateTime createdAt;

    public static ChatMessageResponse from(ChatMessage m) {
        // 지원 대화의 담당자는 계정이 바뀌어도 같은 브랜드로 표시하고 개인 프로필은 노출하지 않는다.
        boolean supportAdmin = m.getSenderRole() == SenderRole.ADMIN
                && m.getRoom() != null && m.getRoom().getType() == ChatRoom.RoomType.SUPPORT;
        return ChatMessageResponse.builder()
                .id(m.getId())
                .senderRole(m.getSenderRole().name())
                .senderName(supportAdmin ? ConversationSummaryResponse.SUPPORT_NAME : null)
                .content(m.getContent())
                .clientMessageId(m.getClientMessageId())
                .imageUrl(m.getImageKey() == null ? null : "/api/chat/images/" + m.getId())
                .imageWidth(m.getImageWidth())
                .imageHeight(m.getImageHeight())
                .createdAt(m.getCreatedAt())
                .build();
    }

    /** 보낸 사람이 나인지 — 화면이 좌/우 정렬을 정하는 데 쓴다. */
    public boolean isMine(SenderRole viewer) {
        return senderRole.equals(viewer.name());
    }
}
