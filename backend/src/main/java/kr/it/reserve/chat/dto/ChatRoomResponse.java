package kr.it.reserve.chat.dto;

import kr.it.reserve.chat.entity.ChatRoom;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/** 관리자 목록 한 줄. 손님 화면은 방이 하나뿐이라 이걸 안 쓴다. */
@Getter
@Builder
public class ChatRoomResponse {

    private Long id;
    private Long memberId;
    private String memberName;
    private String memberEmail;
    private String memberProfileImage;
    private int adminUnread;
    private String lastMessagePreview;
    private LocalDateTime lastMessageAt;

    public static ChatRoomResponse from(ChatRoom r) {
        return from(r, null);
    }

    public static ChatRoomResponse from(ChatRoom r, String fallbackPreview) {
        String preview = r.getLastMessagePreview();
        if (preview == null || preview.isBlank()) preview = fallbackPreview;
        return ChatRoomResponse.builder()
                .id(r.getId())
                .memberId(r.getMember().getId())
                .memberName(r.getMember().getName())
                .memberEmail(r.getMember().getEmail())
                .memberProfileImage(r.getMember().getProfileImage())
                .adminUnread(r.getAdminUnread())
                .lastMessagePreview(preview)
                .lastMessageAt(r.getLastMessageAt())
                .build();
    }
}
