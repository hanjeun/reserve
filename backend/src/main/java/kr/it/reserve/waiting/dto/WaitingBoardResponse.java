package kr.it.reserve.waiting.dto;

import java.time.LocalDate;
import java.util.List;

public record WaitingBoardResponse(Long storeId, LocalDate businessDate, List<WaitingEntryResponse> entries) {
}
