package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.entity.*;
import kr.it.reserve.global.persistence.CurrentLockedStateTestSupport;
import kr.it.reserve.payment.repository.*;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.entity.ReservationNoShowRecord;
import kr.it.reserve.reservation.repository.ReservationNoShowRecordRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TestSettlementServiceTest {
    private static final String REQUEST = "11111111-1111-1111-1111-111111111111";
    private PaymentRepository payments;
    private TestSettlementPayoutRepository payouts;
    private PaymentReconciliationIssueRepository issues;
    private RefundAttemptRepository refunds;
    private ReservationNoShowRecordRepository noShows;
    private PortoneService pg;
    private TestSettlementService service;
    private Member owner;
    private Payment payment;

    @BeforeEach void fixture() {
        payments = mock(PaymentRepository.class); payouts = mock(TestSettlementPayoutRepository.class);
        issues = mock(PaymentReconciliationIssueRepository.class); refunds = mock(RefundAttemptRepository.class);
        noShows = mock(ReservationNoShowRecordRepository.class);
        pg = mock(PortoneService.class);
        var stores = mock(StoreRepository.class);
        var transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        owner = Member.builder().id(1L).role(Role.BUSINESS).build();
        var store = Store.builder().id(9L).owner(owner).build();
        var reservation = Reservation.builder().id(70L).store(store).reservationCode("TEST-NOSHOW")
                .reservationDate(ServiceTime.today().minusDays(1)).reservationTime(LocalTime.NOON).status(Reservation.ReservationStatus.NO_SHOW).build();
        payment = Payment.builder().id(7L).reservation(reservation).merchantUid("synthetic-payment").amount(10000)
                .status(Payment.PaymentStatus.PAID).paidAt(LocalDateTime.now()).verifiedChannelType("TEST")
                .verifiedChannelId("test-channel").verifiedStoreId("test-store").verifiedDisputed(false).build();
        when(stores.findById(9L)).thenReturn(Optional.of(store));
        when(payments.findById(7L)).thenReturn(Optional.of(payment));
        when(payouts.findById("TEST:1:" + REQUEST)).thenReturn(Optional.empty());
        var entityManager = mock(EntityManager.class);
        CurrentLockedStateTestSupport.managedEntities(entityManager);
        service = new TestSettlementService(payments, payouts, issues, refunds, mock(ReservationRepository.class), noShows,
                mock(MemberRepository.class), stores, pg, transactions, entityManager);
        ReflectionTestUtils.setField(service, "enabled", true);
    }

    @Test void anAdministratorCannotReadOrPayAnotherOwnersStore() {
        var admin = Member.builder().id(99L).role(Role.ADMIN).build();
        assertThatThrownBy(() -> service.page(9L, admin, 0, null)).isInstanceOfSatisfying(PaymentException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> service.monthlyCsv(9L, admin, YearMonth.now())).isInstanceOfSatisfying(PaymentException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> service.simulate(9L, 7L, REQUEST, admin)).isInstanceOfSatisfying(PaymentException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(pg, payments, payouts);
    }

    @Test void anUnverifiedChannelIsRejectedBeforeAnyProviderReadOrPayout() {
        payment.setVerifiedChannelType("LIVE");
        assertThatThrownBy(() -> service.simulate(9L, 7L, REQUEST, owner)).isInstanceOf(PaymentException.class);
        verifyNoInteractions(pg);
        verify(payouts, never()).save(any());
    }

    @Test void anUnconfirmedVisitHasNoPayableBalanceAndDoesNotQueryTheProvider() {
        payment.getReservation().setStatus(Reservation.ReservationStatus.UNCONFIRMED);
        assertThatThrownBy(() -> service.simulate(9L, 7L, REQUEST, owner)).isInstanceOf(PaymentException.class);
        verifyNoInteractions(pg);
        verify(payouts, never()).save(any());
    }

    @Test void unresolvedRefundWorkBlocksThePayoutBeforeAnyProviderRead() {
        when(refunds.findUnresolvedPaymentIds(List.of(7L), RefundAttempt.UNRESOLVED)).thenReturn(List.of(7L));
        assertThatThrownBy(() -> service.simulate(9L, 7L, REQUEST, owner)).isInstanceOf(PaymentException.class);
        verifyNoInteractions(pg);
        verify(payouts, never()).save(any());
    }

    @Test void anExistingRequestRecoversItsReceiptWithoutCallingTheProviderAgain() {
        var existing = new TestSettlementPayout("TEST:1:" + REQUEST, 7L, 9L, 1L, 10000, LocalDateTime.now());
        when(payouts.findById(existing.getRequestKey())).thenReturn(Optional.of(existing));
        assertThat(service.simulate(9L, 7L, REQUEST, owner).amount()).isEqualTo(10000);
        verifyNoInteractions(pg, payments);
        verify(payouts, never()).save(any());
    }

    @Test void pageMetadataUsesTheRepositoryTotalInsteadOfTheCurrentRowCount() {
        when(payments.findTestSettlementPage(9L, PageRequest.of(1, 20)))
                .thenReturn(new PageImpl<>(List.of(payment), PageRequest.of(1, 20), 41));
        var page = service.page(9L, owner, 1, null);
        assertThat(page.content()).hasSize(1);
        assertThat(page.totalElements()).isEqualTo(41);
        assertThat(page.totalPages()).isEqualTo(3);
        assertThat(page.page()).isEqualTo(1);
        assertThat(page.size()).isEqualTo(20);
        assertThat(page.hasNext()).isTrue();
        verifyNoInteractions(pg);
    }

    @Test void monthlyReportKeepsRefundAndSimulatedPaymentInTheReservationMonth() {
        var month = YearMonth.of(2025, 11);
        payment.getReservation().setReservationDate(month.atEndOfMonth());
        payment.refundPayment(2000, "partial");
        var paid = mock(TestSettlementPayoutRepository.Total.class);
        when(paid.getPaymentId()).thenReturn(7L);
        when(paid.getAmount()).thenReturn(4000L);
        when(paid.getLastPaidAt()).thenReturn(LocalDateTime.of(2025, 11, 30, 16, 15));
        when(payouts.totals(List.of(7L))).thenReturn(List.of(paid));
        when(noShows.findByReservationIdIn(List.of(70L))).thenReturn(List.of(
                new ReservationNoShowRecord(70L, 1L, 9L, month.atEndOfMonth().atTime(18, 30))));
        when(payments.findTestSettlementMonthBatch(9L, month.atDay(1), month.atEndOfMonth(), null, PageRequest.of(0, 200)))
                .thenReturn(List.of(payment));

        assertThat(service.monthly(9L, owner, month)).isEqualTo(
                new TestSettlementService.MonthlySummary("2025-11", 10000, 2000, 4000, 4000, 0, 1));
        assertThat(service.monthlyCsv(9L, owner, month)).startsWith("\uFEFF환경,")
                .contains("TEST,\"TEST-NOSHOW\",2025-11-30,2025-11-30,10000,2000,0,4000,4000,2025-12-01,0,READY\r\n");
        when(refunds.findUnresolvedPaymentIds(List.of(7L), RefundAttempt.UNRESOLVED)).thenReturn(List.of(7L));
        assertThat(service.monthly(9L, owner, month).payableAmount()).isZero();
        verifyNoInteractions(pg);
    }
}
