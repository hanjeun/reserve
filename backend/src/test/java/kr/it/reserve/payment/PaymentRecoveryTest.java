package kr.it.reserve.payment;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
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

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentRecoveryTest {

    private static final String MERCHANT_UID = "order-payment-recovery";
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
    @DisplayName("웹훅이 확인한 PAID는 READY 결제와 예약금 상태를 함께 복구한다")
    void paidWebhookRecoversReadyPayment() {
        Reservation reservation = payableReservation(Reservation.ReservationStatus.PENDING);
        Payment payment = readyPayment(1L, reservation);
        PortoneV2PaymentResponse pgPayment = paidPgPayment();
        when(paymentRepository.findByMerchantUidForUpdate(MERCHANT_UID)).thenReturn(Optional.of(payment));

        PaymentService.PaidRecoveryResult result =
                paymentService.recoverPaidPaymentFromPg(MERCHANT_UID, pgPayment);

        assertThat(result).isEqualTo(PaymentService.PaidRecoveryResult.RECOVERED);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        assertThat(payment.getImpUid()).isEqualTo("pg-tx-1");
        assertThat(reservation.getDepositPaid()).isTrue();
        assertThat(reservation.getDepositAmount()).isEqualTo(AMOUNT);
        verify(reconciliationIssueService).resolveForPayment(1L);
    }

    @Test
    @DisplayName("이미 PAID인 결제는 중복 반영하지 않고 빠진 예약금 플래그만 복구한다")
    void alreadyPaidWebhookRepairsReservationOnly() {
        Reservation reservation = payableReservation(Reservation.ReservationStatus.CONFIRMED);
        Payment payment = readyPayment(2L, reservation);
        payment.completePayment("existing-pg-tx", "Card", "Card");
        when(paymentRepository.findByMerchantUidForUpdate(MERCHANT_UID)).thenReturn(Optional.of(payment));

        PaymentService.PaidRecoveryResult result =
                paymentService.recoverPaidPaymentFromPg(MERCHANT_UID, paidPgPayment());

        assertThat(result).isEqualTo(PaymentService.PaidRecoveryResult.ALREADY_PAID);
        assertThat(payment.getImpUid()).isEqualTo("existing-pg-tx");
        assertThat(reservation.getDepositPaid()).isTrue();
    }

    @Test
    @DisplayName("이미 취소된 예약의 늦은 PAID는 자동 복원하지 않고 관리자 확인 대상으로 남긴다")
    void latePaidReservationIsNotAutoRestored() {
        Reservation reservation = payableReservation(Reservation.ReservationStatus.CANCELLED);
        Payment payment = readyPayment(3L, reservation);
        when(paymentRepository.findByMerchantUidForUpdate(MERCHANT_UID)).thenReturn(Optional.of(payment));

        assertThatThrownBy(() -> paymentService.recoverPaidPaymentFromPg(MERCHANT_UID, paidPgPayment()))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("관리자 확인");

        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
        assertThat(reservation.getDepositPaid()).isFalse();
        verify(reconciliationIssueService).record(
                "PAID:3",
                kr.it.reserve.payment.entity.PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                3L,
                100L,
                MERCHANT_UID,
                "CANCELLED");
    }

    @Test
    @DisplayName("만료 직전 PG가 PAID면 예약 취소 대신 결제를 복구한다")
    void expiryRecheckRecoversPaidPayment() {
        Reservation reservation = payableReservation(Reservation.ReservationStatus.PENDING);
        Payment payment = readyPayment(4L, reservation);
        stubReadyPaymentForExpiry(payment);
        PortoneV2PaymentResponse pgPayment = paidPgPayment();
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);

        PaymentService.ExpiryPaymentDecision decision =
                paymentService.reconcileBeforeReservationExpiry(100L);

        assertThat(decision).isEqualTo(PaymentService.ExpiryPaymentDecision.PAID_RECOVERED);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        assertThat(reservation.getDepositPaid()).isTrue();
    }

    @Test
    @DisplayName("만료 직전 PG 조회 실패는 fail-closed로 취소를 보류한다")
    void expiryRecheckFailureDefersCancellation() {
        Payment payment = readyPayment(5L, payableReservation(Reservation.ReservationStatus.PENDING));
        stubReadyPaymentForExpiry(payment);
        when(portoneService.getPaymentInfo(MERCHANT_UID))
                .thenThrow(new IllegalStateException("temporary PG outage"));

        PaymentService.ExpiryPaymentDecision decision =
                paymentService.reconcileBeforeReservationExpiry(100L);

        assertThat(decision).isEqualTo(PaymentService.ExpiryPaymentDecision.UNCERTAIN);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.READY);
        verify(reconciliationIssueService).record(
                "EXPIRY:5",
                kr.it.reserve.payment.entity.PaymentReconciliationIssue.IssueType.EXPIRY_RECHECK_FAILED,
                5L,
                100L,
                MERCHANT_UID,
                "IllegalStateException");
    }

    @Test
    @DisplayName("만료 직전 PG도 READY면 로컬 결제를 실패로 닫고 예약 취소를 허용한다")
    void expiryRecheckReadyAllowsCancellation() {
        Payment payment = readyPayment(6L, payableReservation(Reservation.ReservationStatus.PENDING));
        stubReadyPaymentForExpiry(payment);
        PortoneV2PaymentResponse pgPayment = mock(PortoneV2PaymentResponse.class);
        when(pgPayment.getStatus()).thenReturn("READY");
        when(portoneService.getPaymentInfo(MERCHANT_UID)).thenReturn(pgPayment);

        PaymentService.ExpiryPaymentDecision decision =
                paymentService.reconcileBeforeReservationExpiry(100L);

        assertThat(decision).isEqualTo(PaymentService.ExpiryPaymentDecision.NOT_PAID);
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.FAILED);
    }

    private void stubReadyPaymentForExpiry(Payment payment) {
        when(paymentRepository.findAllByReservationIdForUpdate(100L)).thenReturn(List.of(payment));
    }

    private Reservation payableReservation(Reservation.ReservationStatus status) {
        Store store = Store.builder()
                .autoApprovalEnabled(false)
                .build();
        return Reservation.builder()
                .id(100L)
                .status(status)
                .store(store)
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

    private PortoneV2PaymentResponse paidPgPayment() {
        try {
            return new ObjectMapper().readValue("""
                    {
                      "paymentId": "order-payment-recovery",
                      "status": "PAID",
                      "amount": {"total": 10000},
                      "method": {"type": "Card"},
                      "pgTxId": "pg-tx-1"
                    }
                    """, PortoneV2PaymentResponse.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
