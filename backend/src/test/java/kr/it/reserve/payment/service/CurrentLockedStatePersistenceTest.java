package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.persistence.CurrentLockedState;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.hibernate.engine.spi.SessionImplementor;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:financial-current;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=kr.it.reserve.payment.service.CurrentLockedStatePersistenceTest$SqlCapture"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({PaymentService.class, RefundLedgerService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public class CurrentLockedStatePersistenceTest {
    @Autowired EntityManager entityManager;
    @Autowired MemberRepository members;
    @Autowired ReservationRepository reservations;
    @Autowired PaymentRepository payments;
    @Autowired RefundAttemptRepository attempts;
    @Autowired PaymentService service;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean PortoneService pg;
    @MockitoBean PaymentReconciliationIssueService issues;
    private TransactionTemplate tx;
    private Fixture fixture;

    @BeforeEach
    void seedSyntheticPayment() {
        tx = new TransactionTemplate(transactions);
        fixture = tx.execute(ignored -> {
            var owner = member(Role.BUSINESS);
            var customer = member(Role.USER);
            var store = Store.builder().owner(owner).name("합성 금융 가게").build();
            entityManager.persist(store);
            var reservation = Reservation.builder().member(customer).store(store).guestCount(1)
                    .reservationDate(LocalDate.now().minusDays(1)).reservationTime(LocalTime.NOON)
                    .status(Reservation.ReservationStatus.CONFIRMED).depositPaid(true).depositAmount(10_000)
                    .attendanceRefundEnabled(true).build();
            entityManager.persist(reservation);
            var payment = Payment.builder().member(customer).reservation(reservation).amount(10_000)
                    .status(Payment.PaymentStatus.PAID).merchantUid("synthetic-" + UUID.randomUUID()).build();
            entityManager.persist(payment);
            reservation.setPayment(payment);
            entityManager.flush();
            return new Fixture(customer.getId(), reservation.getId(), payment.getId());
        });
    }

    @Test
    void refreshUsesTheCurrentMemberEvenWhenAnotherRepositoryAlreadyMarkedItsOldSnapshotWriteLocked() {
        tx.executeWithoutResult(ignored -> {
            var same = members.findById(fixture.member()).orElseThrow();
            separately(() -> members.findById(fixture.member()).orElseThrow().setTermsAgreed(false));
            assertThat(members.findByIdForPaymentUpdate(fixture.member()).orElseThrow()).isSameAs(same);
            CurrentLockedState.refresh(entityManager, same);
            assertThat(same.isTermsAgreed()).isFalse();
            assertThat(entityManager.contains(same)).isTrue();
            assertWriteLocked(same);
        });
    }

    @Test
    void reservationRefreshAlsoRestoresTheSameCascadePaymentFromTheCurrentLockedRows() {
        tx.executeWithoutResult(ignored -> {
            var sameReservation = reservations.findById(fixture.reservation()).orElseThrow();
            var samePayment = sameReservation.getPayment();
            assertThat(samePayment.getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
            separately(() -> {
                var reservation = reservations.findById(fixture.reservation()).orElseThrow();
                reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
                payments.findById(fixture.payment()).orElseThrow().markRefundPending("합성 환불");
            });
            assertThat(reservations.findByIdForPaymentUpdate(fixture.reservation()).orElseThrow()).isSameAs(sameReservation);
            assertThat(payments.findByIdForUpdate(fixture.payment()).orElseThrow()).isSameAs(samePayment);
            new FinancialReservationLocks(members, reservations, entityManager).lock(fixture.reservation(), null);
            assertThat(sameReservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CANCELLED);
            assertThat(sameReservation.getPayment()).isSameAs(samePayment);
            assertThat(samePayment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
            assertThat(samePayment.getRefundReason()).isEqualTo("합성 환불");
            assertThat(entityManager.contains(samePayment)).isTrue();
            assertWriteLocked(sameReservation);
            assertWriteLocked(samePayment);
        });
    }

    @Test
    void nestedAttendanceRefundKeepsDirtyDecisionsLedgerAndReferencesInOneCommit() {
        Long attemptId = tx.execute(ignored -> prepareAttendanceRefundAndWriteAfterReentry());
        tx.executeWithoutResult(ignored -> {
            var reservation = reservations.findById(fixture.reservation()).orElseThrow();
            var payment = payments.findById(fixture.payment()).orElseThrow();
            assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
            assertThat(reservation.getSpecialRequest()).isEqualTo("중첩 호출 후 예약 변경");
            assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
            assertThat(payment.getBuyerName()).isEqualTo("중첩 호출 후 결제 변경");
            assertThat(attempts.findById(attemptId).orElseThrow().isReadyToDispatch()).isTrue();
            assertThat(attempts.findByPaymentIdForUpdate(fixture.payment())).hasSize(1);
        });
        verifyNoInteractions(pg);
    }

    @Test
    void aFailureAfterNestedPreparationRollsBackTheFlushedDecisionPaymentAndRefundIntentTogether() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            prepareAttendanceRefundAndWriteAfterReentry();
            entityManager.flush();
            throw new SyntheticFailure();
        })).isInstanceOf(SyntheticFailure.class);
        assertOriginalFinancialState();
        verifyNoInteractions(pg);
    }

    @Test
    void anActualRefreshFailureRestoresTheOriginalLockMetadataAndRollsBackTheIntent() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            prepareAttendanceRefundAndWriteAfterReentry();
            var reservation = reservations.findById(fixture.reservation()).orElseThrow();
            var context = entityManager.unwrap(SessionImplementor.class).getPersistenceContextInternal();
            entityManager.flush();
            var original = context.getEntry(reservation);
            var originalMode = original.getLockMode();
            SqlCapture.observe(sql -> {
                if (sql.toLowerCase().startsWith("select") && sql.contains("from reservation")) throw new SyntheticFailure();
            });
            try {
                CurrentLockedState.refresh(entityManager, reservation);
            } finally {
                SqlCapture.clear();
                assertThat(original.getLockMode()).isEqualTo(originalMode);
            }
        })).isInstanceOf(SyntheticFailure.class);
        assertOriginalFinancialState();
    }


    @Test
    void memberReservationAndCascadePaymentLocksKeepTheirFinancialOrder() {
        var sql = new ArrayList<String>();
        tx.executeWithoutResult(ignored -> {
            SqlCapture.observe(statement -> sql.add(statement.toLowerCase()));
            try { service.lockReservationPayments(fixture.reservation()); }
            finally { SqlCapture.clear(); }
        });
        int reservationLock = indexOfLock(sql, "from reservation");
        int paymentLock = indexOfLock(sql, "from payment");
        assertThat(indexOfLock(sql, "from member")).isLessThan(reservationLock);
        assertThat(reservationLock).isLessThan(paymentLock);
    }

    private Long prepareAttendanceRefundAndWriteAfterReentry() {
        var reservation = service.lockReservationPayments(fixture.reservation());
        var payment = payments.findById(fixture.payment()).orElseThrow();
        reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
        reservation.setManualVisitConfirmedAt(LocalDateTime.now());
        Long attemptId = service.prepareFullRefundAfterAttendance(fixture.reservation());
        assertThat(attemptId).isNotNull();
        assertThat(reservations.findById(fixture.reservation()).orElseThrow()).isSameAs(reservation);
        assertThat(payments.findById(fixture.payment()).orElseThrow()).isSameAs(payment);
        assertThat(entityManager.contains(reservation)).isTrue();
        assertThat(entityManager.contains(payment)).isTrue();
        assertThat(payment.getStatus()).isEqualTo(Payment.PaymentStatus.REFUND_PENDING);
        reservation.setSpecialRequest("중첩 호출 후 예약 변경");
        payment.setBuyerName("중첩 호출 후 결제 변경");
        return attemptId;
    }

    private void assertOriginalFinancialState() {
        tx.executeWithoutResult(ignored -> {
            assertThat(reservations.findById(fixture.reservation()).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
            assertThat(payments.findById(fixture.payment()).orElseThrow().getStatus()).isEqualTo(Payment.PaymentStatus.PAID);
            assertThat(attempts.findByPaymentIdForUpdate(fixture.payment())).isEmpty();
        });
    }

    private Member member(Role role) {
        var member = Member.builder().role(role).name("합성 사용자").termsAgreed(true)
                .email(UUID.randomUUID() + "@financial.example.invalid").build();
        entityManager.persist(member);
        return member;
    }

    private void separately(Runnable action) {
        var separate = new TransactionTemplate(transactions);
        separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        separate.executeWithoutResult(ignored -> action.run());
    }

    private void assertWriteLocked(Object entity) {
        assertThat(entityManager.getLockMode(entity)).isEqualTo(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
    }

    private static int indexOfLock(List<String> sql, String table) {
        for (int index = 0; index < sql.size(); index++) {
            if (sql.get(index).contains(table) && sql.get(index).contains("for update")) return index;
        }
        throw new AssertionError("Missing synthetic financial row lock: " + table);
    }

    private record Fixture(Long member, Long reservation, Long payment) { }
    private static class SyntheticFailure extends RuntimeException { }

    public static class SqlCapture implements StatementInspector {
        private static final ThreadLocal<Consumer<String>> OBSERVER = new ThreadLocal<>();
        static void observe(Consumer<String> observer) { OBSERVER.set(observer); }
        static void clear() { OBSERVER.remove(); }
        @Override public String inspect(String sql) {
            var observer = OBSERVER.get();
            if (observer != null) observer.accept(sql);
            return sql;
        }
    }
}
