package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/** MessengerShell 한 줄. 보는 위치에 따라 상대 이름과 안 읽음 수를 명시적으로 만든다. */
@Getter
@Builder
public class ConversationSummaryResponse {
    public static final String SUPPORT_NAME = "RESERVE 고객지원";

    private Long roomId;
    private String type;
    private Long storeId;
    private String storeName;
    private String storeImageUrl;
    private String counterpartName;
    private String counterpartProfileImage;
    private String viewerRole;
    private int unread;
    private boolean blocked;
    private boolean blockedByMe;
    private String lastMessagePreview;
    private LocalDateTime lastMessageAt;

    public static ConversationSummaryResponse forMember(ChatRoom room) {
        return forMember(room, null);
    }

    public static ConversationSummaryResponse forMember(ChatRoom room, String lastMessagePreview) {
        return forMember(room, lastMessagePreview, null);
    }

    public static ConversationSummaryResponse forMember(ChatRoom room, String lastMessagePreview, String storeImageUrl) {
        boolean support = room.getType() == ChatRoom.RoomType.SUPPORT;
        return base(room, lastMessagePreview)
                .storeImageUrl(support ? null : storeImageUrl)
                .counterpartName(support ? SUPPORT_NAME : room.getStoreNameSnapshot())
                .viewerRole("MEMBER")
                .unread(room.getMemberUnread())
                .blocked(room.isBlocked())
                .blockedByMe(room.isBlockedBy(SenderRole.MEMBER))
                .build();
    }

    public static ConversationSummaryResponse forOwner(ChatRoom room) {
        return forOwner(room, null);
    }

    public static ConversationSummaryResponse forOwner(ChatRoom room, String lastMessagePreview) {
        return forOwner(room, lastMessagePreview, null);
    }

    public static ConversationSummaryResponse forOwner(ChatRoom room, String lastMessagePreview, String storeImageUrl) {
        return base(room, lastMessagePreview)
                .storeImageUrl(storeImageUrl)
                .counterpartName(room.getMember().getName())
                .counterpartProfileImage(room.getMember().getProfileImage())
                .viewerRole("OWNER")
                .unread(room.getOwnerUnread())
                .blocked(room.isBlocked())
                .blockedByMe(room.isBlockedBy(SenderRole.OWNER))
                .build();
    }

    private static ConversationSummaryResponseBuilder base(ChatRoom room, String lastMessagePreview) {
        return ConversationSummaryResponse.builder()
                .roomId(room.getId())
                .type(room.getType().name())
                .storeId(room.getStoreId())
                .storeName(room.getStoreNameSnapshot())
                .lastMessagePreview(room.getLastMessagePreview() == null
                        || room.getLastMessagePreview().isBlank()
                        ? lastMessagePreview : room.getLastMessagePreview())
                .lastMessageAt(room.getLastMessageAt());
    }
}
