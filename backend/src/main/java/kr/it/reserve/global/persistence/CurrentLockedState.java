package kr.it.reserve.global.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.hibernate.Hibernate;
import org.hibernate.LockMode;
import org.hibernate.dialect.MySQLDialect;
import org.hibernate.engine.spi.EntityEntry;
import org.hibernate.engine.spi.PersistenceContext;
import org.hibernate.engine.spi.SessionImplementor;

/** MySQL RR에서 현재 행과 같은 관리 객체를 유지하고 다른 provider의 기존 refresh는 보존한다. */
public final class CurrentLockedState {
    private CurrentLockedState() { }

    public static void refresh(EntityManager entityManager, Object entity) {
        entityManager.flush();
        var session = entityManager.unwrap(SessionImplementor.class);
        if (!(session.getJdbcServices().getDialect() instanceof MySQLDialect)) {
            entityManager.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
            return;
        }
        var context = session.getPersistenceContextInternal();
        Object target = Hibernate.unproxy(entity);
        var original = State.capture(context, target);
        try {
            refreshOne(entityManager, context, target);
        } finally {
            original.restore(context);
        }
    }

    private static void refreshOne(EntityManager entityManager, PersistenceContext context, Object target) {
        // Hibernate 7.4.13은 이미 WRITE인 refresh를 READ로 낮춘다. DB 잠금은 유지하고 현재 읽기만 강제한다.
        var entry = context.getEntry(target);
        if (entry == null) throw new IllegalArgumentException("Locked refresh requires a managed entity");
        entry.setLockMode(LockMode.READ);
        entityManager.refresh(target, LockModeType.PESSIMISTIC_WRITE);
    }

    private record State(Object target, EntityEntry entry, LockMode lockMode) {
        static State capture(PersistenceContext context, Object target) {
            var entry = context.getEntry(target);
            if (entry == null) throw new IllegalArgumentException("Locked refresh requires a managed entity");
            return new State(target, entry, entry.getLockMode());
        }

        void restore(PersistenceContext context) {
            var current = context.getEntry(target);
            if (current != entry) entry.setLockMode(lockMode);
            if (current != null && lockMode.greaterThan(current.getLockMode())) current.setLockMode(lockMode);
        }
    }
}
