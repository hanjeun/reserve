package kr.it.reserve.store.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.Set;

@Component @RequiredArgsConstructor
public class StoreUpdates {
    private final EntityUpdates updates;

    public void changed(Store store, EntityUpdates.Operation operation, boolean wasPublic) {
        Long owner = store.getOwner() == null ? null : store.getOwner().getId();
        updates.publish(EntityUpdates.Domain.STORE, store.getId(), null, store.getId(), operation,
                wasPublic || publicStore(store), owner == null ? Set.of() : Set.of(owner), true);
    }

    public static boolean publicStore(Store store) {
        return store != null && !store.isDeleted() && !store.isSuspended();
    }
}
