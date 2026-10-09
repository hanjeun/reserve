package kr.it.reserve.waiting.dto;

import java.time.OffsetDateTime;

public record WaitingQrResponse(String token, OffsetDateTime expiresAt) {}
