package kr.it.reserve.store.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import java.util.Set;

@Component @RequiredArgsConstructor
public class StoreUpdates {
    private final EntityUpdates updates;
    private final ApplicationEventPublisher events;

    public void updated(Store store, boolean wasPublic) { changed(store, EntityUpdates.Operation.UPDATED, wasPublic); }

    public void changed(Store store, EntityUpdates.Operation operation, boolean wasPublic) {
        Long owner = store.getOwner() == null ? null : store.getOwner().getId();
        boolean publiclyVisible = wasPublic || publicStore(store);
        updates.publish(EntityUpdates.Domain.STORE, store.getId(), null, store.getId(), operation,
                publiclyVisible, owner == null ? Set.of() : Set.of(owner), true);
        if (publiclyVisible) events.publishEvent(new RegionsChanged());
    }

    public static boolean publicStore(Store store) {
        return store != null && !store.isDeleted() && !store.isSuspended();
    }

    record RegionsChanged() { }
}
