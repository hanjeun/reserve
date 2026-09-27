package kr.it.reserve.chat.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kr.it.reserve.chat.entity.ChatReport;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class CreateChatReportRequest {
    private Long messageId;

    @NotNull(message = "신고 사유를 선택해주세요.")
    private ChatReport.Reason reason;

    @Size(max = 500, message = "신고 설명은 500자 이내로 입력해주세요.")
    private String details;
}
