package kr.it.reserve.waiting.dto;

import jakarta.validation.constraints.NotNull;
import kr.it.reserve.waiting.entity.WaitingStatus;

public record UpdateWaitingStatusRequest(
        @NotNull(message = "변경할 상태를 선택해주세요.") WaitingStatus status
) {
}
