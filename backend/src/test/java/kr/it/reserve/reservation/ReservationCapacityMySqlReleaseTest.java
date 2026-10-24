package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.time.LocalTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.Mockito.doAnswer;

/** Real MySQL transactions in a disposable synthetic fixture; no admission/session schema is required. */
@SpringBootTest
@Timeout(45)
@EnabledIfEnvironmentVariable(named = "RESERVE_CAPACITY_MYSQL_TEST", matches = "1")
class ReservationCapacityMySqlReleaseTest {
    @Autowired ReservationService service;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean ReservationRepository reservations;
    @MockitoBean EmailService emails;
    @MockitoBean AuditLogService audits;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_CAPACITY_MYSQL_URL");
        String user = required("RESERVE_CAPACITY_MYSQL_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_capacity_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_capacity_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("Capacity tests require a disposable loopback database and dedicated test account");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_CAPACITY_MYSQL_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout=10");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Test
    void editingCannotTakeASeatCommittedAfterItsInitialLookup() throws Exception {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        Member owner = member(Role.BUSINESS);
        Member first = member(Role.USER);
        Member second = member(Role.USER);
        Store store = stores.saveAndFlush(Store.builder().owner(owner).name("synthetic capacity " + UUID.randomUUID())
                .bookingType(Store.BookingType.SLOT).openTime(LocalTime.of(9, 0)).closeTime(LocalTime.of(18, 0))
                .reservationSlotMinutes(30).maxCapacityPerSlot(1).noShowDeposit(0).emailNotificationEnabled(false).build());
        var date = ServiceTime.today().plusDays(2);
        var existing = service.createReservation(new ReservationCreateRequest(store.getId(), date,
                LocalTime.of(11, 30), 1, null, false), first);
        var initialLookup = new CountDownLatch(1);
        var competingBookingCommitted = new CountDownLatch(1);
        doAnswer(invocation -> {
            // The payer lookup opens the old RR snapshot before reservation/store locking reads.
            Long payer = jdbc.queryForObject("SELECT member_id FROM reservation WHERE reservation_id = ?", Long.class, existing.getId());
            initialLookup.countDown();
            assertThat(competingBookingCommitted.await(10, TimeUnit.SECONDS)).isTrue();
            return java.util.Optional.ofNullable(payer);
        }).when(reservations).findMemberIdById(existing.getId());

        try (var worker = Executors.newSingleThreadExecutor()) {
            var edit = worker.submit(() -> catchThrowable(() -> service.updateReservation(existing.getId(),
                    new ReservationUpdateRequest(null, LocalTime.NOON, null, null, null), first)));
            try {
                assertThat(initialLookup.await(10, TimeUnit.SECONDS)).isTrue();
                service.createReservation(new ReservationCreateRequest(store.getId(), date, LocalTime.NOON, 1, null, false), second);
            } finally {
                competingBookingCommitted.countDown();
            }
            assertThat(edit.get(15, TimeUnit.SECONDS)).isInstanceOf(ReservationException.class).hasMessageContaining("마감");
        }
        assertThat(reservations.findById(existing.getId()).orElseThrow().getReservationTime()).isEqualTo(LocalTime.of(11, 30));
        assertThat(jdbc.queryForObject("SELECT SUM(guest_count) FROM reservation WHERE store_id = ? "
                + "AND reservation_date = ? AND reservation_time = ? AND status IN ('PENDING','CONFIRMED')",
                Integer.class, store.getId(), date, LocalTime.NOON)).isEqualTo(1);
    }

    private Member member(Role role) {
        return members.saveAndFlush(Member.builder().name("synthetic")
                .email("capacity-" + UUID.randomUUID() + "@example.test").role(role).termsAgreed(true).build());
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated fixture setting: " + key);
        return value;
    }
}
