package kr.it.reserve.config.updates;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.util.Set;

/** Metadata-only invalidations. Recipients are internal and are never serialized into SSE. */
@Component
@RequiredArgsConstructor
public class EntityUpdates {
    public enum Domain { NEWS, WAITING, FEED, COMMENT, LIKE, NOTIFICATION, STORE, REVIEW, FAVORITE, RESERVATION }
    public enum Operation { CREATED, UPDATED, DELETED, INVALIDATED }
    public enum TargetType { POST, NEWS, COMMENT }
    private static final Set<Domain> PRIVATE_DOMAINS = Set.of(Domain.WAITING, Domain.LIKE,
            Domain.NOTIFICATION, Domain.FAVORITE, Domain.RESERVATION);

    private final ApplicationEventPublisher events;

    public void publish(Domain domain, Long entityId, Long parentId, Long storeId, Operation operation,
                        boolean publiclyVisible, Set<Long> members, boolean administrators) {
        publish(domain, entityId, parentId, storeId, operation, null, publiclyVisible, members, administrators);
    }

    public void publish(Domain domain, Long entityId, Long parentId, Long storeId, Operation operation,
                        TargetType targetType, boolean publiclyVisible, Set<Long> members, boolean administrators) {
        if (domain == null || operation == null || entityId == null || entityId < 0) {
            throw new IllegalArgumentException("An update requires a domain, nonnegative ID and operation");
        }
        if (entityId == 0 && operation != Operation.INVALIDATED) {
            throw new IllegalArgumentException("Only collection invalidations may use ID zero");
        }
        if (publiclyVisible && PRIVATE_DOMAINS.contains(domain)) {
            throw new IllegalArgumentException("Personal updates cannot be public");
        }
        events.publishEvent(new Change(domain, entityId, parentId, storeId, operation, targetType,
                publiclyVisible, members == null ? Set.of() : Set.copyOf(members), administrators));
    }

    public record Change(Domain domain, Long entityId, Long parentId, Long storeId, Operation operation,
                         TargetType targetType, boolean publiclyVisible, Set<Long> members, boolean administrators) { }

    static boolean publicChange(Change change) {
        return change.publiclyVisible() && !PRIVATE_DOMAINS.contains(change.domain());
    }
}
