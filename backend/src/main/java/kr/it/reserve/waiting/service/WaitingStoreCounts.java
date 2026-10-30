package kr.it.reserve.waiting.service;

import kr.it.reserve.store.service.StoreWaitingCounts;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@RequiredArgsConstructor
public class WaitingStoreCounts implements StoreWaitingCounts {
    private final WaitingEntryRepository entries;

    @Override
    public long activeTeams(Long storeId) {
        return entries.countActiveByStores(List.of(storeId), WaitingStatus.ACTIVE).stream()
                .filter(count -> storeId.equals(count.getStoreId()))
                .mapToLong(WaitingEntryRepository.StoreWaitingCount::getTeams).findFirst().orElse(0L);
    }
}
