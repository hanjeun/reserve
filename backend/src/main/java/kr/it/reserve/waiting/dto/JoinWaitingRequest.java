package kr.it.reserve.waiting.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;

public record JoinWaitingRequest(
        @NotNull(message = "인원을 입력해주세요.") @Min(value = 1, message = "인원은 1명 이상이어야 해요.")
        @Max(value = 100, message = "인원은 100명까지 입력할 수 있어요.") Integer partySize,
        @NotBlank(message = "접수 식별자가 필요해요.") @Size(max = 64, message = "접수 식별자가 너무 길어요.")
        @Pattern(regexp = "[A-Za-z0-9_-]+", message = "접수 식별자를 확인해주세요.") String clientRequestId,
        @Size(max = 2048, message = "현장 QR을 다시 확인해주세요.") String onsiteToken,
        @NotNull(message = "가게에 개인정보 제공 동의가 필요해요.")
        @AssertTrue(message = "가게에 개인정보 제공 동의가 필요해요.") Boolean privacyAgreed,
        @NotNull(message = "웨이팅 접수 안내를 다시 확인해주세요.") Instant privacyNoticePublishedAt
) {}
