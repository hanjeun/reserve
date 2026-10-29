package kr.it.reserve.reservation;

import kr.it.reserve.global.error.ReservationException;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.UnresolvedRefundView;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.StaleReadyReconciliationResponse;
import kr.it.reserve.payment.dto.PaymentRequestDto;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.RefundDispatchService;
import kr.it.reserve.payment.service.RefundLedgerService;
import kr.it.reserve.payment.service.RefundSettlementPolicy;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.scheduler.ReservationExpiryProcessor;
import kr.it.reserve.reservation.scheduler.ReservationElapsedScheduler;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalTime;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

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
    @Autowired RefundDispatchService dispatch;
    @Autowired ReservationExpiryProcessor expiry;
    @Autowired ReservationElapsedScheduler elapsed;
    @Autowired MemberService memberService;
    @MockitoSpyBean MemberRepository members;
    @MockitoSpyBean RefundLedgerService ledger;
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
        if (!mysqlUrl.matches("jdbc:mysql://127\\.0\\.0\\.1:(3306|3307)/reserve_restore_refund_[a-z0-9_]+\\?[^\\s]*")) {
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
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000))).thenAnswer(ignored -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            tx.executeWithoutResult(status -> {
                Reservation committed = reservationRepository.findByIdForUpdate(reservationId).orElseThrow();
                assertThat(committed.getStatus()).isIn(Reservation.ReservationStatus.CANCELLED, Reservation.ReservationStatus.REJECTED);
                assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
                assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId))
                        .singleElement().extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.PENDING);
            });
            return succeeded();
        });
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

        org.awaitility.Awaitility.await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED));
        assertThat(payments.findById(paymentId).orElseThrow().refundedSoFar()).isEqualTo(10_000);
        Reservation result = reservationRepository.findById(reservationId).orElseThrow();
        assertThat(result.getStatus()).isEqualTo(action.equals("store-reject")
                ? Reservation.ReservationStatus.REJECTED : Reservation.ReservationStatus.CANCELLED);
        assertThat(result.getDepositPaid()).isFalse();
        assertThat(result.getDepositAmount()).isZero();
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId))
                .singleElement().extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
    }

    @Test
    void capacityRejectionRetainsUnsentIntentAndRetriesWithTheSameKey() throws Exception {
        Long attemptId = prepareCancellationWithoutCallback();
        String key = "reserve-refund-attempt-" + attemptId;
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString(), eq(key), eq(10_000)))
                .thenThrow(new PortoneService.RequestNotSentException()).thenReturn(succeeded());
        paymentService.dispatchPreparedRefund(attemptId);
        assertThat(attempts.findById(attemptId).orElseThrow().isReadyToDispatch()).isTrue();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        paymentService.dispatchPreparedRefund(attemptId);
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId)).singleElement()
                .extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
        verify(pg, times(2)).cancelPayment(eq(uid), eq(10_000), anyString(), eq(key), eq(10_000));
    }

    @Test
    void unknownPgOutcomeKeepsCancellationAndDepositForReadOnlyReconciliation() {
        when(pg.cancelPayment(eq(uid), anyInt(), anyString(), anyString(), eq(10_000))).thenThrow(new IllegalStateException("mock timeout"));
        reservations.cancelReservation(reservationId, customer);
        org.awaitility.Awaitility.await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
            var executor = (org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor) org.springframework.test.util.ReflectionTestUtils.getField(dispatch, "executor");
            assertThat(executor.getActiveCount()).isZero();
            assertThat(executor.getQueueSize()).isZero();
        });

        assertThat(reservationRepository.findById(reservationId).orElseThrow().getStatus())
                .isEqualTo(Reservation.ReservationStatus.CANCELLED);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getDepositPaid()).isTrue();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId))
                .singleElement().extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.PENDING);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
    }

    @Test
    void committedButUndispatchedIntentSurvivesAndDispatchesOnlyOnce() throws Exception {
        Long attemptId = prepareCancellationWithoutCallback();
        assertThat(attempts.findById(attemptId).orElseThrow().isReadyToDispatch()).isTrue();
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        verifyNoInteractions(pg);
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString(), eq("reserve-refund-attempt-" + attemptId), eq(10_000)))
                .thenReturn(succeeded());

        paymentService.dispatchPreparedRefund(attemptId);
        paymentService.dispatchPreparedRefund(attemptId);

        assertThat(attempts.findById(attemptId).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getDepositPaid()).isFalse();
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
    }

    @Test
    void rollingBackReservationDecisionRollsBackIntentAndDoesNotDispatch() {
        tx.executeWithoutResult(status -> {
            Reservation reservation = reservationRepository.findByIdForUpdate(reservationId).orElseThrow();
            reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
            Long attemptId = paymentService.prepareRefundByReservationCancel(reservationId);
            dispatch.afterCommit(attemptId);
            status.setRollbackOnly();
        });
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId)).isEmpty();
        verifyNoInteractions(pg);
    }

    @Test
    void duplicateDispatchWhilePgIsWaitingCannotSendAnotherCancellation() throws Exception {
        Long attemptId = prepareCancellationWithoutCallback();
        CountDownLatch sent = new CountDownLatch(1);
        CountDownLatch finish = new CountDownLatch(1);
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000))).thenAnswer(ignored -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            sent.countDown();
            if (!finish.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Fixture dispatch timed out");
            return succeeded();
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> paymentService.dispatchPreparedRefund(attemptId));
            try {
                assertThat(sent.await(10, TimeUnit.SECONDS)).isTrue();
                var duplicate = executor.submit(() -> paymentService.dispatchPreparedRefund(attemptId));
                assertThat(duplicate.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING.name());
                verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
            } finally {
                finish.countDown();
            }
            assertThat(first.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED.name());
        }
    }

    @Test
    void aLostPgResponseIsNeverRepostedByDuplicateDispatch() {
        Long attemptId = prepareCancellationWithoutCallback();
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000)))
                .thenThrow(new IllegalStateException("Synthetic response loss"));
        paymentService.dispatchPreparedRefund(attemptId);
        paymentService.dispatchPreparedRefund(attemptId);
        assertThat(attempts.findById(attemptId).orElseThrow().isReadyToDispatch()).isFalse();
        assertThat(attempts.findById(attemptId).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
    }

    @Test
    void legacyRequestedLedgerWithoutUnsentMarkerIsNotAutomaticallyPosted() {
        Long attemptId = tx.execute(ignored -> {
            Payment payment = payments.findById(paymentId).orElseThrow();
            payment.markRefundPending("과거 요청");
            RefundAttempt attempt = RefundAttempt.start(paymentId, uid, 10_000, "과거 요청");
            em.persist(attempt);
            return attempt.getId();
        });
        paymentService.dispatchPreparedRefund(attemptId);
        assertThat(attempts.findById(attemptId).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.REQUESTED);
        verifyNoInteractions(pg);
    }

    @Test
    void pgFacadeRejectsAnOuterTransactionBeforeAnyNetworkCall() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> paymentService.refundByReservationCancel(reservationId)))
                .isInstanceOf(IllegalTransactionStateException.class);
        verifyNoInteractions(pg);
    }

    @Test
    void expiryObservesPgWithoutATransactionThenCommitsUnpaidPaymentAndCancellationTogether() throws Exception {
        tx.executeWithoutResult(ignored -> {
            Payment payment = payments.findById(paymentId).orElseThrow();
            payment.setStatus(Payment.PaymentStatus.READY);
            Reservation reservation = reservationRepository.findById(reservationId).orElseThrow();
            reservation.setDepositPaid(false);
            reservation.getStore().setPaymentTimeoutMinutes(1);
            reservation.getStore().setAllowLatePayment(false);
        });
        when(pg.getPaymentInfo(uid)).thenAnswer(ignored -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            // 별도 연결에서도 두 행을 잠글 수 있어야 PG 대기 중 잠금을 보유하지 않은 것이다.
            tx.executeWithoutResult(status -> {
                payments.findByIdForUpdate(paymentId).orElseThrow();
                reservationRepository.findByIdForUpdate(reservationId).orElseThrow();
            });
            return json.readValue("{\"status\":\"READY\",\"amount\":{\"total\":10000}}", PortoneV2PaymentResponse.class);
        });

        Long storeId = tx.execute(ignored -> reservationRepository.findById(reservationId).orElseThrow().getStore().getId());
        var day = ServiceTime.today().plusDays(7);
        assertThat(reservationRepository.sumActiveGuestsGroupedByTime(storeId, day)).hasSize(1);
        assertThat(expiry.expireIfDue(reservationId, LocalDateTime.now().plusHours(1)))
                .isEqualTo(ReservationExpiryProcessor.ExpiryResult.CANCELLED);
        assertThat(reservationRepository.sumActiveGuestsGroupedByTime(storeId, day)).isEmpty();
        verify(pg, never()).cancelPayment(anyString(), anyInt(), anyString(), anyString());
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.FAILED);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.CANCELLED);
    }

    @Test
    void staleReadyObservationCannotOverwriteAConcurrentLocalResolution() {
        tx.executeWithoutResult(ignored -> payments.findById(paymentId).orElseThrow().setStatus(Payment.PaymentStatus.READY));
        when(pg.getPaymentInfo(uid)).thenAnswer(ignored -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            tx.executeWithoutResult(status -> payments.findByIdForUpdate(paymentId).orElseThrow().failPayment("Concurrent fixture resolution"));
            return json.readValue("{\"status\":\"PAID\",\"amount\":{\"total\":10000}}", PortoneV2PaymentResponse.class);
        });

        assertThat(paymentService.reconcileStaleReadyPayment(paymentId).outcome())
                .isEqualTo(StaleReadyReconciliationResponse.Outcome.ALREADY_RESOLVED);
        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.FAILED);
    }

    private Long prepareCancellationWithoutCallback() {
        return tx.execute(ignored -> {
            paymentService.lockReservationPayments(reservationId);
            Reservation reservation = reservationRepository.findByIdForUpdate(reservationId).orElseThrow();
            reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
            return paymentService.prepareRefundByReservationCancel(reservationId);
        });
    }

    @Test
    void concurrentFirstPreparationsReuseOneReadyPaymentWithoutEmptyRangeDeadlock() throws Exception {
        makeUnpaidWithoutPayment();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<String> prepare = () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Preparation fixture timed out");
                return paymentService.preparePayment(paymentRequest(), customer.getId()).getMerchantUid();
            };
            var first = executor.submit(prepare);
            var second = executor.submit(prepare);
            try {
                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            } finally {
                start.countDown();
            }
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
        }
        assertThat(payments.findReadyByReservationId(reservationId)).hasSize(1);
        verify(pg, never()).getPaymentInfo(anyString());
        verify(pg, never()).cancelPayment(anyString(), anyInt(), anyString(), anyString(), anyInt());
    }

    @Test
    void preparationRacingExpiryCannotLeaveAReadyPaymentOnACancelledReservation() throws Exception {
        makeUnpaidWithoutPayment();
        CountDownLatch expirySnapshotOpened = new CountDownLatch(1);
        CountDownLatch preparationCommitted = new CountDownLatch(1);
        ThreadLocal<Boolean> expiring = ThreadLocal.withInitial(() -> false);
        doAnswer(invocation -> {
            if (expiring.get()) {
                expirySnapshotOpened.countDown();
                assertThat(preparationCommitted.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return em.createQuery("SELECT m FROM Member m WHERE m.id = :id", Member.class)
                    .setParameter("id", owner.getId()).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getResultList().stream().findFirst();
        }).when(members).findByIdForPaymentUpdate(owner.getId());
        try (var executor = Executors.newFixedThreadPool(2)) {
            var preparation = executor.submit(() -> {
                assertThat(expirySnapshotOpened.await(10, TimeUnit.SECONDS)).isTrue();
                try {
                    return paymentService.preparePayment(paymentRequest(), customer.getId());
                } finally {
                    preparationCommitted.countDown();
                }
            });
            var expiration = executor.submit(() -> {
                expiring.set(true);
                try {
                    return expiry.expireIfDue(reservationId, LocalDateTime.now().plusHours(1));
                } finally {
                    expiring.remove();
                }
            });
            preparation.get(10, TimeUnit.SECONDS);
            assertThat(expiration.get(10, TimeUnit.SECONDS)).isEqualTo(ReservationExpiryProcessor.ExpiryResult.DEFERRED);
        }
        Reservation result = reservationRepository.findById(reservationId).orElseThrow();
        assertThat(result.getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(payments.findReadyByReservationId(reservationId)).hasSize(1);
        verify(pg, never()).getPaymentInfo(anyString());
        verify(pg, never()).cancelPayment(anyString(), anyInt(), anyString(), anyString(), anyInt());
    }

    @Test
    void oneElapsedRefundConflictDoesNotRollbackTheNextReservationsDecisionAndIntent() throws Exception {
        String healthyUid = "elapsed-healthy-" + UUID.randomUUID();
        Long[] healthy = tx.execute(ignored -> {
            Reservation blocked = reservationRepository.findById(reservationId).orElseThrow();
            blocked.setReservationDate(ServiceTime.today().minusDays(1));
            em.persist(RefundAttempt.start(paymentId, uid, 10_000, "과거 미결 원장"));
            Reservation reservation = Reservation.builder().member(customer).store(blocked.getStore())
                    .reservationDate(ServiceTime.today().minusDays(1)).reservationTime(LocalTime.NOON)
                    .guestCount(1).depositPaid(true).depositAmount(10_000).build();
            em.persist(reservation);
            Payment payment = Payment.builder().member(customer).reservation(reservation).merchantUid(healthyUid)
                    .amount(10_000).refundAmount(0).status(Payment.PaymentStatus.PAID).build();
            em.persist(payment);
            return new Long[]{reservation.getId(), payment.getId()};
        });
        when(pg.cancelPayment(eq(healthyUid), eq(10_000), anyString(), anyString(), eq(10_000))).thenReturn(succeeded());

        elapsed.processElapsedReservations();

        assertThat(reservationRepository.findById(reservationId).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(reservationRepository.findById(healthy[0]).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.CANCELLED);
        org.awaitility.Awaitility.await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(payments.findById(healthy[1]).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED));
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(healthy[1])).singleElement()
                .extracting(RefundAttempt::getStatus).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        verify(pg, times(1)).cancelPayment(eq(healthyUid), eq(10_000), anyString(), anyString(), eq(10_000));
        verify(pg, never()).cancelPayment(eq(uid), anyInt(), anyString(), anyString(), anyInt());
    }

    private void makeUnpaidWithoutPayment() {
        tx.executeWithoutResult(ignored -> {
            Reservation reservation = reservationRepository.findById(reservationId).orElseThrow();
            // cascade ALL인 역참조를 먼저 끊어 삭제할 결제가 flush 때 다시 persist되지 않게 한다.
            reservation.setPayment(null);
            payments.deleteById(paymentId);
            reservation.setDepositPaid(false);
            reservation.getStore().setPaymentTimeoutMinutes(1);
            reservation.getStore().setAllowLatePayment(false);
            em.flush();
        });
        assertThat(payments.findById(paymentId)).isEmpty();
        assertThat(payments.existsByReservationId(reservationId)).isFalse();
    }

    private PaymentRequestDto paymentRequest() {
        return PaymentRequestDto.builder().reservationId(reservationId).productName("동시 준비 검증").amount(1).build();
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
        assertThat(attempts.findById(view.attemptId()).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        verifyNoInteractions(pg);
    }

    @Test
    void anAlreadyAppliedRefundClosesOnlyItsExactPendingLedgerWithoutAddingMoneyAgain() {
        UnresolvedRefundView view = committedPendingAttempt();
        tx.executeWithoutResult(ignored -> {
            payments.findById(paymentId).orElseThrow().refundPayment(10_000, "과거 결제만 커밋된 환불");
            Reservation reservation = reservationRepository.findById(reservationId).orElseThrow();
            reservation.setDepositPaid(false);
            reservation.setDepositAmount(0);
        });
        assertThat(paymentService.confirmPendingRefund(view, 0, 10_000, "synthetic-cancel")).isTrue();
        assertThat(payments.findById(paymentId).orElseThrow().refundedSoFar()).isEqualTo(10_000);
        assertThat(attempts.findById(view.attemptId()).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        verifyNoInteractions(pg);
    }

    @Test
    void matchingTotalsWithoutARecordedCancellationIdDoNotCloseAPendingLedger() {
        UnresolvedRefundView view = committedPendingAttempt();
        tx.executeWithoutResult(ignored -> {
            payments.findById(paymentId).orElseThrow().refundPayment(10_000, "금액만 같은 과거 상태");
            attempts.findById(view.attemptId()).orElseThrow().markPending(null, "개별 취소 ID 미확인");
        });
        UnresolvedRefundView unbound = new UnresolvedRefundView(view.attemptId(), paymentId, uid, 10_000,
                null, view.reason(), 0);
        assertThat(paymentService.confirmPendingRefund(unbound, 0, 10_000, "synthetic-cancel")).isFalse();
        assertThat(attempts.findById(view.attemptId()).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        verifyNoInteractions(pg);
    }

    @Test
    void anActiveSinglePendingRefundKeepsItsCumulativeRecoveryContractWithoutACancellationId() throws Exception {
        UnresolvedRefundView original = committedPendingAttempt();
        tx.executeWithoutResult(ignored -> {
            payments.findById(paymentId).orElseThrow().markRefundPending("응답 유실");
            attempts.findById(original.attemptId()).orElseThrow().markPending(null, "개별 취소 ID 응답 유실");
        });
        UnresolvedRefundView view = new UnresolvedRefundView(original.attemptId(), paymentId, uid, 10_000,
                null, original.reason(), 0);
        var assessment = RefundSettlementPolicy.assess(0, 10_000, null, json.readValue("""
                {"status":"CANCELLED","amount":{"total":10000,"cancelled":10000},
                 "cancellations":[{"id":"observed-cancel","status":"SUCCEEDED","totalAmount":10000}]}
                """, PortoneV2PaymentResponse.class));
        assertThat(assessment.outcome()).isEqualTo(RefundSettlementPolicy.Outcome.SUCCEEDED);
        assertThat(assessment.cancellationId()).isNull();

        assertThat(paymentService.confirmPendingRefund(view, 0, assessment.confirmedAmount(), null)).isTrue();

        assertThat(payments.findById(paymentId).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.REFUNDED);
        assertThat(attempts.findById(view.attemptId()).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.SUCCEEDED);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getDepositPaid()).isFalse();
        verifyNoInteractions(pg);
    }

    @Test
    void adminRefundRetryAndWithdrawalRecheckTheCurrentIntentAfterAnOldRrSnapshot() throws Exception {
        Member admin = tx.execute(ignored -> {
            reservationRepository.findById(reservationId).orElseThrow().setStatus(Reservation.ReservationStatus.CANCELLED);
            RefundAttempt failed = RefundAttempt.start(paymentId, uid, 10_000, "검증용 실패 환불");
            failed.markFailed("Synthetic explicit PG failure");
            em.persist(failed);
            return member(Role.ADMIN);
        });
        CountDownLatch snapshotOpened = new CountDownLatch(1);
        CountDownLatch intentPrepared = new CountDownLatch(1);
        CountDownLatch withdrawalMemberLookup = new CountDownLatch(1);
        CountDownLatch withdrawalFinished = new CountDownLatch(1);
        RefundLedgerService ledgerTarget = AopTestUtils.getUltimateTargetObject(ledger);
        doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            intentPrepared.countDown();
            assertThat(withdrawalMemberLookup.await(10, TimeUnit.SECONDS)).isTrue();
            return result;
        }).when(ledgerTarget).prepare(eq(paymentId), eq(uid), eq(10_000), anyString());
        doAnswer(invocation -> {
            withdrawalMemberLookup.countDown();
            return em.createQuery("SELECT m FROM Member m WHERE m.id = :id AND m.deletedAt IS NULL", Member.class)
                    .setParameter("id", customer.getId()).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getResultList().stream().findFirst();
        }).when(members).findActiveByIdForUpdate(customer.getId());
        when(pg.cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000))).thenAnswer(ignored -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(withdrawalFinished.await(10, TimeUnit.SECONDS)).isTrue();
            return json.readValue("""
                    {"cancellation":{"id":"synthetic-pending","status":"REQUESTED","totalAmount":10000}}
                    """, PortoneV2CancelResponse.class);
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var withdrawal = executor.submit(() -> {
                try {
                    assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
                        assertThat(attempts.countUnresolvedByMemberId(customer.getId(), RefundAttempt.UNRESOLVED)).isZero();
                        snapshotOpened.countDown();
                        try {
                            assertThat(intentPrepared.await(10, TimeUnit.SECONDS)).isTrue();
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            throw new IllegalStateException(e);
                        }
                        memberService.deleteMember(customer.getId());
                    })).isInstanceOf(MemberException.class).hasMessageContaining("회원 탈퇴 전에 미결");
                } finally {
                    withdrawalFinished.countDown();
                }
            });
            var refund = executor.submit(() -> {
                assertThat(snapshotOpened.await(10, TimeUnit.SECONDS)).isTrue();
                return paymentService.refundByMemberRequest(reservationId, "ADMIN 실패 환불 재시도", admin);
            });
            withdrawal.get(15, TimeUnit.SECONDS);
            assertThat(refund.get(15, TimeUnit.SECONDS).getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING.name());
        }
        assertThat(members.findById(customer.getId()).orElseThrow().getDeletedAt()).isNull();
        assertThat(attempts.findByPaymentIdOrderByCreatedAtAsc(paymentId).stream().filter(RefundAttempt::isUnresolved))
                .hasSize(1);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(10_000), anyString(), anyString(), eq(10_000));
    }

    @Test
    void approvalUsesTheSameParticipantGateWhilePaymentPreparationHoldsItsMemberLock() throws Exception {
        makeUnpaidWithoutPayment();
        CountDownLatch financialMemberHeld = new CountDownLatch(1);
        CountDownLatch approvalAtMemberGate = new CountDownLatch(1);
        ThreadLocal<Boolean> preparingPayment = ThreadLocal.withInitial(() -> false);
        doAnswer(invocation -> {
            if (!preparingPayment.get()) approvalAtMemberGate.countDown();
            var result = em.createQuery("SELECT m FROM Member m WHERE m.id = :id", Member.class)
                    .setParameter("id", owner.getId()).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                    .getResultList().stream().findFirst();
            if (preparingPayment.get()) {
                financialMemberHeld.countDown();
                assertThat(approvalAtMemberGate.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return result;
        }).when(members).findByIdForPaymentUpdate(owner.getId());
        try (var executor = Executors.newFixedThreadPool(2)) {
            var preparation = executor.submit(() -> {
                preparingPayment.set(true);
                try {
                    return paymentService.preparePayment(paymentRequest(), customer.getId());
                } finally {
                    preparingPayment.remove();
                }
            });
            var approval = executor.submit(() -> {
                assertThat(financialMemberHeld.await(10, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> reservations.approveReservation(reservationId, owner))
                        .isInstanceOf(ReservationException.class).hasMessageContaining("예약금 결제 후 승인");
                return true;
            });
            preparation.get(15, TimeUnit.SECONDS);
            assertThat(approval.get(15, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getStatus())
                .isEqualTo(Reservation.ReservationStatus.PENDING);
        assertThat(payments.findReadyByReservationId(reservationId)).hasSize(1);
        verify(pg, never()).getPaymentInfo(anyString());
        verify(pg, never()).cancelPayment(anyString(), anyInt(), anyString(), anyString(), anyInt());
    }

    @ParameterizedTest
    @ValueSource(strings = {"success", "failure"})
    void settlementRollbackKeepsPaymentReservationAndLedgerAtTheSamePendingCheckpoint(String outcome) {
        UnresolvedRefundView view = committedPendingAttempt();
        tx.executeWithoutResult(ignored -> payments.findById(paymentId).orElseThrow().markRefundPending("준비 커밋"));
        tx.executeWithoutResult(status -> {
            boolean settled = outcome.equals("success")
                    ? paymentService.confirmPendingRefund(view, 0, 10_000, "synthetic-cancel")
                    : paymentService.revertPendingRefund(view, 0, "synthetic-cancel", "Synthetic PG failure");
            assertThat(settled).isTrue();
            status.setRollbackOnly();
        });
        Payment pending = payments.findById(paymentId).orElseThrow();
        assertThat(pending.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        assertThat(pending.refundedSoFar()).isZero();
        assertThat(attempts.findById(view.attemptId()).orElseThrow().getStatus()).isEqualTo(RefundAttempt.Status.PENDING);
        assertThat(reservationRepository.findById(reservationId).orElseThrow().getDepositPaid()).isTrue();
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
