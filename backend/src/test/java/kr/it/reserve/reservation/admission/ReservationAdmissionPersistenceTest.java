package kr.it.reserve.reservation.admission;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Actual transactions; no mail, payment, social or production endpoints are used. */
@SpringBootTest
@Timeout(90)
class ReservationAdmissionPersistenceTest {
    @Autowired ReservationService service;
    @Autowired ReservationRepository reservations;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean EmailService emails;
    @MockitoBean AuditLogService audits;
    Member owner;
    Store store;
    final List<Member> customers = new ArrayList<>();
    LocalDate date;

    @BeforeEach void fixture() {
        date = ServiceTime.today().plusDays(2);
        owner = member(Role.BUSINESS);
        store = stores.saveAndFlush(Store.builder().owner(owner).name("synthetic admission " + UUID.randomUUID())
                .bookingType(Store.BookingType.SLOT).openTime(LocalTime.of(9,0)).closeTime(LocalTime.of(18,0))
                .reservationSlotMinutes(30).maxCapacityPerSlot(1).noShowDeposit(0)
                .emailNotificationEnabled(false).build());
        customers.add(member(Role.USER)); customers.add(member(Role.USER));
    }
    @AfterEach void removeOnlyOwnRows() {
        if (store == null) return;
        jdbc.update("DELETE FROM reservation_request WHERE reservation_id IN (SELECT reservation_id FROM reservation WHERE store_id = ?)", store.getId());
        jdbc.update("DELETE FROM reservation WHERE store_id = ?", store.getId());
        stores.deleteById(store.getId());
        for (var member : customers) members.deleteById(member.getId());
        if (owner != null) members.deleteById(owner.getId());
        customers.clear();
    }
    private Member member(Role role) { return members.saveAndFlush(Member.builder().name("synthetic")
            .email("admission-" + UUID.randomUUID() + "@example.test").role(role).termsAgreed(true).build()); }
    private ReservationCreateRequest request() {
        var r = new ReservationCreateRequest(store.getId(), date, LocalTime.NOON, 1, null, false);
        r.setRequestId(UUID.randomUUID().toString()); return r;
    }

    @Test void concurrentResponseRetriesReturnOneReservation() throws Exception {
        var request = request();
        var results = parallel(6, i -> service.createReservation(request, customers.getFirst()));
        assertThat(results.stream().map(ReservationResponse::getId).distinct().count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation WHERE store_id = ?", Integer.class, store.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation_request WHERE member_id = ?", Integer.class, customers.getFirst().getId())).isEqualTo(1);
    }
    @Test void aDifferentPayloadCannotReuseTheCommittedRequest() {
        var request = request(); service.createReservation(request, customers.getFirst()); request.setGuestCount(2);
        assertThatThrownBy(() -> service.createReservation(request, customers.getFirst())).isInstanceOf(ReservationException.class).hasMessageContaining("요청 번호");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation WHERE store_id = ?", Integer.class, store.getId())).isEqualTo(1);
    }
    @Test void simultaneousCustomersNeverOverbook() throws Exception {
        var results = parallel(2, index -> {
            try { service.createReservation(request(), customers.get(index)); return true; }
            catch (ReservationException full) { assertThat(full.getMessage()).contains("마감"); return false; }
        });
        assertThat(results).containsExactlyInAnyOrder(true, false);
        assertThat(jdbc.queryForObject("SELECT SUM(guest_count) FROM reservation WHERE store_id = ? AND status IN ('PENDING','CONFIRMED')", Integer.class, store.getId())).isEqualTo(1);
    }
    @Test void undoCannotTakeTheSeatBookedAfterCompletion() {
        var a = service.createReservation(request(), customers.getFirst());
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var completed = reservations.findById(a.getId()).orElseThrow();
            completed.setStatus(Reservation.ReservationStatus.COMPLETED); reservations.saveAndFlush(completed);
        });
        service.createReservation(request(), customers.get(1));
        assertThatThrownBy(() -> service.undoComplete(a.getId(), owner)).isInstanceOf(ReservationException.class);
        assertThat(reservations.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
        assertThat(jdbc.queryForObject("SELECT SUM(guest_count) FROM reservation WHERE store_id = ? AND status IN ('PENDING','CONFIRMED')", Integer.class, store.getId())).isEqualTo(1);
    }
    @Test void failedBookingLeavesNoIdempotencyResultAndCanRetryTheSameKey() {
        var request = request(); request.setGuestCount(2);
        assertThatThrownBy(() -> service.createReservation(request, customers.getFirst())).isInstanceOf(ReservationException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation_request WHERE member_id = ?", Integer.class, customers.getFirst().getId())).isZero();
        request.setGuestCount(1);
        assertThat(service.createReservation(request, customers.getFirst()).getId()).isNotNull();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void futureUndoCannotRecreateLifecycleObligationsAfterClosureOrWithdrawal(boolean closedStore) {
        var a = service.createReservation(request(), customers.getFirst());
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var completed = reservations.findById(a.getId()).orElseThrow();
            completed.setStatus(Reservation.ReservationStatus.COMPLETED); reservations.saveAndFlush(completed);
            if (closedStore) { var entity = stores.findById(store.getId()).orElseThrow(); entity.softDelete(); stores.saveAndFlush(entity); }
            else { var entity = members.findById(customers.getFirst().getId()).orElseThrow(); entity.withdraw("anonymous-" + UUID.randomUUID() + "@example.test"); members.saveAndFlush(entity); }
        });
        assertThatThrownBy(() -> service.undoComplete(a.getId(), owner)).isInstanceOf(ReservationException.class).hasMessageContaining("복구");
        assertThat(reservations.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(Reservation.ReservationStatus.COMPLETED);
    }

    private static <T> List<T> parallel(int size, java.util.function.IntFunction<T> action) throws Exception {
        var start = new CountDownLatch(1); var calls = new ArrayList<Future<T>>();
        try (var workers = Executors.newFixedThreadPool(size)) {
            for (int i=0; i<size; i++) { int index=i; calls.add(workers.submit(() -> { start.await(); return action.apply(index); })); }
            start.countDown(); var results = new ArrayList<T>();
            for (var call : calls) results.add(call.get(45, TimeUnit.SECONDS)); return results;
        }
    }
}
