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
    private int adminUnread;
    private LocalDateTime lastMessageAt;

    public static ChatRoomResponse from(ChatRoom r) {
        return ChatRoomResponse.builder()
                .id(r.getId())
                .memberId(r.getMember().getId())
                .memberName(r.getMember().getName())
                .memberEmail(r.getMember().getEmail())
                .adminUnread(r.getAdminUnread())
                .lastMessageAt(r.getLastMessageAt())
                .build();
    }
}
