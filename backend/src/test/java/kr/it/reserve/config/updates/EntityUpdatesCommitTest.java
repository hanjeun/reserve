package kr.it.reserve.config.updates;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.transaction.event.TransactionalEventListenerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.Set;
import static kr.it.reserve.config.updates.EntityUpdates.Domain.*;
import static kr.it.reserve.config.updates.EntityUpdates.Operation.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class EntityUpdatesCommitTest {
    @Test
    void deliveryRunsOnlyAfterCommitAndRollbackOrNontransactionalPublishingNeverDelivers() {
        try (var context = new AnnotationConfigApplicationContext()) {
            EntityUpdateStream stream = mock(EntityUpdateStream.class);
            context.registerBean(TransactionalEventListenerFactory.class);
            context.registerBean(EntityUpdateStream.class, () -> stream);
            context.registerBean(EntityUpdates.class, () -> new EntityUpdates(context));
            context.refresh();
            EntityUpdates updates = context.getBean(EntityUpdates.class);
            updates.publish(FEED, 17L, null, null, UPDATED, true, Set.of(), false);
            verifyNoInteractions(stream);
            transaction(() -> {
                updates.publish(FEED, 17L, null, null, UPDATED, true, Set.of(), false);
                verifyNoInteractions(stream);
            }, true);
            verify(stream).changed(any(EntityUpdates.Change.class));
            clearInvocations(stream);
            transaction(() -> updates.publish(FEED, 17L, null, null, UPDATED, true, Set.of(), false), false);
            verifyNoInteractions(stream);
        }
    }

    @Test
    void publisherRejectsPublicPersonalDataAndMalformedIdentifiers() {
        EntityUpdates updates = new EntityUpdates(ignored -> { });
        for (var domain : Set.of(WAITING, LIKE, NOTIFICATION, FAVORITE, RESERVATION)) {
            assertThatIllegalArgumentException().isThrownBy(() -> updates.publish(domain, 17L, null, null, UPDATED, true, Set.of(), false));
        }
        assertThatIllegalArgumentException().isThrownBy(() -> updates.publish(FEED, 0L, null, null, UPDATED, true, Set.of(), false));
        assertThatIllegalArgumentException().isThrownBy(() -> updates.publish(FEED, -1L, null, null, UPDATED, true, Set.of(), false));
        assertThatCode(() -> updates.publish(FEED, 0L, null, null, INVALIDATED, true, Set.of(), false)).doesNotThrowAnyException();
    }

    private void transaction(Runnable work, boolean commit) {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            work.run();
            for (var synchronization : TransactionSynchronizationManager.getSynchronizations()) {
                if (commit) synchronization.afterCommit();
                synchronization.afterCompletion(commit ? TransactionSynchronization.STATUS_COMMITTED : TransactionSynchronization.STATUS_ROLLED_BACK);
            }
        } finally { TransactionSynchronizationManager.clear(); }
    }
}
