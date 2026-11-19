package kr.it.reserve.global.persistence;

import jakarta.persistence.EntityManager;
import org.hibernate.LockMode;
import org.hibernate.dialect.MySQLDialect;
import org.hibernate.engine.spi.EntityEntry;
import org.hibernate.engine.spi.PersistenceContext;
import org.hibernate.engine.spi.SessionImplementor;
import org.hibernate.engine.jdbc.spi.JdbcServices;

import java.util.IdentityHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

/** 규칙 단위 시험에 관리 객체별 잠금 메타데이터를 제공하고 실제 현재 읽기는 MySQL에서 검사한다. */
public final class CurrentLockedStateTestSupport {
    private CurrentLockedStateTestSupport() { }

    public static void managedEntities(EntityManager entityManager) {
        var session = mock(SessionImplementor.class);
        var context = mock(PersistenceContext.class);
        var jdbc = mock(JdbcServices.class);
        var entries = new IdentityHashMap<Object, EntityEntry>();
        lenient().when(entityManager.unwrap(SessionImplementor.class)).thenReturn(session);
        lenient().when(session.getPersistenceContextInternal()).thenReturn(context);
        lenient().when(session.getJdbcServices()).thenReturn(jdbc);
        lenient().when(jdbc.getDialect()).thenReturn(mock(MySQLDialect.class));
        lenient().when(context.getEntry(any())).thenAnswer(call -> entries.computeIfAbsent(call.getArgument(0), ignored -> {
            var entry = mock(EntityEntry.class);
            var mode = new AtomicReference<>(LockMode.PESSIMISTIC_WRITE);
            lenient().when(entry.getLockMode()).thenAnswer(unused -> mode.get());
            lenient().doAnswer(change -> { mode.set(change.getArgument(0)); return null; }).when(entry).setLockMode(any());
            return entry;
        }));
        lenient().doAnswer(call -> {
            context.getEntry(call.getArgument(0)).setLockMode(LockMode.PESSIMISTIC_WRITE);
            return null;
        }).when(entityManager).refresh(any(), any(jakarta.persistence.LockModeType.class));
    }
}
