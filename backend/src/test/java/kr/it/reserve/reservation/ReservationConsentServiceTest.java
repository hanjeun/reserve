package kr.it.reserve.reservation;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationConsentService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReservationConsentServiceTest {
    JdbcTemplate jdbc; TransactionTemplate tx; Store store; StoreRepository stores;
    Reservation reservation; ReservationConsentService service;
    @BeforeEach void setup() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:consent-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source); tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        jdbc.execute("CREATE TABLE reservation_consent (reservation_id BIGINT PRIMARY KEY, member_id BIGINT, store_id BIGINT, recipient_id BIGINT, notice_version VARCHAR(32), notice_hash VARCHAR(64), notice_snapshot CLOB, privacy_accepted BOOLEAN, conditions_accepted BOOLEAN, accepted_at TIMESTAMP, expires_at TIMESTAMP)");
        var owner = Member.builder().name("합성 운영자").role(Role.BUSINESS).build();
        var member = Member.builder().name("합성 예약자").role(Role.USER).build();
        ReflectionTestUtils.setField(owner, "id", 2L); ReflectionTestUtils.setField(member, "id", 3L);
        store = Store.builder().name("합성 가게").owner(owner).address("합성 주소").phone("000-0000-0000").noShowDeposit(10000).build();
        ReflectionTestUtils.setField(store, "id", 7L);
        reservation = Reservation.builder().member(member).store(store).reservationCode("SYNTHETIC-RESERVATION")
                .reservationDate(LocalDate.of(2026, 11, 1)).reservationTime(LocalTime.NOON).guestCount(2).depositAmount(10000).build();
        ReflectionTestUtils.setField(reservation, "id", 5L);
        stores = mock(StoreRepository.class); when(stores.findById(7L)).thenReturn(Optional.of(store));
        service = new ReservationConsentService(jdbc, new ObjectMapper(), stores, true, "합성 보유기간");
        ReflectionTestUtils.setField(service, "retentionEnabled", true);
    }
    private ReservationConsentService.Proof proof(ReservationConsentService.Notice notice) {
        return new ReservationConsentService.Proof(true, true, notice.version(), notice.hash());
    }
    @Test void activatedSchemaMustContainAllReceiptFields() {
        assertThatCode(() -> ReflectionTestUtils.invokeMethod(service, "checkEnabledSchema")).doesNotThrowAnyException();
        var incomplete = new ReservationConsentService(new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:missing-consent", "sa", "")), new ObjectMapper(), stores, true, "합성 보유기간");
        ReflectionTestUtils.setField(incomplete, "retentionEnabled", true);
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(incomplete, "checkEnabledSchema")).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    @Test void bothConsentsAndTheCurrentStorePolicyAreRequired() {
        var notice = service.notice(7L);
        assertThatThrownBy(() -> service.validate(store, null)).isInstanceOf(ReservationException.class);
        assertThatThrownBy(() -> service.validate(store, new ReservationConsentService.Proof(false, true, notice.version(), notice.hash())))
                .isInstanceOfSatisfying(ReservationException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThat(service.validate(store, proof(notice)).hash()).isEqualTo(notice.hash());
        store.setPartialRefundRate(25);
        assertThatThrownBy(() -> service.validate(store, proof(notice)))
                .isInstanceOfSatisfying(ReservationException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation_consent", Integer.class)).isZero();
    }
    @Test void anotherRecipientOrPolicyVersionCannotReuseTheProof() {
        var notice = service.notice(7L);
        var nextOwner = Member.builder().name("다른 합성 운영자").role(Role.BUSINESS).build();
        ReflectionTestUtils.setField(nextOwner, "id", 9L); store.setOwner(nextOwner);
        assertThatThrownBy(() -> service.validate(store, proof(notice))).isInstanceOf(ReservationException.class);
        var current = service.notice(7L);
        assertThatThrownBy(() -> service.validate(store, new ReservationConsentService.Proof(true, true, "obsolete", current.hash())))
                .isInstanceOf(ReservationException.class);
    }
    @Test void receiptKeepsTheNoticeAndTransactionDetailsWithoutCustomerFreeText() throws Exception {
        var notice = service.validate(store, proof(service.notice(7L)));
        assertThat(notice.details().get("items")).asList().contains("예약자 이메일");
        tx.executeWithoutResult(ignored -> service.record(reservation, notice));
        var row = jdbc.queryForMap("SELECT * FROM reservation_consent WHERE reservation_id=5");
        assertThat(row.get("NOTICE_VERSION")).isEqualTo(notice.version());
        assertThat(row.get("NOTICE_HASH")).isEqualTo(notice.hash());
        assertThat(row.get("PRIVACY_ACCEPTED")).isEqualTo(true);
        assertThat(row.get("CONDITIONS_ACCEPTED")).isEqualTo(true);
        String snapshot = jdbc.queryForObject("SELECT notice_snapshot FROM reservation_consent WHERE reservation_id=5", String.class);
        var json = new ObjectMapper().readTree(snapshot);
        assertThat(json.path("reservationDate").asText()).isEqualTo("2026-11-01");
        assertThat(json.path("guestCount").asInt()).isEqualTo(2);
        assertThat(json.path("depositAmount").asInt()).isEqualTo(10000);
        assertThat(json.has("specialRequest")).isFalse();
        assertThat(json.has("memberName")).isFalse();
        assertThat(jdbc.queryForObject("SELECT expires_at FROM reservation_consent WHERE reservation_id=5", LocalDateTime.class))
                .isAfter(reservation.getReservationDate().atTime(12, 0).minusHours(9).plusYears(5));
    }
    @Test void receiptRollsBackWithTheReservationTransaction() {
        var notice = service.validate(store, proof(service.notice(7L)));
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> { service.record(reservation, notice); throw new IllegalStateException("synthetic rollback"); }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reservation_consent", Integer.class)).isZero();
    }
    @Test void disabledFeatureDoesNotRequireANewTableAndUnapprovedRetentionFailsClosed() {
        var emptyJdbc = mock(JdbcTemplate.class);
        var disabled = new ReservationConsentService(emptyJdbc, new ObjectMapper(), stores, false, "");
        assertThat(disabled.notice(7L).enabled()).isFalse();
        assertThat(disabled.validate(store, null)).isNull();
        disabled.record(reservation, null); verifyNoInteractions(emptyJdbc);
        var incomplete = new ReservationConsentService(jdbc, new ObjectMapper(), stores, true, "");
        assertThatThrownBy(() -> incomplete.notice(7L))
                .isInstanceOfSatisfying(ReservationException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test void consentCannotActivateBeforeRetention() {
        ReflectionTestUtils.setField(service, "retentionEnabled", false);
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(service, "checkEnabledSchema"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("retention activation");
    }
}
