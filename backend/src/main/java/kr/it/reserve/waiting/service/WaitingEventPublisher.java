package kr.it.reserve.waiting.service;

import kr.it.reserve.store.entity.Store;
import kr.it.reserve.waiting.entity.WaitingEntry;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class WaitingEventPublisher {
    private final WaitingEntryRepository entries;
    private final ApplicationEventPublisher events;

    public void changed(Store store, WaitingEntry entry) {
        Set<Long> recipients = new HashSet<>(entries.activeMemberIds(store.getId(), WaitingStatus.ACTIVE));
        if (store.getOwner() != null) recipients.add(store.getOwner().getId());
        if (entry != null && entry.getMemberId() != null) recipients.add(entry.getMemberId());
        recipients.remove(null);
        events.publishEvent(new Changed(store.getId(), Set.copyOf(recipients)));
    }

    public record Changed(Long storeId, Set<Long> memberIds) {}
}
