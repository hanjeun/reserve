package kr.it.reserve.waiting.service;

import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Component
@RequiredArgsConstructor
public class WaitingAccountCleanup {
    private final WaitingEntryRepository entries;
    @Autowired(required = false)
    private WaitingEventPublisher updates;
    @Autowired(required = false)
    private StoreRepository stores;

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) {
        var affected = updates != null && stores != null
                ? entries.activeStoreIdsByMember(event.memberId(), WaitingStatus.ACTIVE) : List.<Long>of();
        entries.anonymizeMember(event.memberId(), WaitingStatus.ACTIVE, WaitingStatus.CANCELLED,
                LocalDateTime.now(ZoneOffset.UTC));
        for (Long storeId : affected) stores.findById(storeId).ifPresent(store -> updates.changed(store, null));
    }
}
