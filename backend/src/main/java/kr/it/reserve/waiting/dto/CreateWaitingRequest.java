package kr.it.reserve.waiting.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateWaitingRequest(
        @Size(max = 40, message = "표시 이름은 40자까지 입력할 수 있습니다.") String displayName,
        @NotNull(message = "인원을 입력해주세요.")
        @Min(value = 1, message = "인원은 1명 이상이어야 합니다.")
        @Max(value = 100, message = "인원은 100명까지 입력할 수 있습니다.") Integer partySize,
        @NotBlank(message = "접수 식별자가 필요합니다.")
        @Size(max = 64, message = "접수 식별자가 너무 깁니다.")
        @Pattern(regexp = "[A-Za-z0-9_-]+", message = "올바른 접수 식별자가 아닙니다.") String clientRequestId
) {
}
