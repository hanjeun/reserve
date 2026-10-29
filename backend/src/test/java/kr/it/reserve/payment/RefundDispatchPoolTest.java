package kr.it.reserve.payment;
import com.zaxxer.hikari.HikariDataSource;
import kr.it.reserve.payment.service.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
@Timeout(15)
class RefundDispatchPoolTest {
    private HikariDataSource source() {
        var source = new HikariDataSource();
        source.setJdbcUrl("jdbc:h2:mem:refund-pool-" + java.util.UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
        source.setMaximumPoolSize(1); source.setMinimumIdle(0); source.setConnectionTimeout(500);
        return source;
    }
    @Test void slowPgDoesNotKeepTheRequestConnectionOrBlockOtherDbRequests() throws Exception {
        try (var source = source(); var caller = Executors.newSingleThreadExecutor(); var worker = Executors.newSingleThreadExecutor()) {
            var jdbc = new JdbcTemplate(source); jdbc.execute("CREATE TABLE decision(id BIGINT PRIMARY KEY)");
            var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
            var payments = mock(PaymentService.class);
            var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
            var activeTransaction = new AtomicBoolean(true);
            doAnswer(call -> {
                activeTransaction.set(TransactionSynchronizationManager.isActualTransactionActive());
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Release timed out");
                return null;
            }).when(payments).dispatchPreparedRefund(41L);
            var dispatch = new RefundDispatchService(payments, worker);
            try {
                var commit = caller.submit(() -> tx.executeWithoutResult(status -> { jdbc.update("INSERT INTO decision VALUES(41)"); dispatch.afterCommit(41L); }));
                commit.get(2, TimeUnit.SECONDS);
                assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
                assertThat(activeTransaction.get()).isFalse();
                assertThat(source.getHikariPoolMXBean().getActiveConnections()).isZero();
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM decision", Integer.class)).isEqualTo(1);
                verify(payments, times(1)).dispatchPreparedRefund(41L);
            } finally { release.countDown(); }
        }
    }
    @Test void aFullDispatchQueueKeepsTheCommittedDecisionAndDoesNotSendPgAgain() {
        try (var source = source()) {
            var jdbc = new JdbcTemplate(source); jdbc.execute("CREATE TABLE decision(id BIGINT PRIMARY KEY)");
            var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
            var payments = mock(PaymentService.class);
            var dispatch = new RefundDispatchService(payments, command -> { throw new RejectedExecutionException("synthetic full queue"); });
            assertThatCode(() -> tx.executeWithoutResult(status -> { jdbc.update("INSERT INTO decision VALUES(42)"); dispatch.afterCommit(42L); })).doesNotThrowAnyException();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM decision", Integer.class)).isEqualTo(1);
            verifyNoInteractions(payments);
        }
    }
    @Test void rolledBackDecisionsNeverEnterTheDispatchQueue() {
        try (var source = source()) {
            var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
            var executor = mock(Executor.class); var payments = mock(PaymentService.class);
            var dispatch = new RefundDispatchService(payments, executor);
            assertThatThrownBy(() -> tx.executeWithoutResult(status -> { dispatch.afterCommit(43L); throw new IllegalStateException("synthetic rollback"); }))
                    .isInstanceOf(IllegalStateException.class);
            verifyNoInteractions(executor, payments);
        }
    }
}
