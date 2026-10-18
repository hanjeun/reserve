package kr.it.reserve.config.updates;

import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.global.event.PublicContentChanged;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import java.util.Set;

/** Bulk withdrawal has no public author/member identifier in its invalidation. */
@Component @RequiredArgsConstructor
public class AccountUpdateInvalidations {
    private final EntityUpdates updates;

    @EventListener
    public void withdrawn(MemberWithdrawn ignored) { publicContentChanged(); }

    @EventListener
    public void visibilityChanged(PublicContentChanged ignored) { publicContentChanged(); }

    public void publicContentChanged() {
        invalidate(Set.of(EntityUpdates.Domain.FEED, EntityUpdates.Domain.COMMENT, EntityUpdates.Domain.NEWS,
                EntityUpdates.Domain.REVIEW, EntityUpdates.Domain.STORE));
    }

    public void avatarChanged() {
        invalidate(Set.of(EntityUpdates.Domain.FEED, EntityUpdates.Domain.COMMENT, EntityUpdates.Domain.REVIEW));
    }

    private void invalidate(Set<EntityUpdates.Domain> domains) {
        for (var domain : domains) {
            updates.publish(domain, 0L, null, null, EntityUpdates.Operation.INVALIDATED, true, Set.of(), false);
        }
    }
}
