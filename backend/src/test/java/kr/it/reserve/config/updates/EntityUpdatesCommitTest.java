package kr.it.reserve.config.updates;

import kr.it.reserve.global.event.PublicContentChanged;
import org.mockito.ArgumentCaptor;
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
    void visibilityInvalidationsKeepIdentifiersPrivateAndDeliverOnlyAfterCommit() {
        try (var context = new AnnotationConfigApplicationContext()) {
            EntityUpdateStream stream = mock(EntityUpdateStream.class);
            context.registerBean(TransactionalEventListenerFactory.class);
            context.registerBean(EntityUpdateStream.class, () -> stream);
            context.registerBean(EntityUpdates.class, () -> new EntityUpdates(context));
            context.registerBean(AccountUpdateInvalidations.class);
            context.refresh();
            context.publishEvent(new PublicContentChanged());
            verifyNoInteractions(stream);
            transaction(() -> {
                context.publishEvent(new PublicContentChanged());
                verifyNoInteractions(stream);
            }, true);
            var delivered = ArgumentCaptor.forClass(EntityUpdates.Change.class);
            verify(stream, times(5)).changed(delivered.capture());
            assertThat(delivered.getAllValues()).extracting(EntityUpdates.Change::domain)
                    .containsExactlyInAnyOrder(FEED, COMMENT, NEWS, REVIEW, STORE);
            assertThat(delivered.getAllValues()).allSatisfy(change -> {
                assertThat(change.entityId()).isZero();
                assertThat(change.parentId()).isNull();
                assertThat(change.storeId()).isNull();
                assertThat(change.members()).isEmpty();
                assertThat(change.publiclyVisible()).isTrue();
                assertThat(change.operation()).isEqualTo(INVALIDATED);
            });
            clearInvocations(stream);
            transaction(() -> context.publishEvent(new PublicContentChanged()), false);
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
