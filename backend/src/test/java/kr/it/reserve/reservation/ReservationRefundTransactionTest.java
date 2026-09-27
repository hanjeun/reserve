package kr.it.reserve.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 실제 커밋·별도 연결을 사용한다. PG·메일은 mock이며 운영/개발 reserve DB는 허용하지 않는다. */
@SpringBootTest
class ReservationRefundTransactionTest {
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired ReservationService reservations;
    @Autowired ReservationRepository reservationRepository;
    @Autowired PaymentRepository payments;
    @Autowired RefundAttemptRepository attempts;
    @Autowired ObjectMapper json;
    @Autowired PaymentService paymentService;
    @MockitoBean PortoneService pg;
    @MockitoBean EmailService email;

    private TransactionTemplate tx;
    private Member customer;
    private Member owner;
    private Long reservationId;
    private Long paymentId;
    private String uid;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String mysqlUrl = System.getenv("RESERVE_REFUND_TEST_URL");
        if (mysqlUrl == null || mysqlUrl.isBlank()) {
            properties.add("spring.datasource.url", () -> "jdbc:h2:mem:refund-transaction;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=2000");
            return;
        }
        if (!mysqlUrl.matches("jdbc:mysql://127\\.0\\.0\\.1:3306/reserve_restore_refund_[a-z0-9_]+\\?[^\\s]*")) {
            throw new IllegalArgumentException("Only a named loopback refund fixture database is allowed");
        }
        properties.add("spring.datasource.url", () -> mysqlUrl);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> System.getenv("RESERVE_REFUND_TEST_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("RESERVE_REFUND_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout=2");
    }

    @BeforeEach
    void fixture() {
        tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(ignored -> {
            owner = member(Role.BUSINESS);
            customer = member(Role.USER);
            Store store = Store.builder().name("환불 잠금 검증").owner(owner).fullRefundDays(3).build();
            em.persist(store);
            Reservation reservation = Reservation.builder().member(customer).store(store)
                    .reservationDate(ServiceTime.today().plusDays(7)).reservationTime(LocalTime.NOON)
                    .guestCount(1).depositPaid(true).depositAmount(10_000).build();
            em.persist(reservation);
            uid = "refund-lock-" + UUID.randomUUID();
            Payment payment = Payment.builder().member(customer).reservation(reservation)
                    .merchantUid(uid).amount(10_000).refundAmount(0).status(Payment.PaymentStatus.PAID).build();
            em.persist(payment);
            reservationId = reservation.getId();
            paymentId = payment.getId();
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"member-cancel", "store-reject", "store-cancel"})
    void successfulRefundCommitsWithoutWaitingForItsOwnReservationLock(String action) throws Exception {
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString())).thenReturn(succeeded());
        if (action.equals("store-cancel")) {
            tx.executeWithoutResult(ignored -> reservationRepository.findById(reservationId).orElseThrow()
                    .setStatus(Reservation.ReservationStatus.CONFIRMED));
        }

        switch (action) {
            case "member-cancel" -> reservations.cancelReservation(reservationId, customer);
            case "store-reject" -> reservations.rejectReservation(reservationId, owner, "검증용 거절");
            case "store-cancel" -> reservations.cancelReservationByStore(reservationId, owner, "검증용 취소");
            default -> throw new IllegalArgumentException(action);
        }

        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
        assertThat(payments.findById(paymentId).orElseThrow().refundedSoFar()).isEqualTo(10_000);
        Reservation result = reservationRepository.findById(reservationId).orElseThrow();
        assertThat(result.getStatus()).isEqualTo(action.equals("store-reject")
                ? Reservation.ReservationStatus.REJECTED : Reservation.ReservationStatus.CANCELLED);
        assertThat(result.getDepositPaid()).isFalse();
        assertThat(result.getDepositAmount()).isZero();
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId))
                .singleElement().extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString());
    }

    @Test
    void unknownPgOutcomeKeepsCancellationAndDepositForReadOnlyReconciliation() {
        when(pg.cancelPayment(eq(uid), anyInt(), anyString())).thenThrow(new IllegalStateException("mock timeout"));
        reservations.cancelReservation(reservationId, customer);

        assertThat(reservationRepository.findById(reservationId).orElseThrow().getStatus())
                .isEqualTo(Reservation.ReservationStatus.CANCELLED);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getDepositPaid()).isTrue();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId))
                .singleElement().extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.PENDING);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString());
    }

    private Member member(Role role) {
        Member member = Member.builder().name("합성 검증 회원").email(UUID.randomUUID() + "@example.test")
                .role(role).termsAgreed(true).emailNotificationEnabled(false).build();
        em.persist(member);
        return member;
    }

    private PortoneV2CancelResponse succeeded() throws Exception {
        return json.readValue("""
                {"cancellation":{"id":"synthetic-cancel","status":"SUCCEEDED","totalAmount":10000}}
                """, PortoneV2CancelResponse.class);
    }

    @Test
    void lostLocalCommitIsRecoveredOnlyFromItsExactSingleLedgerWithoutAnotherPgCancel() {
        UnresolvedRefundView view = committedPendingAttempt();
        assertThat(paymentService.confirmLedgerBackedRefund(view, 0, 10_000, "synthetic-cancel")).isTrue();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getDepositPaid()).isFalse();
        verifyNoInteractions(pg);
    }

    @Test
    void duplicateLedgerOrStaleCancellationCannotRecoverPaidPayment() {
        UnresolvedRefundView view = committedPendingAttempt();
        assertThat(paymentService.confirmLedgerBackedRefund(view, 0, 9_000, "synthetic-cancel")).isFalse();
        assertThat(paymentService.confirmLedgerBackedRefund(view, 0, 10_000, "different-cancel")).isFalse();
        tx.executeWithoutResult(ignored -> em.persist(RefundAttempt.start(paymentId, uid, 10_000, "중복 원장 검증")));
        assertThat(paymentService.confirmLedgerBackedRefund(view, 0, 10_000, "synthetic-cancel")).isFalse();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        verifyNoInteractions(pg);
    }

    @Test
    void anActiveReservationIsNotAutomaticallyChangedByLostCommitRecovery() {
        UnresolvedRefundView view = committedPendingAttempt();
        tx.executeWithoutResult(ignored -> reservationRepository.findById(reservationId).orElseThrow()
                .setStatus(Reservation.ReservationStatus.PENDING));
        assertThat(paymentService.confirmLedgerBackedRefund(view, 0, 10_000, "synthetic-cancel")).isFalse();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        verifyNoInteractions(pg);
    }

    private UnresolvedRefundView committedPendingAttempt() {
        return tx.execute(ignored -> {
            reservationRepository.findById(reservationId).orElseThrow().setStatus(Reservation.ReservationStatus.CANCELLED);
            RefundAttempt attempt = RefundAttempt.start(paymentId, uid, 10_000, "검증용 취소");
            attempt.markPending("synthetic-cancel", "PG succeeded; local commit pending");
            em.persist(attempt);
            return new UnresolvedRefundView(attempt.getId(), paymentId, uid, 10_000,
                    "synthetic-cancel", "검증용 취소", 0);
        });
    }
}
