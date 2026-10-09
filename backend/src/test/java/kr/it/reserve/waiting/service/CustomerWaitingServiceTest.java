package kr.it.reserve.waiting.service;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.*;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.waiting.dto.JoinWaitingRequest;
import kr.it.reserve.waiting.entity.*;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import kr.it.reserve.waiting.util.WaitingQrTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.mockito.ArgumentCaptor;

import java.time.*;
import java.util.Optional;
import java.util.List;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
class CustomerWaitingServiceTest {
    @Mock WaitingEntryRepository entries;
    @Mock StoreRepository stores;
    @Mock MemberRepository members;
    @Mock WaitingEventPublisher events;
    @Mock WaitingRetentionService retention;
    private CustomerWaitingService customer;
    private WaitingQrTokenProvider tokens;
    private Member member;
    private Member owner;
    private Store store;
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-07T15:01:00Z"), ZoneOffset.UTC);

    @BeforeEach void setup() {
        JwtProperties properties = new JwtProperties(); properties.setSecretKey("test-key-for-waiting-purpose-isolation-".repeat(3));
        tokens = new WaitingQrTokenProvider(properties, clock);
        WaitingService staff = new WaitingService(entries, stores, clock, events);
        customer = new CustomerWaitingService(entries, stores, members, staff, tokens, events, retention, clock);
        lenient().when(retention.customerPolicy()).thenReturn(new WaitingRetentionService.CustomerPolicy(
                Instant.parse("2026-10-07T09:00:00Z"), true, 7));
        member = Member.builder().id(7L).name("손님").role(Role.USER).build();
        owner = Member.builder().id(8L).role(Role.BUSINESS).build();
        store = Store.builder().id(31L).owner(owner).status(StoreStatus.ACTIVE).waitingIntakeMode(WaitingIntakeMode.REMOTE).build();
    }
    private void intake() {
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
    }
    private JoinWaitingRequest request(String token) { return new JoinWaitingRequest(2, "retry-one", token, true, Instant.parse("2026-10-07T09:00:00Z")); }
    private WaitingEntry ticket(WaitingStatus status) {
        WaitingEntry entry = WaitingEntry.createForCustomer(31L, LocalDate.of(2026, 10, 8), 4, "손님", 2, "retry-one",
                LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC), 7L, WaitingSource.REMOTE, LocalDateTime.parse("2026-10-07T09:00:00"));
        ReflectionTestUtils.setField(entry, "id", 91L);
        if (status != WaitingStatus.WAITING) entry.changeStatus(WaitingStatus.CALLED, LocalDateTime.now(clock));
        if (status.isTerminal()) entry.changeStatus(status, LocalDateTime.now(clock));
        return entry;
    }

    @Test void remoteCustomerAndStaffShareTheLockedNumberSequenceAndUtcClock() {
        intake(); when(entries.lastEntryNumber(31L, LocalDate.of(2026, 10, 8))).thenReturn(3);
        when(entries.save(any())).thenAnswer(call -> { WaitingEntry entry = call.getArgument(0); ReflectionTestUtils.setField(entry, "id", 91L); return entry; });
        var saved = customer.join(member, 31L, request(null));
        assertThat(saved.entryNumber()).isEqualTo(4);
        assertThat(saved.businessDate()).isEqualTo(LocalDate.of(2026, 10, 8));
        assertThat(saved.createdAt().toInstant()).isEqualTo(clock.instant());
        var created = org.mockito.ArgumentCaptor.forClass(WaitingEntry.class);
        verify(entries).save(created.capture());
        assertThat(created.getValue().getPrivacyNoticePublishedAt()).isEqualTo(LocalDateTime.parse("2026-10-07T09:00:00"));
        var order = inOrder(members, stores, entries, events);
        order.verify(members).findActiveByIdForUpdate(7L); order.verify(stores).findByIdForUpdate(31L);
        order.verify(entries).findByStoreIdAndClientRequestId(31L, "retry-one");
        verify(events).changed(eq(store), any());
    }
    @Test void retryReturnsOwnOriginalEvenAfterIntakeIsTurnedOffWithoutNewWrites() {
        intake(); store.setWaitingIntakeMode(WaitingIntakeMode.OFF);
        when(entries.findByStoreIdAndClientRequestId(31L, "retry-one")).thenReturn(Optional.of(ticket(WaitingStatus.WAITING)));
        assertThat(customer.join(member, 31L, request(null)).id()).isEqualTo(91L);
        verify(entries, never()).save(any()); verifyNoInteractions(events);
    }
    @Test void anotherMemberCannotReuseAnIdempotencyKey() {
        intake(); WaitingEntry other = ticket(WaitingStatus.WAITING); ReflectionTestUtils.setField(other, "memberId", 99L);
        when(entries.findByStoreIdAndClientRequestId(31L, "retry-one")).thenReturn(Optional.of(other));
        assertThatThrownBy(() -> customer.join(member, 31L, request(null))).isInstanceOf(WaitingException.class);
        verify(entries, never()).save(any());
    }
    @Test void pausedIntakeRejectsRemoteAndOnsiteTicketsAndQrButRetainsTheOriginalRetry() {
        intake(); store.setWaitingPaused(true);
        assertThatThrownBy(() -> customer.join(member, 31L, request(null)))
                .isInstanceOf(WaitingException.class).hasMessageContaining("중지");
        store.setWaitingIntakeMode(WaitingIntakeMode.BOTH);
        assertThatThrownBy(() -> customer.join(member, 31L, request(tokens.issueOnsite(31L).token())))
                .isInstanceOf(WaitingException.class).hasMessageContaining("중지");
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        assertThatThrownBy(() -> customer.onsiteQr(owner, 31L)).isInstanceOf(WaitingException.class);
        when(entries.findByStoreIdAndClientRequestId(31L, "retry-one")).thenReturn(Optional.of(ticket(WaitingStatus.WAITING)));
        assertThat(customer.join(member, 31L, request(null)).id()).isEqualTo(91L);
        verify(entries, never()).save(any()); verifyNoInteractions(events);
    }
    @Test void aNewRequestIdDoesNotAllowADuplicateActiveTicket() {
        intake(); when(entries.existsByStoreIdAndMemberIdAndStatusIn(31L, 7L, WaitingStatus.ACTIVE)).thenReturn(true);
        assertThatThrownBy(() -> customer.join(member, 31L, request(null))).isInstanceOf(WaitingException.class).hasMessageContaining("이미");
        verify(entries, never()).save(any());
    }
    @Test void onsiteOnlyRequiresACurrentQrForThisStoreAndRejectsAnotherStore() {
        intake(); store.setWaitingIntakeMode(WaitingIntakeMode.ONSITE);
        assertThatThrownBy(() -> customer.join(member, 31L, request(null))).hasMessageContaining("현장");
        assertThatThrownBy(() -> customer.join(member, 31L, request(tokens.issueOnsite(32L).token()))).isInstanceOf(WaitingException.class);
        when(entries.save(any())).thenAnswer(call -> call.getArgument(0));
        customer.join(member, 31L, request(tokens.issueOnsite(31L).token()));
        var captor = org.mockito.ArgumentCaptor.forClass(WaitingEntry.class); verify(entries).save(captor.capture());
        assertThat(captor.getValue().getSource()).isEqualTo(WaitingSource.ONSITE);
    }
    @Test void calledQrIsPrivateAndWaitingOrCancelledTicketsCannotIssueOne() {
        when(entries.findById(91L)).thenReturn(Optional.of(ticket(WaitingStatus.WAITING)));
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        assertThatThrownBy(() -> customer.entryQr(member, 91L)).hasMessageContaining("호출");
        assertThatThrownBy(() -> customer.entryQr(owner, 91L)).hasMessageContaining("내 대기");
    }
    @Test void checkinUsesLatestLockedStateAndIsIdempotentButCannotSeatAnUncalledTicket() {
        store.setWaitingPaused(true);
        when(entries.findStoreId(91L)).thenReturn(Optional.of(31L));
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        WaitingEntry latest = ticket(WaitingStatus.WAITING);
        when(entries.findByIdAndStoreIdForUpdate(91L, 31L)).thenReturn(Optional.of(latest));
        String token = tokens.issueEntry(91L, 7L).token();
        assertThatThrownBy(() -> customer.checkin(owner, token)).hasMessageContaining("호출");
        latest.changeStatus(WaitingStatus.CALLED, LocalDateTime.now(clock));
        assertThat(customer.checkin(owner, token).alreadyCheckedIn()).isFalse();
        assertThat(customer.checkin(owner, token).alreadyCheckedIn()).isTrue();
        assertThat(latest.getStatus()).isEqualTo(WaitingStatus.SEATED);
    }
    @Test void anotherOwnerCannotScanAndAnonymousOrWithdrawnCustomersCannotJoin() {
        when(entries.findStoreId(91L)).thenReturn(Optional.of(31L));
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        Member otherOwner = Member.builder().id(9L).role(Role.BUSINESS).build();
        assertThatThrownBy(() -> customer.checkin(otherOwner, tokens.issueEntry(91L, 7L).token())).hasMessageContaining("내 가게");
        assertThatThrownBy(() -> customer.join(null, 31L, request(null))).isInstanceOf(WaitingException.class);
        member.softDelete(); assertThatThrownBy(() -> customer.join(member, 31L, request(null))).isInstanceOf(WaitingException.class);
        verifyNoInteractions(members);
    }
    @Test void cancellationCannotReopenOrOverwriteASeatedTicketAndCannotTargetOthers() {
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        assertThatThrownBy(() -> customer.cancel(member, 91L)).hasMessageContaining("내 대기");
        when(entries.findCustomerStoreId(91L, 7L)).thenReturn(Optional.of(31L));
        when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        WaitingEntry seated = ticket(WaitingStatus.SEATED);
        when(entries.findByIdAndStoreIdForUpdate(91L, 31L)).thenReturn(Optional.of(seated));
        assertThatThrownBy(() -> customer.cancel(member, 91L)).isInstanceOf(WaitingException.class);
        assertThat(seated.getStatus()).isEqualTo(WaitingStatus.SEATED); verifyNoInteractions(events);
    }

    @Test void customerPublicationAndConsentAreRequiredForNewEntriesButNeverErasePriorIntake() {
        intake();
        when(retention.customerPolicy()).thenReturn(new WaitingRetentionService.CustomerPolicy(null, false, 7));
        assertThatThrownBy(() -> customer.join(member, 31L, request(null)))
                .isInstanceOf(WaitingException.class).hasMessageContaining("준비 중");
        when(entries.findByStoreIdAndClientRequestId(31L, "retry-one")).thenReturn(Optional.of(ticket(WaitingStatus.WAITING)));
        assertThat(customer.join(member, 31L, request(null)).id()).isEqualTo(91L);
        verify(entries, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test void absentConsentOrAnOutdatedNoticeCannotCreateAnEntry() {
        intake();
        assertThatThrownBy(() -> customer.join(member, 31L, new JoinWaitingRequest(2, "retry-one", null, false,
                Instant.parse("2026-10-07T09:00:00Z")))).hasMessageContaining("동의");
        assertThatThrownBy(() -> customer.join(member, 31L, new JoinWaitingRequest(2, "retry-one", null, true,
                Instant.parse("2026-10-04T09:44:15Z")))).hasMessageContaining("안내");
        verify(entries, never()).save(any());
    }

    @Test void personalListDefaultsPreserveTheExistingOwnerAndKoreanDayBoundaryWithBoundedPages() {
        when(entries.findPersonal(eq(7L), eq(WaitingStatus.ACTIVE), eq(LocalDateTime.parse("2026-10-07T15:00:00")), any()))
                .thenReturn(Page.empty());
        customer.mine(member, -1, 1000);
        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(entries).findPersonal(eq(7L), eq(WaitingStatus.ACTIVE), eq(LocalDateTime.parse("2026-10-07T15:00:00")), page.capture());
        assertThat(page.getValue().getPageNumber()).isZero();
        assertThat(page.getValue().getPageSize()).isEqualTo(100);
        verify(entries, never()).findPersonalFiltered(any(), any(), any(), any(), any(), any(), any());
        verifyNoInteractions(stores);
    }

    @Test void personalFiltersEscapeSearchAndMapTheServerPageWithoutChangingTeamsAhead() {
        WaitingEntry entry = ticket(WaitingStatus.WAITING);
        when(entries.findPersonalFiltered(eq(7L), eq(Set.of("WAITING", "CALLED")), eq(LocalDateTime.parse("2026-10-07T15:00:00")),
                eq("WAITING"), eq("%예약!%!_!!%"), eq("oldest"), any()))
                .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 45));
        store.setName("예약%_!");
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        when(entries.teamsAhead(31L, WaitingStatus.ACTIVE, entry.getBusinessDate(), entry.getEntryNumber())).thenReturn(5L);
        var result = customer.mine(member, 0, 20, " 예약%_! ", "WAITING", "oldest");
        assertThat(result.getTotalElements()).isEqualTo(45);
        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getContent().getFirst().entry().id()).isEqualTo(91L);
        assertThat(result.getContent().getFirst().storeName()).isEqualTo("예약%_!");
        assertThat(result.getContent().getFirst().teamsAhead()).isEqualTo(5);
        verify(entries, never()).findPersonal(any(), any(), any(), any());
    }

    @Test void invalidPersonalFiltersAndUnavailableMembersCannotReachTheRepository() {
        assertThatThrownBy(() -> customer.mine(member, 0, 20, "가".repeat(101), "ALL", "recent")).hasMessageContaining("100자");
        assertThatThrownBy(() -> customer.mine(member, 0, 20, "", "waiting", "recent")).hasMessageContaining("상태");
        assertThatThrownBy(() -> customer.mine(member, 0, 20, "", "ALL", "visit")).hasMessageContaining("정렬");
        assertThatThrownBy(() -> customer.mine(member, Integer.MAX_VALUE, 100, "", "WAITING", "oldest")).hasMessageContaining("페이지");
        assertThatThrownBy(() -> customer.mine(null, 0, 20, "", "ALL", "recent")).hasMessageContaining("로그인");
        member.suspend(null, "test");
        assertThatThrownBy(() -> customer.mine(member, 0, 20, "", "ALL", "recent")).hasMessageContaining("로그인");
        member.softDelete();
        assertThatThrownBy(() -> customer.mine(member, 0, 20)).hasMessageContaining("로그인");
        verifyNoInteractions(entries, stores);
    }
}
