package kr.it.reserve.chat.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/** 관리자 신고 검토용 읽기 전용 대화 문맥. 메시지나 읽음 상태를 변경하지 않는다. */
@Getter
@Builder
public class ChatReportContextResponse {
    private ChatReportResponse report;
    private ChatMessageResponse reportedMessage;
    private List<ChatMessageResponse> recentMessages;
}
