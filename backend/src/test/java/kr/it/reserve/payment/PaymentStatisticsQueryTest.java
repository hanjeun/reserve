package kr.it.reserve.payment;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class PaymentStatisticsQueryTest {

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private PaymentRepository paymentRepository;

    @Test
    void netDepositUsesPaidDateAndSubtractsOnlyRecordedRefunds() {
        Member owner = persistMember(Role.BUSINESS);
        Member customer = persistMember(Role.USER);
        Store store = Store.builder().name("순결제액 검증").owner(owner).build();
        entityManager.persist(store);

        LocalDate paidDate = LocalDate.of(2026, 9, 11);
        Reservation partiallyRefunded = persistReservation(
                customer, store, paidDate.minusDays(20), true, LocalDateTime.now());
        Reservation fullyRefunded = persistReservation(
                customer, store, paidDate.plusDays(10), false, null);
        Reservation paidOutsideRange = persistReservation(
                customer, store, paidDate, true, null);

        persistPayment(customer, partiallyRefunded, 10_000, 2_500,
                Payment.PaymentStatus.PARTIAL_REFUNDED, paidDate.atTime(9, 30));
        persistPayment(customer, fullyRefunded, 5_000, 5_000,
                Payment.PaymentStatus.REFUNDED, paidDate.atTime(15, 0));
        persistPayment(customer, paidOutsideRange, 99_000, 0,
                Payment.PaymentStatus.PAID, paidDate.minusDays(1).atTime(23, 59));
        entityManager.flush();
        entityManager.clear();

        List<Object[]> rows = paymentRepository.sumNetDepositByPaidDate(
                store.getId(), paidDate.atStartOfDay(), paidDate.plusDays(1).atStartOfDay());

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst()[0]).isEqualTo(paidDate);
        assertThat(((Number) rows.getFirst()[1]).longValue()).isEqualTo(7_500L);
    }

    @Test
    void invariantQueriesDetectImpossibleLedgerAndDepositFlag() {
        long ledgerBefore = paymentRepository.countLedgerInvariantViolations();
        long depositBefore = paymentRepository.countReservationDepositInvariantViolations();

        Member owner = persistMember(Role.BUSINESS);
        Member customer = persistMember(Role.USER);
        Store store = Store.builder().name("불변식 검증").owner(owner).build();
        entityManager.persist(store);
        Reservation reservation = persistReservation(customer, store, LocalDate.now(), true, null);
        persistPayment(customer, reservation, 1_000, 2_000,
                Payment.PaymentStatus.REFUNDED, LocalDateTime.now());
        Reservation failedButTimestamped = persistReservation(customer, store, LocalDate.now(), false, null);
        persistPayment(customer, failedButTimestamped, 1_000, 0,
                Payment.PaymentStatus.FAILED, LocalDateTime.now());
        entityManager.flush();

        assertThat(paymentRepository.countLedgerInvariantViolations()).isEqualTo(ledgerBefore + 2);
        assertThat(paymentRepository.countReservationDepositInvariantViolations()).isEqualTo(depositBefore + 1);
    }

    private Member persistMember(Role role) {
        Member member = Member.builder()
                .name("검증 회원")
                .email(UUID.randomUUID() + "@example.test")
                .role(role)
                .build();
        entityManager.persist(member);
        return member;
    }

    private Reservation persistReservation(
            Member customer,
            Store store,
            LocalDate reservationDate,
            boolean depositPaid,
            LocalDateTime deletedAt) {
        Reservation reservation = Reservation.builder()
                .member(customer)
                .store(store)
                .reservationDate(reservationDate)
                .reservationTime(LocalTime.NOON)
                .guestCount(1)
                .depositPaid(depositPaid)
                .depositAmount(10_000)
                .deletedAt(deletedAt)
                .build();
        entityManager.persist(reservation);
        return reservation;
    }

    private void persistPayment(
            Member customer,
            Reservation reservation,
            int amount,
            int refundAmount,
            Payment.PaymentStatus status,
            LocalDateTime paidAt) {
        Payment payment = Payment.builder()
                .member(customer)
                .reservation(reservation)
                .merchantUid("stats-" + UUID.randomUUID())
                .amount(amount)
                .refundAmount(refundAmount)
                .status(status)
                .paidAt(paidAt)
                .build();
        entityManager.persist(payment);
    }
}
