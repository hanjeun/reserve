package kr.it.reserve.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;
import kr.it.reserve.chat.entity.ChatReport;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

@Getter
@Setter
@NoArgsConstructor
public class UpdateChatReportRetentionRequest {
    @NotNull(message = "보존 분류를 선택해주세요.")
    private ChatReport.RetentionCategory category;

    @NotNull(message = "보류 여부를 선택해주세요.")
    private Boolean hold;

    @PastOrPresent(message = "보존 기산일은 현재보다 이후일 수 없어요.")
    private OffsetDateTime retentionBasisAt;

    @NotBlank(message = "보존 정책 변경 근거를 입력해주세요.")
    @Size(max = 500, message = "변경 근거는 500자 이내로 입력해주세요.")
    private String note;
}
