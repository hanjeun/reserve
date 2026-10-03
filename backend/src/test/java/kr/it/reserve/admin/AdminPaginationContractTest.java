package kr.it.reserve.admin;

import kr.it.reserve.audit.controller.AdminManagementController;
import kr.it.reserve.audit.service.AdminSanctionService;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.controller.PaymentOperationsAdminController;
import kr.it.reserve.payment.controller.RefundLedgerAdminController;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PaymentWebhookInboxProcessor;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class AdminPaginationContractTest {
    private static final long TOTAL_ROWS = 937;
    private static final LocalDateTime FIXTURE_TIME = LocalDateTime.of(2026, 1, 2, 3, 4);

    private final MemberRepository members = mock(MemberRepository.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final AdminSanctionService sanctions = mock(AdminSanctionService.class);
    private final PaymentReconciliationIssueRepository issues = mock(PaymentReconciliationIssueRepository.class);
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final PaymentWebhookInboxRepository inbox = mock(PaymentWebhookInboxRepository.class);
    private final PaymentWebhookInboxProcessor processor = mock(PaymentWebhookInboxProcessor.class);
    private final PaymentService paymentService = mock(PaymentService.class);
    private final RefundAttemptRepository refunds = mock(RefundAttemptRepository.class);

    private final AdminManagementController management = new AdminManagementController(
            members, stores, audit, sanctions);
    private final PaymentOperationsAdminController operations = new PaymentOperationsAdminController(
            issues, payments, inbox, processor, paymentService);
    private final RefundLedgerAdminController refundLedger = new RefundLedgerAdminController(refunds);

    @ParameterizedTest
    @MethodSource("managementRequests")
    void memberQueryBoundsDatabasePageAndKeepsTrimmedSearchAndResponse(
            int page, int size, String search, int expectedPage, int expectedSize, String keyword) {
        Member member = Member.builder().id(41L).name("조회회원").email("query@example.test")
                .role(Role.USER).provider(AuthProvider.LOCAL).build();
        if (keyword.isEmpty()) {
            when(members.findByDeletedAtIsNullOrderByIdDesc(any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(member, call.getArgument(0)));
        } else {
            when(members.searchByNameOrEmail(eq(keyword), any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(member, call.getArgument(1)));
        }

        Page<?> result = assertPageResponse(management.getMembers(page, size, search),
                "회원 목록 조회 성공", expectedPage, expectedSize);

        assertThat(result.getContent().getFirst()).isEqualTo(Map.of(
                "id", 41L, "name", "조회회원", "email", "query@example.test",
                "role", "USER", "provider", "LOCAL", "status", "ACTIVE",
                "suspendedUntil", "", "suspendReason", ""));
        PageRequest expected = PageRequest.of(expectedPage, expectedSize);
        if (keyword.isEmpty()) {
            verify(members).findByDeletedAtIsNullOrderByIdDesc(expected);
        } else {
            verify(members).searchByNameOrEmail(keyword, expected);
        }
        verifyNoMoreInteractions(members);
        verifyNoInteractions(stores, audit, sanctions);
    }

    @ParameterizedTest
    @MethodSource("managementRequests")
    void storeQueryBoundsDatabasePageAndKeepsTrimmedSearchAndResponse(
            int page, int size, String search, int expectedPage, int expectedSize, String keyword) {
        Store store = Store.builder().id(52L).name("조회가게")
                .owner(Member.builder().id(41L).build()).build();
        when(stores.searchForAdmin(eq(keyword), any(Pageable.class)))
                .thenAnswer(call -> fixturePage(store, call.getArgument(1)));

        Page<?> result = assertPageResponse(management.getStores(page, size, search),
                "가게 목록 조회 성공", expectedPage, expectedSize);

        assertThat(result.getContent().getFirst()).isInstanceOfSatisfying(StoreResponse.class, dto -> {
            assertThat(dto.getId()).isEqualTo(52L);
            assertThat(dto.getName()).isEqualTo("조회가게");
            assertThat(dto.getOwnerId()).isEqualTo(41L);
        });
        verify(stores).searchForAdmin(keyword, PageRequest.of(expectedPage, expectedSize));
        verifyNoMoreInteractions(stores);
        verifyNoInteractions(members, audit, sanctions);
    }

    @ParameterizedTest
    @MethodSource("queueRequests")
    void issueQueueBoundsDatabasePageAndKeepsOpenFilterAndLatestFirstQuery(
            int page, int size, boolean openOnly, int expectedPage, int expectedSize) {
        PaymentReconciliationIssue issue = PaymentReconciliationIssue.open("contract-issue",
                PaymentReconciliationIssue.IssueType.STALE_READY_STILL_PENDING,
                63L, 74L, "contract-payment", "PG_PENDING", FIXTURE_TIME);
        if (openOnly) {
            when(issues.findByStatusOrderByLastSeenAtDesc(
                    eq(PaymentReconciliationIssue.IssueStatus.OPEN), any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(issue, call.getArgument(1)));
        } else {
            when(issues.findAllByOrderByLastSeenAtDesc(any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(issue, call.getArgument(0)));
        }

        var response = operations.issues(page, size, openOnly);
        assertPageResponse(response, "조회 성공", expectedPage, expectedSize);
        var dto = response.getData().getContent().getFirst();
        assertThat(dto.paymentId()).isEqualTo(63L);
        assertThat(dto.issueType()).isEqualTo("STALE_READY_STILL_PENDING");
        assertThat(dto.status()).isEqualTo("OPEN");
        assertThat(dto.lastSeenAt()).isEqualTo(FIXTURE_TIME);
        PageRequest expected = PageRequest.of(expectedPage, expectedSize);
        if (openOnly) {
            verify(issues).findByStatusOrderByLastSeenAtDesc(PaymentReconciliationIssue.IssueStatus.OPEN, expected);
        } else {
            verify(issues).findAllByOrderByLastSeenAtDesc(expected);
        }
        verifyNoMoreInteractions(issues);
        verifyNoInteractions(payments, inbox, processor, paymentService);
    }

    @ParameterizedTest
    @MethodSource("queueRequests")
    void webhookQueueBoundsDatabasePageAndKeepsUnfinishedFilterAndLatestFirstQuery(
            int page, int size, boolean unfinishedOnly, int expectedPage, int expectedSize) {
        PaymentWebhookInbox webhook = PaymentWebhookInbox.receive(
                "contract-webhook", "Transaction.Paid", "contract-payment", "fixture-hash", FIXTURE_TIME);
        if (unfinishedOnly) {
            when(inbox.findByStatusInOrderByReceivedAtDesc(eq(PaymentWebhookInbox.UNFINISHED), any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(webhook, call.getArgument(1)));
        } else {
            when(inbox.findAllByOrderByReceivedAtDesc(any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(webhook, call.getArgument(0)));
        }

        var response = operations.webhooks(page, size, unfinishedOnly);
        assertPageResponse(response, "조회 성공", expectedPage, expectedSize);
        var dto = response.getData().getContent().getFirst();
        assertThat(dto.webhookId()).isEqualTo("contract-webhook");
        assertThat(dto.status()).isEqualTo("RECEIVED");
        assertThat(dto.nextRetryAt()).isEqualTo(FIXTURE_TIME);
        PageRequest expected = PageRequest.of(expectedPage, expectedSize);
        if (unfinishedOnly) {
            verify(inbox).findByStatusInOrderByReceivedAtDesc(PaymentWebhookInbox.UNFINISHED, expected);
        } else {
            verify(inbox).findAllByOrderByReceivedAtDesc(expected);
        }
        verifyNoMoreInteractions(inbox);
        verifyNoInteractions(issues, payments, processor, paymentService);
    }

    @ParameterizedTest
    @CsvSource({
            "3, 2147483647, 2147483647, 3, 100, 3650",
            "-2, -2147483648, -2147483648, 0, 1, 1",
            "2, 23, 7, 2, 23, 7",
            "0, 0, 0, 0, 1, 1"
    })
    void staleReadyQueueBoundsDatabasePageAndDateCutoffWithoutCallingPg(
            int page, int size, int olderThanDays, int expectedPage, int expectedSize, int expectedDays) {
        Payment payment = Payment.builder().id(63L).merchantUid("contract-payment").amount(10_000)
                .reservation(Reservation.builder().id(74L).status(Reservation.ReservationStatus.CANCELLED).build())
                .createdAt(FIXTURE_TIME).updatedAt(FIXTURE_TIME).build();
        when(payments.findStaleReadyPayments(any(LocalDateTime.class), any(Pageable.class)))
                .thenAnswer(call -> fixturePage(payment, call.getArgument(1)));

        LocalDateTime beforeCall = LocalDateTime.now();
        var response = operations.staleReadyPayments(page, size, olderThanDays);
        LocalDateTime afterCall = LocalDateTime.now();

        assertPageResponse(response, "오래된 결제 준비 목록 조회 성공", expectedPage, expectedSize);
        var dto = response.getData().getContent().getFirst();
        assertThat(dto.paymentId()).isEqualTo(63L);
        assertThat(dto.reservationId()).isEqualTo(74L);
        assertThat(dto.reservationStatus()).isEqualTo("CANCELLED");
        assertThat(dto.createdAt()).isEqualTo(FIXTURE_TIME);
        ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(payments).findStaleReadyPayments(cutoff.capture(), eq(PageRequest.of(expectedPage, expectedSize)));
        assertThat(cutoff.getValue()).isBetween(beforeCall.minusDays(expectedDays), afterCall.minusDays(expectedDays));
        verifyNoMoreInteractions(payments);
        verifyNoInteractions(issues, inbox, processor, paymentService);
    }

    @ParameterizedTest
    @MethodSource("queueRequests")
    void refundQueueBoundsDatabasePageAndKeepsUnresolvedFilterAndLatestFirstQuery(
            int page, int size, boolean unresolvedOnly, int expectedPage, int expectedSize) {
        RefundAttempt attempt = RefundAttempt.start(63L, "contract-payment", 10_000, "계약 확인");
        if (unresolvedOnly) {
            when(refunds.findByStatusInOrderByCreatedAtDesc(eq(RefundAttempt.UNRESOLVED), any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(attempt, call.getArgument(1)));
        } else {
            when(refunds.findAllByOrderByCreatedAtDesc(any(Pageable.class)))
                    .thenAnswer(call -> fixturePage(attempt, call.getArgument(0)));
        }

        var response = refundLedger.list(page, size, unresolvedOnly);
        assertPageResponse(response, "조회 성공", expectedPage, expectedSize);
        var dto = response.getData().getContent().getFirst();
        assertThat(dto.paymentId()).isEqualTo(63L);
        assertThat(dto.requestedAmount()).isEqualTo(10_000);
        assertThat(dto.status()).isEqualTo("REQUESTED");
        assertThat(dto.reason()).isEqualTo("계약 확인");
        PageRequest expected = PageRequest.of(expectedPage, expectedSize);
        if (unresolvedOnly) {
            verify(refunds).findByStatusInOrderByCreatedAtDesc(RefundAttempt.UNRESOLVED, expected);
        } else {
            verify(refunds).findAllByOrderByCreatedAtDesc(expected);
        }
        verifyNoMoreInteractions(refunds);
    }

    @Test
    void queueCountsAndPaymentHistoryKeepTheirReadOnlyResponses() {
        RefundAttempt attempt = RefundAttempt.start(63L, "contract-payment", 10_000, "계약 확인");
        when(issues.countByStatus(PaymentReconciliationIssue.IssueStatus.OPEN)).thenReturn(4L);
        when(inbox.countByStatusIn(PaymentWebhookInbox.UNFINISHED)).thenReturn(5L);
        when(refunds.countByStatusIn(RefundAttempt.UNRESOLVED)).thenReturn(6L);
        when(refunds.findByPaymentIdOrderByCreatedAtAsc(63L)).thenReturn(List.of(attempt));

        assertCountResponse(operations.openIssueCount(), 4L);
        assertCountResponse(operations.unfinishedWebhookCount(), 5L);
        assertCountResponse(refundLedger.unresolvedCount(), 6L);
        var history = refundLedger.byPayment(63L);
        assertThat(history.isSuccess()).isTrue();
        assertThat(history.getMessage()).isEqualTo("조회 성공");
        assertThat(history.getData()).hasSize(1);
        assertThat(history.getData().getFirst().paymentId()).isEqualTo(63L);

        verify(issues).countByStatus(PaymentReconciliationIssue.IssueStatus.OPEN);
        verify(inbox).countByStatusIn(PaymentWebhookInbox.UNFINISHED);
        verify(refunds).countByStatusIn(RefundAttempt.UNRESOLVED);
        verify(refunds).findByPaymentIdOrderByCreatedAtAsc(63L);
        verifyNoMoreInteractions(issues, inbox, refunds);
        verifyNoInteractions(payments, processor, paymentService);
    }

    private static Stream<Arguments> managementRequests() {
        return Stream.of(
                Arguments.of(3, Integer.MAX_VALUE, "  query@example.test  ", 3, 100, "query@example.test"),
                Arguments.of(-2, Integer.MIN_VALUE, null, 0, 1, ""),
                Arguments.of(2, 23, " \t ", 2, 23, ""),
                Arguments.of(0, 0, "  조회  ", 0, 1, "조회"));
    }

    private static Stream<Arguments> queueRequests() {
        return Stream.of(
                Arguments.of(3, Integer.MAX_VALUE, true, 3, 100),
                Arguments.of(-2, Integer.MIN_VALUE, false, 0, 1),
                Arguments.of(2, 23, false, 2, 23),
                Arguments.of(0, 0, true, 0, 1));
    }

    private static <T> Page<T> fixturePage(T row, Pageable pageable) {
        return new PageImpl<>(List.of(row), pageable, TOTAL_ROWS);
    }

    private static Page<?> assertPageResponse(ApiResponse<?> response, String message, int page, int size) {
        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getMessage()).isEqualTo(message);
        assertThat(response.getData()).isInstanceOf(Page.class);
        Page<?> result = (Page<?>) response.getData();
        // Repository methods/JPQL own ordering; adding a Pageable sort would change that contract.
        assertThat(result.getPageable()).isEqualTo(PageRequest.of(page, size));
        assertThat(result.getTotalElements()).isEqualTo(TOTAL_ROWS);
        assertThat(result.getContent()).hasSize(1);
        return result;
    }

    private static void assertCountResponse(ApiResponse<Long> response, long count) {
        assertThat(response.isSuccess()).isTrue();
        assertThat(response.getMessage()).isEqualTo("조회 성공");
        assertThat(response.getData()).isEqualTo(count);
    }
}
