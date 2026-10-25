package kr.it.reserve.reservation.admission;

import jakarta.persistence.EntityManagerFactory;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.dto.ReservationUpdateRequest;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.time.LocalTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.doAnswer;

@EnabledIfEnvironmentVariable(named = "RESERVE_ADMISSION_MYSQL_TEST", matches = "1")
class ReservationAdmissionMySqlTest extends ReservationAdmissionPersistenceTest {
    @Autowired EntityManagerFactory factory;
    @MockitoSpyBean(name = "reservationRepository") ReservationRepository reservationSpy;
    @DynamicPropertySource static void database(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_ADMISSION_MYSQL_URL");
        String user = required("RESERVE_ADMISSION_MYSQL_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_admission_[a-z0-9_]+(?:\\?.*)?") || !user.matches("reserve_admission_test[a-z0-9_]*"))
            throw new IllegalArgumentException("Admission tests require a disposable loopback database and dedicated test account");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_ADMISSION_MYSQL_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 10");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }
    @Test void additiveDdlPreservesBookingRowsAndValidates() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        var before = jdbc.queryForList("SELECT store_id, store_name FROM store ORDER BY store_id");
        jdbc.execute("DROP TABLE reservation_request");
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/manual/reservation-admission.sql")); return null;
        });
        assertThat(jdbc.queryForList("SELECT store_id, store_name FROM store ORDER BY store_id")).isEqualTo(before);
        factory.unwrap(SessionFactory.class).getSchemaManager().validateMappedObjects();
    }

    @Test void editingCannotTakeASeatCommittedAfterItsInitialLookup() throws Exception {
        var original = bookingAt(LocalTime.of(11, 30));
        var existing = service.createReservation(original, customers.getFirst());
        var initialLookup = new CountDownLatch(1);
        var competingBookingCommitted = new CountDownLatch(1);
        doAnswer(invocation -> {
            // 예약·가게 잠금 전에 일반 조회로 MySQL의 이전 읽기 스냅샷을 만든다.
            var result = jdbc.queryForObject("SELECT member_id FROM reservation WHERE reservation_id = ?",
                    Long.class, existing.getId());
            initialLookup.countDown();
            assertThat(competingBookingCommitted.await(10, TimeUnit.SECONDS)).isTrue();
            return java.util.Optional.ofNullable(result);
        }).when(reservationSpy).findMemberIdById(existing.getId());

        try (var worker = Executors.newSingleThreadExecutor()) {
            var edit = worker.submit(() -> catchThrowable(() -> service.updateReservation(existing.getId(),
                    new ReservationUpdateRequest(null, LocalTime.NOON, null, null, null), customers.getFirst())));
            try {
                assertThat(initialLookup.await(10, TimeUnit.SECONDS)).isTrue();
                service.createReservation(bookingAt(LocalTime.NOON), customers.get(1));
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

    private ReservationCreateRequest bookingAt(LocalTime time) {
        var request = new ReservationCreateRequest(store.getId(), date, time, 1, null, false);
        request.setRequestId(UUID.randomUUID().toString());
        return request;
    }
    private static String required(String key) {
        String value=System.getenv(key); if (value==null || value.isBlank()) throw new IllegalArgumentException("Missing isolated fixture setting: " + key); return value;
    }
}
