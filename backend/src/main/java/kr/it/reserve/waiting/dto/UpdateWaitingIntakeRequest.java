package kr.it.reserve.waiting.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateWaitingIntakeRequest(@NotNull Boolean paused) {}
