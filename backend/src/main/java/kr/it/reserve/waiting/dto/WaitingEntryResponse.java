package kr.it.reserve.waiting.dto;

import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

public record WaitingEntryResponse(Long id, Long storeId, LocalDate businessDate, int entryNumber,
                                   String displayName, int partySize, WaitingStatus status,
                                   OffsetDateTime createdAt, OffsetDateTime calledAt, OffsetDateTime finishedAt) {
    public static WaitingEntryResponse from(WaitingEntry entry) {
        return new WaitingEntryResponse(entry.getId(), entry.getStoreId(), entry.getBusinessDate(), entry.getEntryNumber(),
                entry.getDisplayName(), entry.getPartySize(), entry.getStatus(), utc(entry.getCreatedAt()),
                utc(entry.getCalledAt()), utc(entry.getFinishedAt()));
    }

    private static OffsetDateTime utc(LocalDateTime stored) {
        return stored == null ? null : stored.atOffset(ZoneOffset.UTC);
    }
}
