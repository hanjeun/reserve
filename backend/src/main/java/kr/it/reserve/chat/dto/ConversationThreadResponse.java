package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

/** 대화 헤더와 최근 메시지를 함께 내려주는 공통 응답. */
@Getter
@Builder
public class ConversationThreadResponse {

    private static final String MEMBER_VIEWER_ROLE = "MEMBER";
    private Long roomId;
    private String type;
    private Long storeId;
    private String storeImageUrl;
    private String title;
    private String counterpartName;
    private String counterpartProfileImage;
    private String viewerRole;
    private boolean canSend;
    private boolean blocked;
    private boolean blockedByMe;
    private String sendDisabledReason;
    private boolean hasOlderMessages;
    private Long nextBeforeId;
    private List<ChatMessageResponse> messages;

    public static ConversationThreadResponse from(
            ChatRoom room, String title, String viewerRole, boolean canSend,
            List<ChatMessageResponse> messages, boolean hasOlderMessages, Long nextBeforeId) {
        return from(room, title, viewerRole, canSend, messages, hasOlderMessages, nextBeforeId, null);
    }

    public static ConversationThreadResponse from(
            ChatRoom room, String title, String viewerRole, boolean canSend,
            List<ChatMessageResponse> messages, boolean hasOlderMessages, Long nextBeforeId,
            String storeImageUrl) {
        boolean blocked = room.isBlocked();
        boolean blockedByMe = room.isBlockedBy(SenderRole.valueOf(viewerRole));
        boolean support = room.getType() == ChatRoom.RoomType.SUPPORT;
        return ConversationThreadResponse.builder()
                .roomId(room.getId())
                .type(room.getType().name())
                .storeId(room.getStoreId())
                .storeImageUrl(support ? null : storeImageUrl)
                .title(support && MEMBER_VIEWER_ROLE.equals(viewerRole)
                        ? ConversationSummaryResponse.SUPPORT_NAME : title)
                .counterpartName(support && MEMBER_VIEWER_ROLE.equals(viewerRole)
                        ? ConversationSummaryResponse.SUPPORT_NAME : title)
                // 회원 화면에는 고객지원 담당자의 개인 정보를 노출하지 않는다. 관리자·사장님
                // 화면에서 상대인 회원의 공개 프로필 사진만 전달한다.
                .counterpartProfileImage(MEMBER_VIEWER_ROLE.equals(viewerRole)
                        ? null : room.getMember().getProfileImage())
                .viewerRole(viewerRole)
                .canSend(canSend && !blocked)
                .blocked(blocked)
                .blockedByMe(blockedByMe)
                .sendDisabledReason(disabledReason(canSend, blocked, blockedByMe))
                .hasOlderMessages(hasOlderMessages)
                .nextBeforeId(nextBeforeId)
                .messages(messages)
                .build();
    }

    private static String disabledReason(boolean resourceAvailable, boolean blocked, boolean blockedByMe) {
        if (blocked) return blockedByMe ? "BLOCKED_BY_ME" : "BLOCKED_BY_OTHER";
        return resourceAvailable ? null : "STORE_UNAVAILABLE";
    }
}
