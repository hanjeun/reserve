package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ConversationModerationStateResponse {
    private Long roomId;
    private boolean blocked;
    private boolean blockedByMe;

    public static ConversationModerationStateResponse from(ChatRoom room, SenderRole viewerRole) {
        return ConversationModerationStateResponse.builder()
                .roomId(room.getId())
                .blocked(room.isBlocked())
                .blockedByMe(room.isBlockedBy(viewerRole))
                .build();
    }
}
