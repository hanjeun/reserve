package kr.it.reserve.reservation.dto;

import java.time.Instant;
import java.time.LocalDate;

public record NoShowMemberResponse(Long storeId, String storeName, Long memberId, String name, long retainedCount, long recentCount,
        LocalDate latestNoShowDate, Instant latestConfirmedAt, Instant automaticUntil, Instant manualUntil,
        boolean permanent, Long restrictionId, String reason, boolean restrictable) { }
