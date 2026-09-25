package kr.it.reserve.advertisement.service;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdvertisementBoundaryTest {
    @Mock private AdvertisementRepository repository;
    @InjectMocks private AdvertisementService service;

    @ParameterizedTest
    @EnumSource(AdType.class)
    void amountCannotOverflowOrBecomeNegative(AdType type) {
        int price = type == AdType.BADGE ? 1000 : 5000;
        assertEquals(price, AdvertisementService.calculateAmount(type, 1));
        long limit = Integer.MAX_VALUE / price;
        assertEquals(limit * price, AdvertisementService.calculateAmount(type, limit));
        assertThrows(AdvertisementException.class, () -> AdvertisementService.calculateAmount(type, limit + 1));
        assertThrows(AdvertisementException.class, () -> AdvertisementService.calculateAmount(type, Long.MAX_VALUE));
        assertThrows(AdvertisementException.class, () -> AdvertisementService.calculateAmount(type, 0));
    }

    @Test
    void publicAdsExcludeDeletedAdsAndClosedOrSuspendedStores() {
        var visible = ad(1, Store.builder().id(1L).status(StoreStatus.ACTIVE).build());
        var closed = ad(2, Store.builder().id(2L).deletedAt(LocalDateTime.now()).build());
        var banned = ad(3, Store.builder().id(3L).status(StoreStatus.BANNED).build());
        var suspended = ad(4, Store.builder().id(4L).status(StoreStatus.SUSPENDED).build());
        var deleted = ad(5, Store.builder().id(5L).build());
        deleted.softDelete();
        when(repository.findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByCreatedAtDesc(
                eq(AdStatus.ACTIVE), eq(AdType.BADGE), any(), any())).thenReturn(List.of(visible, closed, banned, suspended, deleted));
        assertEquals(List.of(1L), service.getActiveAds(AdType.BADGE).stream().map(value -> value.getId()).toList());
    }

    private Advertisement ad(long id, Store store) {
        return Advertisement.builder().id(id).store(store).adType(AdType.BADGE).status(AdStatus.ACTIVE).build();
    }
}
