package kr.it.reserve.store.service;

import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.search.StoreFulltextSearch;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class StoreDirectoryWaitingTest {
    private final StoreRepository stores = mock(StoreRepository.class);
    private final StoreWaitingCounts entries = mock(StoreWaitingCounts.class);
    private final StoreDirectory directory = new StoreDirectory(stores, mock(StoreFulltextSearch.class), false, entries);

    @Test void detailUsesTheDirectoryActiveTeamAggregateWithoutReadingCustomerEntries() {
        Store store = Store.builder().id(31L).name("가게").waitingIntakeMode(WaitingIntakeMode.BOTH).waitingPaused(true).build();
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        when(entries.activeTeams(31L)).thenReturn(3L);

        var response = directory.getStore(31L);

        assertThat(response.getWaitingTeams()).isEqualTo(3L);
        assertThat(response.getWaitingIntakeMode()).isEqualTo("BOTH");
        assertThat(response.getWaitingPaused()).isTrue();
        verify(entries).activeTeams(31L);
        verifyNoMoreInteractions(entries);
    }

    @Test void anEnabledStoreWithNoActiveRowsReturnsZeroTeams() {
        when(stores.findById(31L)).thenReturn(Optional.of(Store.builder().id(31L).name("가게")
                .waitingIntakeMode(WaitingIntakeMode.REMOTE).build()));
        when(entries.activeTeams(31L)).thenReturn(0L);
        assertThat(directory.getStore(31L).getWaitingTeams()).isZero();
    }

    @Test void aStoreWithoutWaitingDoesNotQueryOrInventAWaitingCount() {
        when(stores.findById(31L)).thenReturn(Optional.of(Store.builder().id(31L).name("가게")
                .waitingIntakeMode(WaitingIntakeMode.OFF).build()));
        assertThat(directory.getStore(31L).getWaitingTeams()).isNull();
        verifyNoInteractions(entries);
    }

    @Test void unavailableStoresFailBeforeReadingWaitingCounts() {
        Store deleted = Store.builder().id(31L).deletedAt(LocalDateTime.now()).build();
        Store suspended = Store.builder().id(32L).status(StoreStatus.SUSPENDED).build();
        when(stores.findById(31L)).thenReturn(Optional.of(deleted));
        when(stores.findById(32L)).thenReturn(Optional.of(suspended));
        when(stores.findById(33L)).thenReturn(Optional.empty());
        for (long id : List.of(31L, 32L, 33L)) {
            assertThatThrownBy(() -> directory.getStore(id)).isInstanceOf(StoreException.class);
        }
        verifyNoInteractions(entries);
    }
}
