package kr.it.reserve.waiting.service;

import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Component
@RequiredArgsConstructor
public class WaitingAccountCleanup {
    private final WaitingEntryRepository entries;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private WaitingEventPublisher updates;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private kr.it.reserve.store.repository.StoreRepository stores;

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) {
        var affected = updates != null && stores != null
                ? entries.activeStoreIdsByMember(event.memberId(), WaitingStatus.ACTIVE) : java.util.List.<Long>of();
        entries.anonymizeMember(event.memberId(), WaitingStatus.ACTIVE, WaitingStatus.CANCELLED,
                LocalDateTime.now(ZoneOffset.UTC));
        for (Long storeId : affected) stores.findById(storeId).ifPresent(store -> updates.changed(store, null));
    }
}
