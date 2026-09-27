package kr.it.reserve.chat.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/** 기준 메시지보다 오래된 대화 한 묶음. count 쿼리 없이 다음 묶음 존재 여부만 알려준다. */
@Getter
@Builder
public class ChatHistoryResponse {
    private List<ChatMessageResponse> messages;
    private boolean hasMore;
    private Long nextBeforeId;

    public static ChatHistoryResponse of(
            List<ChatMessageResponse> messages, boolean hasMore, Long nextBeforeId) {
        return ChatHistoryResponse.builder()
                .messages(messages)
                .hasMore(hasMore)
                .nextBeforeId(nextBeforeId)
                .build();
    }
}
