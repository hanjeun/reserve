package kr.it.reserve.reservation.scheduler;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.env.MockEnvironment;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalUnpaidExpiryConfigTest {
    private final ReservationExpiryScheduler expiry = mock(ReservationExpiryScheduler.class);
    private final DataSource source = mock(DataSource.class);

    @Test void disabledPreviewDoesNotCreateAnExpiryWorker() {
        new ApplicationContextRunner().withUserConfiguration(LocalUnpaidExpiryConfig.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
                .run(context -> {
                    assertThat(context).hasNotFailed().doesNotHaveBean("localUnpaidExpiryExecutor");
                    verifyNoInteractions(source, expiry);
                });
    }

    @Test void explicitlyEnabledLoopbackWorkerStartsAndClosesWithoutImmediatePgWork() throws Exception {
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getURL()).thenReturn("jdbc:mysql://127.0.0.1:3306/reserve?serverTimezone=Asia/Seoul");
        var captured = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.ScheduledExecutorService>();
        new ApplicationContextRunner().withUserConfiguration(LocalUnpaidExpiryConfig.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("local"))
                .withPropertyValues("reserve.preview.unpaid-expiry-enabled=true", "reserve.scheduling.enabled=false",
                        "server.address=127.0.0.1")
                .withBean(DataSource.class, () -> source).withBean(ReservationExpiryScheduler.class, () -> expiry)
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(java.util.concurrent.ScheduledExecutorService.class);
                    captured.set(context.getBean(java.util.concurrent.ScheduledExecutorService.class));
                    assertThat(captured.get().isShutdown()).isFalse();
                    verifyNoInteractions(expiry);
                });
        assertThat(captured.get().isShutdown()).isTrue();
        verify(connection).close();
    }

    @Test void globalSchedulingOrRemoteBindingCannotEnableThePreviewWorker() {
        var config = new LocalUnpaidExpiryConfig();
        assertThatThrownBy(() -> config.localUnpaidExpiryExecutor(expiry, source,
                new MockEnvironment().withProperty("server.address", "127.0.0.1")))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> config.localUnpaidExpiryExecutor(expiry, source,
                new MockEnvironment().withProperty("server.address", "0.0.0.0").withProperty("reserve.scheduling.enabled", "false")))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(source, expiry);
    }

    @Test void remoteDatabaseIsRejectedEvenWhenTheHttpListenerIsLocal() throws Exception {
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getURL()).thenReturn("jdbc:mysql://remote.example.test:3306/reserve");
        assertThatThrownBy(() -> new LocalUnpaidExpiryConfig().localUnpaidExpiryExecutor(expiry, source,
                new MockEnvironment().withProperty("server.address", "127.0.0.1").withProperty("reserve.scheduling.enabled", "false")))
                .isInstanceOf(IllegalStateException.class);
        verify(connection).close();
        verifyNoInteractions(expiry);
    }
}
