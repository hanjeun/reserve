package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.SenderRole;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class ChatMessageResponse {

    private Long id;
    private String senderRole;
    private String content;
    private LocalDateTime createdAt;

    public static ChatMessageResponse from(ChatMessage m) {
        return ChatMessageResponse.builder()
                .id(m.getId())
                .senderRole(m.getSenderRole().name())
                .content(m.getContent())
                .createdAt(m.getCreatedAt())
                .build();
    }

    /** 보낸 사람이 나인지 — 화면이 좌/우 정렬을 정하는 데 쓴다. */
    public boolean isMine(SenderRole viewer) {
        return senderRole.equals(viewer.name());
    }
}
