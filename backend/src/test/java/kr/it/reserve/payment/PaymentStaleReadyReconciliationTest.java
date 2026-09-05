package kr.it.reserve.payment;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.StaleReadyReconciliationResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.RefundLedgerService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentStaleReadyReconciliationTest {

    private static final String MERCHANT_UID = "order-stale-ready";
    private static final int AMOUNT = 10_000;

    @Mock private PaymentRepository paymentRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private PortoneService portoneService;
    @Mock private RefundLedgerService refundLedgerService;
    @Mock private PaymentReconciliationIssueService reconciliationIssueService;

    @InjectMocks
    private PaymentService paymentService;

    @Test
    @DisplayName("취소된 예약의 오래된 READY가 PG에도 READY면 미결제가 확정되어 닫힌다")
    void closesReadyPaymentForCancelledReservation() {
        Reservation reservation = reservation(Reservation.ReservationStatus.CANCELLED);
        Payment payment = readyPayment(1L, reservation);
        when(paymentRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment("READY", AMOUNT));

        StaleReadyReconciliationResponse result = paymentService.reconcileStaleReadyPayment(1L);

        assertThat(result.outcome())
                .isEqualTo(StaleReadyReconciliationResponse.Outcome.CLOSED_AS_NOT_PAID);
        assertThat(result.localStatus()).isEqualTo("FAILED");
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.FAILED);
        verify(reconciliationIssueService).resolveForPayment(1L);
    }

    @Test
    @DisplayName("취소된 예약에서 PG PAID가 확인되면 자동 복구하지 않고 관리자 큐에 남긴다")
    void leavesLatePaidForManualReview() {
        Reservation reservation = reservation(Reservation.ReservationStatus.CANCELLED);
        Payment payment = readyPayment(2L, reservation);
        when(paymentRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment("PAID", AMOUNT));

        StaleReadyReconciliationResponse result = paymentService.reconcileStaleReadyPayment(2L);

        assertThat(result.outcome())
                .isEqualTo(StaleReadyReconciliationResponse.Outcome.MANUAL_REVIEW_REQUIRED);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
        assertThat(reservation.getDepositPaid()).isFalse();
        verify(reconciliationIssueService).record(
                "STALE_READY:2",
                PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                2L,
                100L,
                MERCHANT_UID,
                "CANCELLED");
    }

    @Test
    @DisplayName("활성 예약의 오래된 READY가 PG PAID면 결제와 예약금을 함께 복구한다")
    void recoversPaidPaymentForActiveReservation() {
        Reservation reservation = reservation(Reservation.ReservationStatus.PENDING);
        Payment payment = readyPayment(3L, reservation);
        when(paymentRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment("PAID", AMOUNT));

        StaleReadyReconciliationResponse result = paymentService.reconcileStaleReadyPayment(3L);

        assertThat(result.outcome())
                .isEqualTo(StaleReadyReconciliationResponse.Outcome.PAID_RECOVERED);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        assertThat(reservation.getDepositPaid()).isTrue();
        assertThat(reservation.getDepositAmount()).isEqualTo(AMOUNT);
        verify(reconciliationIssueService).resolveForPayment(3L);
    }

    @Test
    @DisplayName("PG 조회 장애는 READY를 유지하고 재시도 대상으로 남긴다")
    void keepsReadyWhenPgLookupFails() {
        Reservation reservation = reservation(Reservation.ReservationStatus.PENDING);
        Payment payment = readyPayment(4L, reservation);
        when(paymentRepository.findByIdForUpdate(4L)).thenReturn(Optional.of(payment));
        when(portoneService.getPaymentInfo(MERCHANT_UID))
                .thenThrow(new PaymentException("temporary failure", HttpStatus.BAD_GATEWAY));

        StaleReadyReconciliationResponse result = paymentService.reconcileStaleReadyPayment(4L);

        assertThat(result.outcome())
                .isEqualTo(StaleReadyReconciliationResponse.Outcome.RETRY_REQUIRED);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
        verify(reconciliationIssueService).record(
                "STALE_READY:4",
                PaymentReconciliationIssue.IssueType.STALE_READY_RECHECK_FAILED,
                4L,
                100L,
                MERCHANT_UID,
                "BAD_GATEWAY");
    }

    @Test
    @DisplayName("이미 정리된 결제는 PG를 다시 호출하지 않는다")
    void skipsAlreadyResolvedPayment() {
        Reservation reservation = reservation(Reservation.ReservationStatus.CANCELLED);
        Payment payment = readyPayment(5L, reservation);
        payment.failPayment("already reconciled");
        when(paymentRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(payment));

        StaleReadyReconciliationResponse result = paymentService.reconcileStaleReadyPayment(5L);

        assertThat(result.outcome())
                .isEqualTo(StaleReadyReconciliationResponse.Outcome.ALREADY_RESOLVED);
        verify(portoneService, never()).getPaymentInfo(MERCHANT_UID);
        verify(reconciliationIssueService).resolveForPayment(5L);
    }

    private Reservation reservation(Reservation.ReservationStatus status) {
        return Reservation.builder()
                .id(100L)
                .status(status)
                .store(Store.builder().autoApprovalEnabled(false).build())
                .depositPaid(false)
                .build();
    }

    private Payment readyPayment(Long id, Reservation reservation) {
        return Payment.builder()
                .id(id)
                .merchantUid(MERCHANT_UID)
                .amount(AMOUNT)
                .status(Payment.PaymentStatus.READY)
                .reservation(reservation)
                .build();
    }

    private PortoneV2PaymentResponse pgPayment(String status, int amount) {
        try {
            return new ObjectMapper().readValue("""
                    {
                      "paymentId": "order-stale-ready",
                      "status": "%s",
                      "amount": {"total": %d},
                      "method": {"type": "Card"},
                      "pgTxId": "pg-stale-ready"
                    }
                    """.formatted(status, amount), PortoneV2PaymentResponse.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
