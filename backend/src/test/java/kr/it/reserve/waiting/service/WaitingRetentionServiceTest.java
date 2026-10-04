package kr.it.reserve.waiting.service;

import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Set;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class WaitingRetentionServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-04T15:05:00Z"), ZoneOffset.UTC);
    private final WaitingEntryRepository entries = mock(WaitingEntryRepository.class);

    @Test
    void onlyTerminalRowsAreMinimizedAfterKoreanMidnightAndExpiredAfterSevenDays() {
        var retention = new WaitingRetentionService(entries, true, "2026-10-04T09:00:00+09:00", CLOCK);
        retention.cleanFinishedEntries();
        verify(entries).cancelForDeletedStores(Set.of("WAITING", "CALLED"), "CANCELLED", LocalDateTime.parse("2026-10-04T15:05:00"));
        verify(entries).clearFinishedNames(WaitingStatus.TERMINAL, LocalDateTime.parse("2026-10-04T15:00:00"));
        verify(entries).deleteFinishedBefore(WaitingStatus.TERMINAL, LocalDateTime.parse("2026-09-27T15:05:00"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"invalid", "2026-10-05T09:00:00+09:00"})
    void missingInvalidOrFuturePublicationDoesNotDelete(String notice) {
        new WaitingRetentionService(entries, true, notice, CLOCK).cleanFinishedEntries();
        verifyNoInteractions(entries);
    }

    @Test
    void futurePublicationNeverBecomesActiveJustBecauseTheClockReachesIt() {
        Clock advancing = mock(Clock.class);
        when(advancing.instant()).thenReturn(CLOCK.instant(), CLOCK.instant().plusSeconds(2 * 24 * 60 * 60));
        var retention = new WaitingRetentionService(entries, true, "2026-10-05T09:00:00+09:00", advancing);
        retention.cleanFinishedEntries();
        verifyNoInteractions(entries);
    }

    @Test
    void operatorCanDisableTheSweep() {
        new WaitingRetentionService(entries, false, "2026-10-04T09:00:00+09:00", CLOCK).cleanFinishedEntries();
        verifyNoInteractions(entries);
    }
}
