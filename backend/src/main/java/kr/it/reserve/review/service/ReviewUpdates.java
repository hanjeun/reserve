package kr.it.reserve.review.service;

import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.store.service.StoreUpdates;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.HashSet;

@Component @RequiredArgsConstructor
public class ReviewUpdates {
    private final EntityUpdates updates;

    public void updated(Review review) { changed(review, EntityUpdates.Operation.UPDATED); }

    public void deleted(Review review) { changed(review, EntityUpdates.Operation.DELETED); }

    public void changed(Review review, EntityUpdates.Operation operation) {
        var recipients = new HashSet<Long>();
        if (review.getMember() != null) recipients.add(review.getMember().getId());
        if (review.getStore().getOwner() != null) recipients.add(review.getStore().getOwner().getId());
        recipients.remove(null);
        Long storeId = review.getStore().getId();
        updates.publish(EntityUpdates.Domain.REVIEW, review.getId(), storeId, storeId, operation,
                StoreUpdates.publicStore(review.getStore()), recipients, false);
        updates.publish(EntityUpdates.Domain.STORE, storeId, null, storeId, EntityUpdates.Operation.UPDATED,
                StoreUpdates.publicStore(review.getStore()), recipients, false);
    }
}
