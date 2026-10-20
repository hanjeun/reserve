package kr.it.reserve.payment;

import jakarta.persistence.EntityManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PaymentRefundDto;
import kr.it.reserve.payment.dto.PaymentResponseDto;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PaymentReconciliationIssueService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.RefundLedgerService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceRefundSafetyTest {

    private static final String MERCHANT_UID = "order-refund-safety";
    private RefundAttempt preparedAttempt;
    private boolean preparedLedgerCreated;

    @Mock private EntityManager entityManager;
    @Mock private PaymentRepository paymentRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private PortoneService portoneService;
    @Mock private RefundLedgerService refundLedgerService;
    @Mock private RefundAttemptRepository refundAttemptRepository;
    @Mock private PaymentReconciliationIssueService reconciliationIssueService;

    @Mock private PlatformTransactionManager transactionManager;

    @BeforeEach
    void transactionBoundaries() {
        preparedLedgerCreated = false;
        lenient().when(transactionManager.getTransaction(any()))
                .thenAnswer(ignored -> new SimpleTransactionStatus());
        lenient().when(paymentRepository.findReservationIdByPaymentId(any())).thenReturn(Optional.of(100L));
        lenient().when(reservationRepository.findMemberIdById(100L)).thenReturn(Optional.of(200L));
        lenient().when(memberRepository.findByIdForPaymentUpdate(200L)).thenReturn(Optional.of(requester()));
        lenient().when(reservationRepository.findByIdForPaymentUpdate(100L)).thenReturn(Optional.of(
                Reservation.builder().id(100L).member(requester()).status(Reservation.ReservationStatus.CANCELLED).build()));
    }

    @InjectMocks
    private PaymentService paymentService;

    @Test
    @DisplayName("PG 호출 결과를 잃으면 FAILED로 닫지 않고 추가 환불을 차단한다")
    void unknownCallOutcomeRemainsPending() {
        Payment payment = paidPayment();
        PaymentRefundDto request = request();
        stubLockedPayment(payment);
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(20L);
        stubPreparedAttempt(20L, 3_000, "예약 취소");
        when(portoneService.cancelPayment(eq(MERCHANT_UID), eq(3_000), eq("예약 취소"), anyString(), eq(10_000)))
                .thenThrow(new IllegalStateException("connection reset"));

        PaymentResponseDto response = paymentService.refundPayment(request);

        assertThat(response.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING.name());
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        assertThat(preparedAttempt.getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        assertThat(preparedAttempt.getFailureReason()).isEqualTo("PG cancellation call outcome unknown: IllegalStateException");
        verify(refundLedgerService, never()).failed(
                any(), anyString());
        verify(reconciliationIssueService).recordIssue(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                100L,
                MERCHANT_UID,
                "PG_CANCEL_CALL_OUTCOME_UNKNOWN");
    }

    @Test
    @DisplayName("PG가 SUCCEEDED를 보내도 실제 취소액이 다르면 로컬 환불액을 올리지 않는다")
    void succeededAmountMismatchRemainsPending() throws Exception {
        Payment payment = paidPayment();
        PaymentRefundDto request = request();
        stubLockedPayment(payment);
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(20L);
        stubPreparedAttempt(20L, 3_000, "예약 취소");
        PortoneV2CancelResponse response = new ObjectMapper().readValue("""
                {
                  "cancellation": {
                    "id": "cancel-20",
                    "status": "SUCCEEDED",
                    "totalAmount": 2000
                  }
                }
                """, PortoneV2CancelResponse.class);
        when(portoneService.cancelPayment(eq(MERCHANT_UID), eq(3_000), eq("예약 취소"), anyString(), eq(10_000)))
                .thenReturn(response);

        PaymentResponseDto result = paymentService.refundPayment(request);

        assertThat(result.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING.name());
        assertThat(payment.refundedSoFar()).isZero();
        assertThat(preparedAttempt.getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        assertThat(preparedAttempt.getFailureReason()).isEqualTo("PG succeeded amount does not match request");
        verify(refundLedgerService, never()).succeeded(
                any(),
                any(),
                any());
        verify(reconciliationIssueService).recordIssue(
                "REFUND:10",
                PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                10L,
                100L,
                MERCHANT_UID,
                "PG_CANCEL_RESPONSE_AMOUNT_MISMATCH");
    }

    @Test
    @DisplayName("가게 측 전액 환불도 PG 접수만 된 상태를 완료로 반환하지 않는다")
    void storeFullRefundReturnsFalseWhilePending() throws Exception {
        Payment payment = paidPayment();
        when(reservationRepository.findByIdForPaymentUpdate(100L)).thenReturn(Optional.of(payment.getReservation()));
        when(paymentRepository.findPaidByReservationIdForUpdate(100L)).thenReturn(Optional.of(payment));
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(payment));
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 10_000, "가게 취소"))
                .thenReturn(20L);
        stubPreparedAttempt(20L, 10_000, "가게 취소");
        PortoneV2CancelResponse response = new ObjectMapper().readValue("""
                {
                  "cancellation": {
                    "id": "cancel-20",
                    "status": "REQUESTED",
                    "totalAmount": 10000
                  }
                }
                """, PortoneV2CancelResponse.class);
        when(portoneService.cancelPayment(eq(MERCHANT_UID), eq(10_000), eq("가게 취소"), anyString(), eq(10_000)))
                .thenReturn(response);

        boolean completed = paymentService.refundFullByStoreDecision(100L, "가게 취소");

        assertThat(completed).isFalse();
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        assertThat(preparedAttempt.getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        assertThat(preparedAttempt.getFailureReason()).isEqualTo("PG cancellation not final: REQUESTED");
    }

    @Test
    @DisplayName("결제가 PAID여도 앞선 미결 원장이 있으면 PG 취소를 다시 보내지 않는다")
    void unresolvedLedgerBlocksRetryAfterLocalRollback() {
        Payment payment = paidPayment();
        stubLockedPayment(payment);
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L))
                .thenReturn(List.of(RefundAttempt.start(10L, MERCHANT_UID, 3_000, "기존 미결")));

        assertThatThrownBy(
                        () -> paymentService.refundPayment(request()))
                .isInstanceOf(kr.it.reserve.global.error.PaymentException.class)
                .hasMessageContaining("직전 환불 요청");

        verify(portoneService, never()).cancelPayment(
                anyString(),
                any(),
                anyString(), anyString(), any());
        verify(refundLedgerService, never()).prepare(
                any(),
                anyString(),
                any(),
                anyString());
    }

    @Test
    @DisplayName("원장을 시작하지 못하면 PG 취소를 보내지 않는다")
    void ledgerStartFailureStopsBeforePgCall() {
        Payment payment = paidPayment();
        stubLockedPayment(payment);
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(null);

        assertThatThrownBy(
                        () -> paymentService.refundPayment(request()))
                .isInstanceOf(kr.it.reserve.global.error.PaymentException.class)
                .hasMessageContaining("안전하게 기록하지 못했어요");

        verify(portoneService, never()).cancelPayment(
                anyString(),
                any(),
                anyString(), anyString(), any());
    }

    @Test
    @DisplayName("PG 성공 결제와 원장은 같은 완료 경계에서 함께 확정된다")
    void successfulPaymentAndLedgerAreCompletedTogether() throws Exception {
        Payment payment = paidPayment();
        stubLockedPayment(payment);
        when(reservationRepository.findByIdForPaymentUpdate(100L)).thenReturn(Optional.of(payment.getReservation()));
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 3_000, "예약 취소"))
                .thenReturn(20L);
        stubPreparedAttempt(20L, 3_000, "예약 취소");
        PortoneV2CancelResponse response = new ObjectMapper().readValue("""
                {
                  "cancellation": {
                    "id": "cancel-20",
                    "status": "SUCCEEDED",
                    "totalAmount": 3000
                  }
                }
                """, PortoneV2CancelResponse.class);
        when(portoneService.cancelPayment(eq(MERCHANT_UID), eq(3_000), eq("예약 취소"), anyString(), eq(10_000)))
                .thenReturn(response);

        PaymentResponseDto result = paymentService.refundPayment(request());
        assertThat(result.getStatus()).isEqualTo(Payment.PaymentStatus.PARTIAL_REFUNDED.name());
        assertThat(preparedAttempt.getStatus()).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        assertThat(preparedAttempt.getCancelledAmount()).isEqualTo(3_000);
        verify(refundLedgerService, never()).succeeded(any(), any(), any());
    }

    @Test
    @DisplayName("동시 결말 처리에서는 같은 누적 환불만 멱등으로 인정한다")
    void pendingRefundResolutionRequiresMatchingLocalState() {
        Payment pending = Payment.builder().id(10L).amount(10_000).refundAmount(2_000)
                .status(Payment.PaymentStatus.REFUND_PENDING).build();
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(pending));
        RefundAttempt attempt = RefundAttempt.start(10L, MERCHANT_UID, 3_000, "예약 취소");
        ReflectionTestUtils.setField(attempt, "id", 20L);
        attempt.markPending("cancel-20", "PG acknowledged");
        pending.setMerchantUid(MERCHANT_UID);
        when(refundAttemptRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(attempt));
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L)).thenReturn(List.of(attempt));
        UnresolvedRefundView view = new UnresolvedRefundView(20L, 10L, MERCHANT_UID, 3_000, "cancel-20", "예약 취소", 0);
        assertThat(paymentService.confirmPendingRefund(view, 1_000, 3_000, "cancel-20")).isFalse();
        assertThat(pending.refundedSoFar()).isEqualTo(2_000);
        assertThat(attempt.getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        pending.setStatus(Payment.PaymentStatus.PARTIAL_REFUNDED);
        pending.setRefundAmount(5_000);
        assertThat(paymentService.confirmPendingRefund(view, 2_000, 3_000, "cancel-20")).isTrue();
        assertThat(pending.refundedSoFar()).isEqualTo(5_000);
        assertThat(attempt.getStatus()).isEqualTo(RefundAttempt.Status.SUCCEEDED);
    }

    @Test
    @DisplayName("사용자 환불 API는 취소되지 않은 예약의 PG 환불을 시작하지 않는다")
    void memberRefundRequiresCancelledReservation() {
        Member requester = Member.builder().id(200L).role(Role.USER).build();
        Reservation reservation = Reservation.builder()
                .id(100L)
                .member(requester)
                .status(Reservation.ReservationStatus.CONFIRMED)
                .build();
        when(memberRepository.findByIdForPaymentUpdate(200L)).thenReturn(Optional.of(requester));
        when(reservationRepository.findByIdForPaymentUpdate(100L)).thenReturn(Optional.of(reservation));

        assertThatThrownBy(() -> paymentService.refundByMemberRequest(100L, "이용자 요청", requester))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("예약을 취소한 후");

        verify(paymentRepository, never()).findPaidByReservationIdForUpdate(100L);
        verify(portoneService, never()).cancelPayment(
                anyString(),
                any(),
                anyString(), anyString(), any());
    }

    @Test
    @DisplayName("환불 재시도는 정책을 다시 계산하지 않고 원장의 마지막 실패 금액을 그대로 보낸다")
    void memberRetryReusesLastFailedAmount() {
        // 예약에 방문일·가게 정책이 없다. 재시도가 정책을 다시 계산하려 들면 여기서 터진다.
        Member requester = requester();
        stubFinishedReservation(requester, Reservation.ReservationStatus.CANCELLED);
        Payment payment = paidPayment();
        String originalReason = "예약 취소에 따른 자동 환불 (7일 전 취소 - 전액 환불)";
        when(paymentRepository.findAllByReservationIdForUpdate(100L)).thenReturn(List.of(payment));
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L))
                .thenReturn(List.of(failedAttempt(7_000, originalReason)));
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(payment));
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 7_000, originalReason)).thenReturn(21L);
        stubPreparedAttempt(21L, 7_000, originalReason);
        when(portoneService.cancelPayment(eq(MERCHANT_UID), eq(7_000), eq(originalReason), anyString(), eq(10_000)))
                .thenThrow(new IllegalStateException("connection reset"));

        paymentService.refundByMemberRequest(100L, null, requester);

        verify(portoneService).cancelPayment(eq(MERCHANT_UID), eq(7_000), eq(originalReason), anyString(), eq(10_000));
    }

    @Test
    @DisplayName("가게가 거절한 예약도 재시도할 수 있고, 전액 환불이 위약금 정책으로 깎이지 않는다")
    void rejectedReservationRetryKeepsFullAmount() {
        Member requester = requester();
        stubFinishedReservation(requester, Reservation.ReservationStatus.REJECTED);
        Payment payment = paidPayment();
        String originalReason = "가게의 예약 거절에 따른 전액 환불";
        when(paymentRepository.findAllByReservationIdForUpdate(100L)).thenReturn(List.of(payment));
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L))
                .thenReturn(List.of(failedAttempt(10_000, originalReason)));
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(payment));
        when(refundLedgerService.prepare(10L, MERCHANT_UID, 10_000, originalReason)).thenReturn(22L);
        stubPreparedAttempt(22L, 10_000, originalReason);
        when(portoneService.cancelPayment(eq(MERCHANT_UID), eq(10_000), eq(originalReason), anyString(), eq(10_000)))
                .thenThrow(new IllegalStateException("connection reset"));

        paymentService.refundByMemberRequest(100L, null, requester);

        verify(portoneService).cancelPayment(eq(MERCHANT_UID), eq(10_000), eq(originalReason), anyString(), eq(10_000));
    }

    @Test
    @DisplayName("원장에 실패한 시도가 없으면 금액을 새로 만들어 환불하지 않는다")
    void memberRetryWithoutFailedAttemptIsRefused() {
        Member requester = requester();
        stubFinishedReservation(requester, Reservation.ReservationStatus.CANCELLED);
        Payment payment = paidPayment();
        when(paymentRepository.findAllByReservationIdForUpdate(100L)).thenReturn(List.of(payment));
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L)).thenReturn(List.of());

        assertThatThrownBy(() -> paymentService.refundByMemberRequest(100L, null, requester))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("다시 시도할 환불 요청이 없어요");

        verify(paymentRepository, never()).findPaidByReservationIdForUpdate(100L);
        verify(portoneService, never()).cancelPayment(
                anyString(),
                any(),
                anyString(), anyString(), any());
    }

    @Test
    @DisplayName("직전 환불 시도가 아직 미결이면 재시도를 보내지 않는다")
    void memberRetryWhilePreviousAttemptUnresolvedIsRefused() {
        Member requester = requester();
        stubFinishedReservation(requester, Reservation.ReservationStatus.CANCELLED);
        RefundAttempt pending = RefundAttempt.start(10L, MERCHANT_UID, 3_000, "예약 취소");
        pending.markPending(null, "PG cancellation not final: REQUESTED");
        Payment payment = paidPayment();
        when(paymentRepository.findAllByReservationIdForUpdate(100L)).thenReturn(List.of(payment));
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L))
                .thenReturn(List.of(failedAttempt(3_000, "예약 취소"), pending));

        assertThatThrownBy(() -> paymentService.refundByMemberRequest(100L, null, requester))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("처리 결과를 확인하는 중");

        verify(portoneService, never()).cancelPayment(
                anyString(),
                any(),
                anyString(), anyString(), any());
    }

    private Member requester() {
        return Member.builder().id(200L).role(Role.USER).build();
    }

    private void stubFinishedReservation(Member requester, Reservation.ReservationStatus status) {
        Reservation reservation = Reservation.builder()
                .id(100L)
                .member(requester)
                .status(status)
                .build();
        when(memberRepository.findByIdForPaymentUpdate(200L)).thenReturn(Optional.of(requester));
        when(reservationRepository.findByIdForPaymentUpdate(100L)).thenReturn(Optional.of(reservation));
    }

    private RefundAttempt failedAttempt(int amount, String reason) {
        RefundAttempt attempt = RefundAttempt.start(10L, MERCHANT_UID, amount, reason);
        attempt.markFailed("PG rejected");
        return attempt;
    }

    private void stubPreparedAttempt(Long id, int amount, String reason) {
        preparedAttempt = RefundAttempt.prepare(10L, MERCHANT_UID, amount, reason);
        ReflectionTestUtils.setField(preparedAttempt, "id", id);
        when(refundAttemptRepository.findPaymentId(id)).thenReturn(Optional.of(10L));
        when(refundAttemptRepository.findByIdForUpdate(id)).thenReturn(Optional.of(preparedAttempt));
        List<RefundAttempt> history = refundAttemptRepository.findByPaymentIdForUpdate(10L);
        when(refundAttemptRepository.findByPaymentIdForUpdate(10L))
                .thenAnswer(ignored -> preparedLedgerCreated ? List.of(preparedAttempt) : history);
        when(refundLedgerService.prepare(10L, MERCHANT_UID, amount, reason)).thenAnswer(ignored -> {
            preparedLedgerCreated = true;
            return id;
        });
    }

    private void stubLockedPayment(Payment payment) {
        when(paymentRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(payment));
    }

    @Test
    void refundPreviewUsesPaidLedgerAmountAndRejectsAnotherCustomersReservation() {
        Member customer = Member.builder().id(7L).role(Role.USER).build();
        Reservation reservation = Reservation.builder().id(100L).member(customer)
                .store(kr.it.reserve.store.entity.Store.builder().fullRefundDays(3).build())
                .reservationDate(kr.it.reserve.global.common.ServiceTime.today().plusDays(4))
                .depositAmount(500).build();
        when(reservationRepository.findById(100L)).thenReturn(Optional.of(reservation));
        Payment ledgerPayment = paidPayment();
        when(paymentRepository.findPaidByReservationId(100L)).thenReturn(Optional.of(ledgerPayment));
        assertThat(paymentService.calculateRefundAmount(100L).getRefundAmount()).isEqualTo(10_000);
        assertThat(paymentService.calculateRefundAmountForMember(100L, customer).getRefundAmount()).isEqualTo(10_000);
        var stranger = Member.builder().id(8L).role(Role.USER).build();
        assertThatThrownBy(() -> paymentService.calculateRefundAmountForMember(100L, stranger))
                .isInstanceOf(PaymentException.class).hasMessage("본인의 예약만 조회할 수 있어요.");
        verifyNoInteractions(portoneService, refundLedgerService);
    }

    private Payment paidPayment() {
        Reservation reservation = mock(Reservation.class);
        lenient().when(reservation.getId()).thenReturn(100L);
        lenient().when(reservation.getMember()).thenReturn(requester());
        lenient().when(reservation.getStatus()).thenReturn(Reservation.ReservationStatus.CANCELLED);
        return Payment.builder()
                .id(10L)
                .reservation(reservation)
                .merchantUid(MERCHANT_UID)
                .amount(10_000)
                .refundAmount(0)
                .status(Payment.PaymentStatus.PAID)
                .build();
    }

    private PaymentRefundDto request() {
        return PaymentRefundDto.builder()
                .paymentId(10L)
                .refundAmount(3_000)
                .refundReason("예약 취소")
                .build();
    }
}
