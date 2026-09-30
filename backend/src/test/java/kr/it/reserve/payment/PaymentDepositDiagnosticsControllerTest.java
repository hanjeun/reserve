package kr.it.reserve.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.payment.controller.PaymentOperationsAdminController;
import kr.it.reserve.payment.dto.ReservationDepositInvariantResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PaymentWebhookInboxProcessor;
import kr.it.reserve.reservation.entity.Reservation.ReservationStatus;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PaymentDepositDiagnosticsControllerTest {
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final PaymentReconciliationIssueRepository issues = mock(PaymentReconciliationIssueRepository.class);
    private final PaymentWebhookInboxRepository inbox = mock(PaymentWebhookInboxRepository.class);
    private final PaymentWebhookInboxProcessor processor = mock(PaymentWebhookInboxProcessor.class);
    private final PaymentService service = mock(PaymentService.class);
    private final PaymentOperationsAdminController controller = new PaymentOperationsAdminController(
            issues, payments, inbox, processor, service);

    @Test
    void emptyPageDoesNotReadAnUnboundedLedgerOrCallPaymentWriters() {
        when(payments.findReservationDepositInvariantViolations(any())).thenReturn(Page.empty(PageRequest.of(0, 1)));
        var response = controller.depositInvariants(-5, 0);
        assertThat(response.getData()).isEmpty();
        verify(payments).findReservationDepositInvariantViolations(PageRequest.of(0, 1));
        verifyNoMoreInteractions(payments);
        verifyNoInteractions(issues, inbox, processor, service);
    }

    @Test
    void largePageIsCappedAndLedgerReadIsLimitedToPageIdsWithoutPersonalIdentifiers() throws Exception {
        var reservation = mock(PaymentRepository.DepositInvariantReservation.class);
        when(reservation.getReservationId()).thenReturn(7L);
        when(reservation.getStoreId()).thenReturn(8L);
        when(reservation.getReservationStatus()).thenReturn(ReservationStatus.CANCELLED);
        when(reservation.getDepositPaid()).thenReturn(true);
        var ledger = mock(PaymentRepository.DepositInvariantLedgerSummary.class);
        when(ledger.getReservationId()).thenReturn(7L);
        when(ledger.getPaymentStatus()).thenReturn(Payment.PaymentStatus.REFUNDED);
        when(ledger.getPaymentCount()).thenReturn(1L);
        when(ledger.getConfirmedNetAmount()).thenReturn(0L);
        when(ledger.getConfirmedRefundAmount()).thenReturn(10_000L);
        when(ledger.getPositiveBalancePaymentCount()).thenReturn(0L);
        when(payments.findReservationDepositInvariantViolations(any())).thenReturn(
                new PageImpl<>(List.of(reservation), PageRequest.of(0, 100), 1));
        when(payments.summarizeConfirmedDepositLedger(List.of(7L))).thenReturn(List.of(ledger));

        var result = controller.depositInvariants(-1, 1_000).getData().getContent().getFirst();
        assertThat(result.direction()).isEqualTo(ReservationDepositInvariantResponse.Direction.DEPOSIT_PAID_WITHOUT_POSITIVE_LEDGER);
        assertThat(result.confirmedRefundAmount()).isEqualTo(10_000);
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(result);
        assertThat(json).doesNotContain("merchantUid", "impUid", "buyer", "email", "member", "specialRequest");
        verify(payments).findReservationDepositInvariantViolations(PageRequest.of(0, 100));
        verify(payments).summarizeConfirmedDepositLedger(List.of(7L));
        verifyNoMoreInteractions(payments);
        verifyNoInteractions(issues, inbox, processor, service);
    }

    @Test
    void excessivePageOffsetIsRejectedBeforeAnyRepositoryOrWriterCall() {
        assertThatThrownBy(() -> controller.depositInvariants(Integer.MAX_VALUE, 100))
                .isInstanceOf(BusinessException.class)
                .hasMessage("조회 가능한 페이지 범위를 초과했습니다.");
        verifyNoInteractions(payments, issues, inbox, processor, service);
    }

    @Test
    void directionUsesTheMatchedFlagAndPositiveRowCountRatherThanTheOverallSum() {
        var reservation = mock(PaymentRepository.DepositInvariantReservation.class);
        when(reservation.getReservationId()).thenReturn(7L);
        when(reservation.getDepositPaid()).thenReturn(false);
        var positive = mock(PaymentRepository.DepositInvariantLedgerSummary.class);
        when(positive.getPaymentStatus()).thenReturn(Payment.PaymentStatus.PAID);
        when(positive.getPaymentCount()).thenReturn(1L);
        when(positive.getConfirmedNetAmount()).thenReturn(1_000L);
        when(positive.getConfirmedRefundAmount()).thenReturn(0L);
        when(positive.getPositiveBalancePaymentCount()).thenReturn(1L);
        var negative = mock(PaymentRepository.DepositInvariantLedgerSummary.class);
        when(negative.getPaymentStatus()).thenReturn(Payment.PaymentStatus.REFUNDED);
        when(negative.getPaymentCount()).thenReturn(1L);
        when(negative.getConfirmedNetAmount()).thenReturn(-1_000L);
        when(negative.getConfirmedRefundAmount()).thenReturn(2_000L);
        when(negative.getPositiveBalancePaymentCount()).thenReturn(0L);
        var result = ReservationDepositInvariantResponse.from(reservation, List.of(positive, negative));
        assertThat(result.confirmedNetAmount()).isZero();
        assertThat(result.positiveBalancePaymentCount()).isEqualTo(1);
        assertThat(result.direction()).isEqualTo(
                ReservationDepositInvariantResponse.Direction.POSITIVE_LEDGER_WITHOUT_DEPOSIT_PAID);
        assertThat(PaymentRepository.RESERVATION_DEPOSIT_INVARIANT_PREDICATE)
                .contains("NOT EXISTS", "AND EXISTS").doesNotContain("SUM(");
        verifyNoInteractions(payments, issues, inbox, processor, service);
    }
}
