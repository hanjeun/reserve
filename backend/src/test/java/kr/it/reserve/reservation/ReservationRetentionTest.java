package kr.it.reserve.reservation;

import jakarta.persistence.EntityManager;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.retention.*;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReservationRetentionTest {
    JdbcTemplate jdbc;
    javax.sql.DataSource source;
    TransactionTemplate tx;
    ReservationRepository reservations;
    PaymentService payments;
    AuditLogService audit;
    EntityManager entities;
    ReservationRetentionData data;
    ReservationRetentionWorker worker;
    ReservationRetentionService service;
    Reservation reservation;
    final LocalDateTime now = LocalDateTime.of(2030, 1, 1, 0, 0);

    @BeforeEach void setup() {
        source = new DriverManagerDataSource("jdbc:h2:mem:retention-" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source); tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        jdbc.execute("CREATE TABLE reservation(reservation_id BIGINT PRIMARY KEY)");
        jdbc.execute("CREATE TABLE payment(payment_id BIGINT PRIMARY KEY,reservation_id BIGINT REFERENCES reservation,merchant_uid VARCHAR(80),amount INT,status VARCHAR(30),pay_method VARCHAR(30),refund_amount INT,paid_at TIMESTAMP,refunded_at TIMESTAMP,created_at TIMESTAMP,buyer_name VARCHAR(80),buyer_email VARCHAR(120))");
        jdbc.execute("CREATE TABLE reservation_retention_hold(retention_hold_id BIGINT AUTO_INCREMENT PRIMARY KEY,reservation_id BIGINT REFERENCES reservation,case_reference VARCHAR(80),purpose VARCHAR(32),held_by BIGINT,held_at TIMESTAMP,released_by BIGINT,released_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE reservation_consent(reservation_id BIGINT PRIMARY KEY REFERENCES reservation,notice_version VARCHAR(32),notice_hash VARCHAR(64),notice_snapshot VARCHAR(2000),privacy_accepted BOOLEAN,conditions_accepted BOOLEAN,accepted_at TIMESTAMP,expires_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE refund_attempt(refund_attempt_id BIGINT PRIMARY KEY,payment_id BIGINT REFERENCES payment,requested_amount INT,cancelled_amount INT,status VARCHAR(32),created_at TIMESTAMP,updated_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE payment_reconciliation_issue(payment_id BIGINT,reservation_id BIGINT,merchant_uid VARCHAR(100),last_seen_at TIMESTAMP,resolved_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE test_settlement_payout(payment_id BIGINT REFERENCES payment,created_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE payment_webhook_inbox(merchant_uid VARCHAR(80),status VARCHAR(32))");
        jdbc.execute("CREATE TABLE reservation_request(reservation_id BIGINT REFERENCES reservation)");
        jdbc.execute("CREATE TABLE audit_log(entity_type VARCHAR(32),entity_id BIGINT)");
        jdbc.execute("CREATE TABLE review(review_id BIGINT PRIMARY KEY,reservation_id BIGINT REFERENCES reservation,content VARCHAR(100))");
        jdbc.update("INSERT INTO reservation VALUES(1)");
        jdbc.update("INSERT INTO payment(payment_id,reservation_id,merchant_uid,amount,status,refund_amount,created_at) VALUES(2,1,'synthetic-retention-order',1000,'REFUNDED',1000,?)", LocalDateTime.of(2024,1,1,0,0));
        jdbc.update("INSERT INTO reservation_consent(reservation_id,notice_version,privacy_accepted,conditions_accepted,expires_at) VALUES(1,'synthetic',true,true,?)", LocalDateTime.of(2029,1,1,0,0));
        jdbc.update("INSERT INTO refund_attempt(refund_attempt_id,payment_id,updated_at) VALUES(3,2,?)", LocalDateTime.of(2024,1,2,0,0));
        jdbc.update("INSERT INTO payment_reconciliation_issue(payment_id,reservation_id,last_seen_at,resolved_at) VALUES(2,1,?,?)", LocalDateTime.of(2024,1,3,0,0), LocalDateTime.of(2024,1,4,0,0));
        jdbc.update("INSERT INTO test_settlement_payout VALUES(2,?)", LocalDateTime.of(2024,1,5,0,0));
        jdbc.update("INSERT INTO payment_webhook_inbox VALUES('synthetic-retention-order','PROCESSED')");
        jdbc.update("INSERT INTO reservation_request VALUES(1)");
        jdbc.update("INSERT INTO review VALUES(4,1,'합성 리뷰 원문')");
        jdbc.update("INSERT INTO audit_log VALUES('RESERVATION',1)");
        reservations = mock(ReservationRepository.class); payments = mock(PaymentService.class);
        audit = mock(AuditLogService.class); entities = mock(EntityManager.class);
        reservation = Reservation.builder().id(1L).reservationCode("SYNTHETIC-RETENTION")
                .member(Member.builder().id(6L).name("합성 예약자").email("synthetic@example.test").build())
                .store(Store.builder().id(7L).name("합성 가게").build())
                .status(Reservation.ReservationStatus.CANCELLED).reservationDate(LocalDate.of(2024,1,1))
                .usageEndsAt(LocalDateTime.of(2024,1,1,12,0)).createdAt(LocalDateTime.of(2024,1,1,0,0)).build();
        when(reservations.existsById(1L)).thenReturn(true);
        when(reservations.findByIdForUpdate(1L)).thenReturn(Optional.of(reservation));
        when(payments.isReservationRemovalSafe(reservation)).thenReturn(true);
        data = new ReservationRetentionData(jdbc);
        worker = new ReservationRetentionWorker(reservations,payments,jdbc,data,audit,entities,true,true);
        service = new ReservationRetentionService(reservations,payments,audit,jdbc,data,true);
    }
    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private ReservationRetentionWorker.Result purge() { return tx.execute(ignored -> worker.purge(1L, now)); }

    @Test void lastTransactionControlsFiveYearsAndAnOpenDisputeNeverExpires() {
        assertThat(data.expiresAt(reservation)).isEqualTo(LocalDateTime.of(2029,1,5,0,0));
        jdbc.update("INSERT INTO reservation_retention_hold(reservation_id,case_reference,purpose,held_at) VALUES(1,'CASE_1','DISPUTE',?)", LocalDateTime.of(2028,1,1,0,0));
        assertThat(purge()).isEqualTo(ReservationRetentionWorker.Result.RETAINED);
        assertThat(count("reservation")).isEqualTo(1);
        jdbc.update("UPDATE reservation_retention_hold SET released_at=?", LocalDateTime.of(2028,6,1,0,0));
        assertThat(data.expiresAt(reservation)).isEqualTo(LocalDateTime.of(2031,6,1,0,0));
        assertThat(purge()).isEqualTo(ReservationRetentionWorker.Result.RETAINED);
        verifyNoInteractions(audit);
    }
    @Test void purgeRemovesOnlyExpiredBookingEvidenceAndPreservesPublicReviewContent() {
        assertThat(purge()).isEqualTo(ReservationRetentionWorker.Result.PURGED);
        for (String table : List.of("reservation","payment","refund_attempt","test_settlement_payout","payment_reconciliation_issue","reservation_request","reservation_consent","payment_webhook_inbox","audit_log"))
            assertThat(count(table)).as(table).isZero();
        assertThat(jdbc.queryForObject("SELECT content FROM review WHERE review_id=4", String.class)).isEqualTo("합성 리뷰 원문");
        assertThat(jdbc.queryForObject("SELECT reservation_id FROM review WHERE review_id=4", Long.class)).isNull();
        verify(audit).recordReservationRetention(1L,"RETENTION_PURGE","RETENTION_EXPIRED");
    }
    @Test void unexpectedLinkedRecordRollsBackEveryDeletionAndReviewDetachment() {
        jdbc.execute("CREATE TABLE retained_link(reservation_id BIGINT REFERENCES reservation)");
        jdbc.update("INSERT INTO retained_link VALUES(1)");
        assertThatThrownBy(this::purge).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        for (String table : List.of("reservation","payment","refund_attempt","reservation_consent","reservation_request","test_settlement_payout","payment_webhook_inbox","audit_log"))
            assertThat(count(table)).as(table).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT reservation_id FROM review WHERE review_id=4", Long.class)).isEqualTo(1L);
        verifyNoInteractions(audit);
    }
    @Test void financialPendingAndUnfinishedWebhookDeferPurge() {
        when(payments.isReservationRemovalSafe(reservation)).thenReturn(false);
        assertThat(purge()).isEqualTo(ReservationRetentionWorker.Result.RETAINED);
        when(payments.isReservationRemovalSafe(reservation)).thenReturn(true);
        jdbc.update("UPDATE payment_webhook_inbox SET status='FAILED'");
        assertThat(purge()).isEqualTo(ReservationRetentionWorker.Result.RETAINED);
        assertThat(count("reservation_consent")).isEqualTo(1); verifyNoInteractions(audit);
    }
    @Test void disabledRetentionDoesNotTouchTablesOrRequireNewSchema() {
        var empty = mock(JdbcTemplate.class);
        var disabled = new ReservationRetentionWorker(reservations,payments,empty,data,audit,entities,false,false);
        assertThat(disabled.purge(1L,now)).isEqualTo(ReservationRetentionWorker.Result.DISABLED);
        verifyNoInteractions(empty,reservations,payments,audit,entities);
    }
    @Test void evidenceRequiresAnExplicitPurposeAndStrongAdminAuthentication() {
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::getCurrentMember).thenReturn(Member.builder().id(9L).role(Role.ADMIN).build());
            security.when(SecurityUtil::getLoginMethod).thenReturn("PASSWORD");
            assertThatThrownBy(() -> service.evidence(1L,ReservationRetentionService.Purpose.DISPUTE)).isInstanceOf(ReservationException.class);
            security.when(SecurityUtil::getLoginMethod).thenReturn("PASSKEY");
            assertThatThrownBy(() -> service.evidence(1L,null)).isInstanceOf(ReservationException.class);
            var evidence = tx.execute(ignored -> service.evidence(1L,ReservationRetentionService.Purpose.DISPUTE));
            assertThat(evidence.reservation().getMemberEmail()).isEqualTo("synthetic@example.test");
            assertThat(evidence.payments().getFirst()).doesNotContainKeys("raw_payload","access_token","buyer_tel");
            verify(audit).recordReservationRetention(1L,"EVIDENCE_READ","DISPUTE");
            security.when(SecurityUtil::getCurrentMember).thenReturn(Member.builder().id(9L).role(Role.BUSINESS).build());
            assertThatThrownBy(() -> service.evidence(1L,ReservationRetentionService.Purpose.DISPUTE)).isInstanceOf(ReservationException.class);
        }
    }
    @Test void holdsRequireCurrentCaseAndPreserveReleasedCaseHistory() {
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::getCurrentMember).thenReturn(Member.builder().id(9L).role(Role.ADMIN).build());
            security.when(SecurityUtil::getCurrentMemberId).thenReturn(9L);
            security.when(SecurityUtil::getLoginMethod).thenReturn("PASSWORD_MFA");
            assertThatThrownBy(() -> service.hold(1L,ReservationRetentionService.Purpose.DISPUTE,"synthetic@example.test"))
                    .isInstanceOf(ReservationException.class);
            tx.executeWithoutResult(ignored -> service.hold(1L,ReservationRetentionService.Purpose.DISPUTE,"CASE_1"));
            assertThat(data.held(1L)).isTrue();
            assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> service.release(1L,"CASE_2"))).isInstanceOf(ReservationException.class);
            tx.executeWithoutResult(ignored -> service.release(1L,"CASE_1"));
            assertThat(data.held(1L)).isFalse();
            tx.executeWithoutResult(ignored -> service.hold(1L,ReservationRetentionService.Purpose.LEGAL_REQUEST,"CASE_2"));
            assertThat(count("reservation_retention_hold")).isEqualTo(2);
            assertThat(data.held(1L)).isTrue();
        }
    }
    @Test void activationChecksTheWholeHoldSchemaAndPurgeCannotBeEnabledAlone() {
        assertThatCode(() -> org.springframework.test.util.ReflectionTestUtils.invokeMethod(service,"checkSchema")).doesNotThrowAnyException();
        jdbc.execute("ALTER TABLE reservation_retention_hold DROP COLUMN retention_hold_id");
        assertThatThrownBy(() -> org.springframework.test.util.ReflectionTestUtils.invokeMethod(service,"checkSchema"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        var unsafe = new ReservationRetentionWorker(reservations,payments,jdbc,data,audit,entities,false,true);
        assertThatThrownBy(() -> org.springframework.test.util.ReflectionTestUtils.invokeMethod(unsafe,"validateConfiguration"))
                .isInstanceOf(IllegalStateException.class);
    }
    @Test void expiredEvidenceCannotBeReadOrBroughtBackByANewHold() {
        reservation.setCreatedAt(LocalDateTime.of(2010,1,1,0,0));
        reservation.setUsageEndsAt(LocalDateTime.of(2010,1,1,12,0));
        jdbc.update("UPDATE payment SET created_at=?", LocalDateTime.of(2010,1,1,0,0));
        jdbc.update("UPDATE reservation_consent SET expires_at=?", LocalDateTime.of(2015,1,1,0,0));
        jdbc.update("UPDATE refund_attempt SET updated_at=?", LocalDateTime.of(2010,1,1,0,0));
        jdbc.update("UPDATE payment_reconciliation_issue SET last_seen_at=?,resolved_at=?", LocalDateTime.of(2010,1,1,0,0),LocalDateTime.of(2010,1,1,0,0));
        jdbc.update("UPDATE test_settlement_payout SET created_at=?", LocalDateTime.of(2010,1,1,0,0));
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::getCurrentMember).thenReturn(Member.builder().id(9L).role(Role.ADMIN).build());
            security.when(SecurityUtil::getLoginMethod).thenReturn("PASSKEY");
            assertThatThrownBy(() -> service.evidence(1L,ReservationRetentionService.Purpose.CONTRACT))
                    .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.GONE));
            assertThatThrownBy(() -> service.hold(1L,ReservationRetentionService.Purpose.DISPUTE,"CASE_1"))
                    .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.GONE));
            assertThat(data.held(1L)).isFalse(); verifyNoInteractions(audit);
        }
    }
    @Test void committedHoldWinsEvenWhenPurgeOpenedAReadBeforeTheHold() throws Exception {
        var repeatable = new DelegatingDataSource(source) {
            @Override public java.sql.Connection getConnection() throws java.sql.SQLException {
                var connection = super.getConnection();
                connection.setTransactionIsolation(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
                return connection;
            }
        };
        var database = new JdbcTemplate(repeatable);
        var manager = new DataSourceTransactionManager(repeatable);
        var currentData = new ReservationRetentionData(database);
        var protectedWorker = transactional(new ReservationRetentionWorker(reservations,payments,database,currentData,audit,entities,true,true),manager);
        var protectedService = transactional(new ReservationRetentionService(reservations,payments,audit,database,currentData,true),manager);
        var opened = new java.util.concurrent.CountDownLatch(1);
        var held = new java.util.concurrent.CountDownLatch(1);
        var observedIsolation = new java.util.concurrent.atomic.AtomicInteger();
        when(reservations.existsById(1L)).thenAnswer(ignored -> {
            var connection = org.springframework.jdbc.datasource.DataSourceUtils.getConnection(repeatable);
            try { observedIsolation.set(connection.getTransactionIsolation()); }
            finally { org.springframework.jdbc.datasource.DataSourceUtils.releaseConnection(connection,repeatable); }
            boolean exists = database.queryForObject("SELECT COUNT(*)>0 FROM reservation WHERE reservation_id=1", Boolean.class);
            opened.countDown();
            if (!held.await(5,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Hold did not commit");
            return exists;
        });
        doAnswer(ignored -> database.queryForObject("SELECT reservation_id FROM reservation WHERE reservation_id=1 FOR UPDATE", Long.class))
                .when(payments).lockReservationForStateChange(1L);
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(SecurityUtil::getCurrentMember).thenReturn(Member.builder().id(9L).role(Role.ADMIN).build());
            security.when(SecurityUtil::getCurrentMemberId).thenReturn(9L);
            security.when(SecurityUtil::getLoginMethod).thenReturn("PASSKEY");
            var pending = executor.submit(() -> protectedWorker.purge(1L,now));
            assertThat(opened.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            protectedService.hold(1L,ReservationRetentionService.Purpose.DISPUTE,"CASE_CONCURRENT");
            held.countDown();
            assertThat(pending.get(5,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(ReservationRetentionWorker.Result.RETAINED);
            assertThat(observedIsolation.get()).isEqualTo(java.sql.Connection.TRANSACTION_READ_COMMITTED);
            assertThat(currentData.held(1L)).isTrue(); assertThat(count("reservation")).isEqualTo(1);
            verify(audit,never()).recordReservationRetention(1L,"RETENTION_PURGE","RETENTION_EXPIRED");
        } finally { held.countDown(); executor.shutdownNow(); }
    }
    @Test void orderOnlyReconciliationExtendsEvidenceEvenBeforeIdsWereLinked() {
        jdbc.update("INSERT INTO payment_reconciliation_issue(merchant_uid,last_seen_at,resolved_at) VALUES('synthetic-retention-order',?,?)",
                LocalDateTime.of(2028,1,1,0,0),LocalDateTime.of(2028,1,2,0,0));
        assertThat(data.expiresAt(reservation)).isEqualTo(LocalDateTime.of(2033,1,2,0,0));
        assertThat(purge()).isEqualTo(ReservationRetentionWorker.Result.RETAINED);
    }
    @SuppressWarnings("unchecked")
    private static <T> T transactional(T target, org.springframework.transaction.PlatformTransactionManager manager) {
        var proxy = new org.springframework.aop.framework.ProxyFactory(target);
        proxy.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(manager,
                new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        return (T) proxy.getProxy();
    }
}
