package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.global.persistence.CurrentLockedState;
import kr.it.reserve.member.entity.Member;
import org.hibernate.LockMode;
import org.hibernate.dialect.H2Dialect;
import org.hibernate.dialect.MySQLDialect;
import org.hibernate.engine.jdbc.spi.JdbcServices;
import org.hibernate.engine.spi.EntityEntry;
import org.hibernate.engine.spi.PersistenceContext;
import org.hibernate.engine.spi.SessionImplementor;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CurrentLockedStateTest {
    @Test
    void aRefreshExceptionRestoresTheOriginalAndReplacementEntryWithoutDetachingTheObject() {
        var entityManager = mock(EntityManager.class);
        var session = mock(SessionImplementor.class);
        var context = mock(PersistenceContext.class);
        var member = Member.builder().id(1L).build();
        var original = entry(LockMode.PESSIMISTIC_WRITE);
        var replacement = entry(LockMode.READ);
        var current = new AtomicReference<>(original);
        when(entityManager.unwrap(SessionImplementor.class)).thenReturn(session);
        useMySql(session);
        when(session.getPersistenceContextInternal()).thenReturn(context);
        when(context.getEntry(member)).thenAnswer(ignored -> current.get());
        doAnswer(ignored -> {
            assertThat(original.getLockMode()).isEqualTo(LockMode.READ);
            current.set(replacement);
            throw new IllegalStateException("synthetic refresh failure");
        }).when(entityManager).refresh(member, LockModeType.PESSIMISTIC_WRITE);

        assertThatThrownBy(() -> CurrentLockedState.refresh(entityManager, member)).isInstanceOf(IllegalStateException.class);
        assertThat(original.getLockMode()).isEqualTo(LockMode.PESSIMISTIC_WRITE);
        assertThat(replacement.getLockMode()).isEqualTo(LockMode.PESSIMISTIC_WRITE);
        verify(entityManager, never()).detach(any());
        verify(entityManager, never()).clear();
    }

    @Test
    void aFlushFailureNeverChangesLockMetadataOrStartsARefresh() {
        var entityManager = mock(EntityManager.class);
        doThrow(new IllegalStateException("synthetic flush failure")).when(entityManager).flush();
        assertThatThrownBy(() -> CurrentLockedState.refresh(entityManager, new Object())).isInstanceOf(IllegalStateException.class);
        verify(entityManager, never()).unwrap(any());
        verify(entityManager, never()).refresh(any(), any(LockModeType.class));
    }

    @Test
    void thePreviousStrongerWriteModeIsPreservedAfterARefreshReplacesTheEntry() {
        var entityManager = mock(EntityManager.class);
        var session = mock(SessionImplementor.class);
        var context = mock(PersistenceContext.class);
        var member = Member.builder().id(1L).build();
        var original = entry(LockMode.WRITE);
        var replacement = entry(LockMode.PESSIMISTIC_WRITE);
        var current = new AtomicReference<>(original);
        when(entityManager.unwrap(SessionImplementor.class)).thenReturn(session);
        useMySql(session);
        when(session.getPersistenceContextInternal()).thenReturn(context);
        when(context.getEntry(member)).thenAnswer(ignored -> current.get());
        doAnswer(ignored -> { current.set(replacement); return null; }).when(entityManager).refresh(member, LockModeType.PESSIMISTIC_WRITE);

        CurrentLockedState.refresh(entityManager, member);
        assertThat(original.getLockMode()).isEqualTo(LockMode.WRITE);
        assertThat(replacement.getLockMode()).isEqualTo(LockMode.WRITE);
    }

    @Test
    void otherDialectsKeepTheirOriginalJpaRefreshWithoutChangingEntryMetadata() {
        var entityManager = mock(EntityManager.class);
        var session = mock(SessionImplementor.class);
        var jdbc = mock(JdbcServices.class);
        var member = Member.builder().id(1L).build();
        when(entityManager.unwrap(SessionImplementor.class)).thenReturn(session);
        when(session.getJdbcServices()).thenReturn(jdbc);
        when(jdbc.getDialect()).thenReturn(mock(H2Dialect.class));

        CurrentLockedState.refresh(entityManager, member);
        verify(entityManager).refresh(member, LockModeType.PESSIMISTIC_WRITE);
        verify(session, never()).getPersistenceContextInternal();
    }

    private static void useMySql(SessionImplementor session) {
        var jdbc = mock(JdbcServices.class);
        when(session.getJdbcServices()).thenReturn(jdbc);
        when(jdbc.getDialect()).thenReturn(mock(MySQLDialect.class));
    }

    private static EntityEntry entry(LockMode initial) {
        var entry = mock(EntityEntry.class);
        var mode = new AtomicReference<>(initial);
        when(entry.getLockMode()).thenAnswer(ignored -> mode.get());
        doAnswer(call -> { mode.set(call.getArgument(0)); return null; }).when(entry).setLockMode(any());
        return entry;
    }
}
