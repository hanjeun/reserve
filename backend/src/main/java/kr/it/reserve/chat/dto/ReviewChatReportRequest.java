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
public class ReviewChatReportRequest {
    @NotNull(message = "처리 상태를 선택해주세요.")
    private ChatReport.Status status;

    @Size(max = 500, message = "처리 메모는 500자 이내로 입력해주세요.")
    private String resolutionNote;
}
