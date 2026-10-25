package kr.it.reserve.config.updates;

import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.global.event.PublicContentChanged;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import java.util.Set;

/** 탈퇴 일괄 갱신에는 공개 회원·작성자 식별자를 포함하지 않는다. */
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
