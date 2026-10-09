package kr.it.reserve.waiting.service;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.waiting.dto.CreateWaitingRequest;
import kr.it.reserve.waiting.dto.UpdateWaitingStatusRequest;
import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WaitingServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-04T15:10:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);
    private static final LocalDateTime NOW_UTC = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC);
    @Mock WaitingEntryRepository entries;
    @Mock StoreRepository stores;
    private WaitingService service;
    private Member owner;
    private Store store;

    @BeforeEach
    void setUp() {
        service = new WaitingService(entries, stores, Clock.fixed(NOW, ZoneOffset.UTC));
        owner = Member.builder().id(8L).role(Role.BUSINESS).build();
        store = Store.builder().id(31L).owner(owner).status(StoreStatus.ACTIVE).build();
    }

    @Test
    void intakeLocksTheStoreBeforeAllocatingTheKoreanDayNumberAndPersistsUtc() {
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        when(entries.findByStoreIdAndClientRequestId(31L, "request-1")).thenReturn(Optional.empty());
        when(entries.lastEntryNumber(31L, TODAY)).thenReturn(3);
        when(entries.save(any())).thenAnswer(call -> call.getArgument(0));

        var result = service.create(owner, 31L, new CreateWaitingRequest("  팀\n  하나  ", 2, "REQUEST-1"));

        assertThat(result.businessDate()).isEqualTo(TODAY);
        assertThat(result.entryNumber()).isEqualTo(4);
        assertThat(result.displayName()).isEqualTo("팀 하나");
        assertThat(result.createdAt()).isEqualTo(NOW.atOffset(ZoneOffset.UTC));
        assertThat(result.status()).isEqualTo(WaitingStatus.WAITING);
        var order = inOrder(stores, entries);
        order.verify(stores).findByIdForUpdate(31L);
        order.verify(entries).findByStoreIdAndClientRequestId(31L, "request-1");
        order.verify(entries).lastEntryNumber(31L, TODAY);
        order.verify(entries).save(any());
    }

    @Test
    void retryReturnsTheOriginalTicketAndReusingTheKeyForDifferentPeopleIsRejected() {
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        WaitingEntry existing = entry(TODAY.minusDays(1));
        when(entries.findByStoreIdAndClientRequestId(31L, "request-1")).thenReturn(Optional.of(existing));

        var result = service.create(owner, 31L, new CreateWaitingRequest("팀 하나", 2, "request-1"));
        assertThat(result.businessDate()).isEqualTo(TODAY.minusDays(1));
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest("다른 팀", 3, "request-1")), HttpStatus.CONFLICT);
        verify(entries, never()).lastEntryNumber(anyLong(), any());
        verify(entries, never()).save(any());
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    void neitherAnotherOwnerNorAnUnrelatedAdministratorCanReadOrChangeTickets(Role role) {
        Member other = Member.builder().id(9L).role(role).build();
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        assertStatus(() -> service.getBoard(other, 31L), HttpStatus.FORBIDDEN);
        assertStatus(() -> service.create(other, 31L, new CreateWaitingRequest(null, 1, "new-ticket")), HttpStatus.FORBIDDEN);
        assertStatus(() -> service.updateStatus(other, 31L, 1L, new UpdateWaitingStatusRequest(WaitingStatus.CALLED)), HttpStatus.FORBIDDEN);
        assertStatus(() -> service.updateIntake(other, 31L, true), HttpStatus.FORBIDDEN);
        verifyNoInteractions(entries);
    }

    @Test
    void intakePausePreservesModeAndBoardAndResumeRequiresAnActiveStore() {
        store.setWaitingIntakeMode(WaitingIntakeMode.BOTH);
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        when(entries.findBoard(org.mockito.ArgumentMatchers.eq(31L), any(), any(), any(), any()))
                .thenReturn(List.of(entry(TODAY)));
        var board = service.updateIntake(owner, 31L, true);
        assertThat(board.waitingPaused()).isTrue();
        assertThat(board.waitingIntakeMode()).isEqualTo("BOTH");
        assertThat(board.entries()).hasSize(1);
        assertThat(service.updateIntake(owner, 31L, false).waitingPaused()).isFalse();
        store.setStatus(StoreStatus.SUSPENDED);
        assertStatus(() -> service.updateIntake(owner, 31L, false), HttpStatus.CONFLICT);
        assertStatus(() -> service.updateIntake(owner, 31L, null), HttpStatus.BAD_REQUEST);
    }

    @Test
    void pausedIntakeRejectsNewTicketsButKeepsIdempotentRetriesAndExistingAdmission() {
        store.setWaitingPaused(true);
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest(null, 1, "new-ticket")), HttpStatus.CONFLICT);
        WaitingEntry existing = entry(TODAY);
        when(entries.findByStoreIdAndClientRequestId(31L, "request-1")).thenReturn(Optional.of(existing));
        assertThat(service.create(owner, 31L, new CreateWaitingRequest("팀 하나", 2, "request-1")).entryNumber()).isEqualTo(1);
        when(entries.findByIdAndStoreIdForUpdate(7L, 31L)).thenReturn(Optional.of(existing));
        assertThat(service.updateStatus(owner, 31L, 7L, new UpdateWaitingStatusRequest(WaitingStatus.CALLED)).status()).isEqualTo(WaitingStatus.CALLED);
        assertThat(service.updateStatus(owner, 31L, 7L, new UpdateWaitingStatusRequest(WaitingStatus.SEATED)).status()).isEqualTo(WaitingStatus.SEATED);
        verify(entries, never()).save(any());
        verify(entries, never()).lastEntryNumber(anyLong(), any());
    }

    @Test
    void demotedDeletedAndBannedAccountsCannotUseAnOldStoreOwnership() {
        owner.setRole(Role.USER);
        assertStatus(() -> service.getBoard(owner, 31L), HttpStatus.FORBIDDEN);
        owner.setRole(Role.BUSINESS);
        owner.softDelete();
        assertStatus(() -> service.getBoard(owner, 31L), HttpStatus.FORBIDDEN);
        owner.setDeletedAt(null);
        owner.ban("test");
        assertStatus(() -> service.getBoard(owner, 31L), HttpStatus.FORBIDDEN);
        verifyNoInteractions(stores, entries);
    }

    @Test
    void inactiveStoresCannotIntakeButTheOwnerCanCancelAnExistingTicket() {
        store.setStatus(StoreStatus.SUSPENDED);
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest(null, 1, "new-ticket")), HttpStatus.CONFLICT);
        when(entries.findByIdAndStoreIdForUpdate(7L, 31L)).thenReturn(Optional.of(entry(TODAY)));
        assertThat(service.updateStatus(owner, 31L, 7L, new UpdateWaitingStatusRequest(WaitingStatus.CANCELLED)).status())
                .isEqualTo(WaitingStatus.CANCELLED);
        verify(entries, never()).save(any());
    }

    @Test
    void deletedStoreAndTicketInAnotherStoreAreNotFound() {
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        store.softDelete();
        assertStatus(() -> service.updateStatus(owner, 31L, 7L, new UpdateWaitingStatusRequest(WaitingStatus.CALLED)), HttpStatus.NOT_FOUND);
        store.setDeletedAt(null);
        when(entries.findByIdAndStoreIdForUpdate(7L, 31L)).thenReturn(Optional.empty());
        assertStatus(() -> service.updateStatus(owner, 31L, 7L, new UpdateWaitingStatusRequest(WaitingStatus.CALLED)), HttpStatus.NOT_FOUND);
    }

    @Test
    void boardUsesKoreanMidnightAndKeepsTheOriginalDayOfOvernightActiveTickets() {
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        LocalDateTime start = LocalDateTime.parse("2026-10-04T15:00:00");
        LocalDateTime end = start.plusDays(1);
        when(entries.findBoard(31L, WaitingStatus.ACTIVE, WaitingStatus.TERMINAL, start, end))
                .thenReturn(List.of(entry(TODAY.minusDays(1))));
        var board = service.getBoard(owner, 31L);
        assertThat(board.businessDate()).isEqualTo(TODAY);
        assertThat(board.entries().getFirst().businessDate()).isEqualTo(TODAY.minusDays(1));
        assertThat(board.entries().getFirst().status()).isEqualTo(WaitingStatus.WAITING);
    }

    @Test
    void repeatedCallAndSeatPreserveTheirFirstTimestampsAndTerminalChangesConflict() {
        WaitingEntry entry = entry(TODAY);
        assertStatus(() -> entry.changeStatus(WaitingStatus.SEATED, NOW_UTC), HttpStatus.CONFLICT);
        entry.changeStatus(WaitingStatus.CALLED, NOW_UTC);
        entry.changeStatus(WaitingStatus.CALLED, NOW_UTC.plusMinutes(2));
        assertThat(entry.getCalledAt()).isEqualTo(NOW_UTC);
        entry.changeStatus(WaitingStatus.SEATED, NOW_UTC.plusMinutes(5));
        entry.changeStatus(WaitingStatus.SEATED, NOW_UTC.plusMinutes(6));
        assertThat(entry.getFinishedAt()).isEqualTo(NOW_UTC.plusMinutes(5));
        assertStatus(() -> entry.changeStatus(WaitingStatus.CANCELLED, NOW_UTC.plusMinutes(7)), HttpStatus.CONFLICT);
        assertStatus(() -> entry.changeStatus(WaitingStatus.CALLED, NOW_UTC.plusMinutes(7)), HttpStatus.CONFLICT);
    }

    @Test
    void invalidIntakeAndReturnToWaitingNeverWrite() {
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest(null, 0, "request-1")), HttpStatus.BAD_REQUEST);
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest(null, 101, "request-1")), HttpStatus.BAD_REQUEST);
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest("가".repeat(41), 2, "request-1")), HttpStatus.BAD_REQUEST);
        assertStatus(() -> service.create(owner, 31L, new CreateWaitingRequest(null, 2, "")), HttpStatus.BAD_REQUEST);
        assertStatus(() -> entry(TODAY).changeStatus(WaitingStatus.WAITING, NOW_UTC), HttpStatus.BAD_REQUEST);
        verifyNoInteractions(entries);
    }

    private static WaitingEntry entry(LocalDate date) {
        return WaitingEntry.create(31L, date, 1, "팀 하나", 2, "request-1", NOW_UTC.minusDays(1));
    }

    private static void assertStatus(Runnable action, HttpStatus expected) {
        assertThatThrownBy(action::run).isInstanceOf(WaitingException.class)
                .satisfies(error -> assertThat(((WaitingException) error).getStatus()).isEqualTo(expected));
    }
}
