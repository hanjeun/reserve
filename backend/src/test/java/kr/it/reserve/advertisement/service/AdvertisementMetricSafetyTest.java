package kr.it.reserve.advertisement.service;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdvertisementMetricSafetyTest {

    @Mock private AdvertisementRepository advertisementRepository;
    @Spy private AdCounterBuffer adCounterBuffer = new AdCounterBuffer();
    @InjectMocks private AdvertisementService advertisementService;

    @Test
    void recordsImpressionsForActiveBadgesAndClicksForActiveBanners() {
        when(advertisementRepository.findById(1L)).thenReturn(Optional.of(activeAd(1L, AdType.BADGE)));
        when(advertisementRepository.findById(2L)).thenReturn(Optional.of(activeAd(2L, AdType.BANNER)));

        advertisementService.recordImpression(1L);
        advertisementService.recordClick(2L);

        verify(adCounterBuffer).increment(1L, AdCounterBuffer.CounterType.IMPRESSION);
        verify(adCounterBuffer).increment(2L, AdCounterBuffer.CounterType.CLICK);
    }

    @Test
    void missingInactiveDeletedExpiredAndTypeMismatchedAdsAreNoOps() {
        Advertisement inactive = activeAd(2L, AdType.BANNER);
        inactive.setStatus(AdStatus.SUSPENDED);
        Advertisement deleted = activeAd(3L, AdType.BANNER);
        deleted.softDelete();
        Advertisement expired = activeAd(4L, AdType.BANNER);
        expired.setEndDate(ServiceTime.today().minusDays(1));
        Advertisement badge = activeAd(5L, AdType.BADGE);
        Advertisement closedStore = activeAd(6L, AdType.BANNER);
        closedStore.getStore().softDelete();

        when(advertisementRepository.findById(1L)).thenReturn(Optional.empty());
        when(advertisementRepository.findById(2L)).thenReturn(Optional.of(inactive));
        when(advertisementRepository.findById(3L)).thenReturn(Optional.of(deleted));
        when(advertisementRepository.findById(4L)).thenReturn(Optional.of(expired));
        when(advertisementRepository.findById(5L)).thenReturn(Optional.of(badge));
        when(advertisementRepository.findById(6L)).thenReturn(Optional.of(closedStore));

        advertisementService.recordImpression(1L);
        advertisementService.recordImpression(2L);
        advertisementService.recordImpression(3L);
        advertisementService.recordImpression(4L);
        advertisementService.recordClick(5L);
        advertisementService.recordImpression(6L);
        advertisementService.recordImpression(-1L);

        verifyNoInteractions(adCounterBuffer);
        verify(advertisementRepository, never()).findById(-1L);
    }

    @Test
    void failedFlushRestoresBothBucketsAndSuccessfulRetryDoesNotReplayAgain() {
        adCounterBuffer.increment(11L, AdCounterBuffer.CounterType.IMPRESSION);
        adCounterBuffer.increment(11L, AdCounterBuffer.CounterType.IMPRESSION);
        adCounterBuffer.increment(12L, AdCounterBuffer.CounterType.CLICK);
        doThrow(new IllegalStateException("database unavailable"))
                .when(advertisementRepository).addImpressionCount(11L, 2L);

        assertThatThrownBy(advertisementService::flushCounters)
                .isInstanceOf(IllegalStateException.class);

        clearInvocations(advertisementRepository);
        doNothing().when(advertisementRepository).addImpressionCount(11L, 2L);
        advertisementService.flushCounters();

        verify(advertisementRepository).addImpressionCount(11L, 2L);
        verify(advertisementRepository).addClickCount(12L, 1L);

        clearInvocations(advertisementRepository);
        advertisementService.flushCounters();
        verifyNoInteractions(advertisementRepository);
    }

    @Test
    void commitPhaseRollbackRestoresDrainedBucketsExactlyOnce() {
        adCounterBuffer.increment(21L, AdCounterBuffer.CounterType.IMPRESSION);
        adCounterBuffer.increment(22L, AdCounterBuffer.CounterType.CLICK);
        TransactionSynchronization synchronization;

        TransactionSynchronizationManager.initSynchronization();
        try {
            advertisementService.flushCounters();
            assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);
            synchronization = TransactionSynchronizationManager.getSynchronizations().getFirst();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        clearInvocations(advertisementRepository);
        synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        // 일부 transaction manager가 완료 콜백을 중복 전달해도 델타는 한 번만 복원돼야 한다.
        synchronization.afterCompletion(TransactionSynchronization.STATUS_UNKNOWN);
        advertisementService.flushCounters();

        verify(advertisementRepository).addImpressionCount(21L, 1L);
        verify(advertisementRepository).addClickCount(22L, 1L);

        clearInvocations(advertisementRepository);
        advertisementService.flushCounters();
        verifyNoInteractions(advertisementRepository);
    }

    @Test
    void myAdsPaginationClampsNegativePageAndOversizedPageSize() {
        Member owner = Member.builder().id(7L).build();
        when(advertisementRepository.findMyAds(eq(owner), eq(0L), eq(""), any(Pageable.class)))
                .thenReturn(Page.empty());

        Page<?> result = advertisementService.getMyAds(owner, -5, 1_000, null, null);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(advertisementRepository).findMyAds(eq(owner), eq(0L), eq(""), pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isZero();
        assertThat(pageable.getValue().getPageSize()).isEqualTo(100);
        assertThat(result).isEmpty();
    }

    @Test
    void myAdsFiltersAtTheDatabaseAndEscapesLikeWildcards() {
        Member owner = Member.builder().id(8L).build();
        when(advertisementRepository.findMyAds(eq(owner), eq(42L), eq("50!%!!sale!_"), any(Pageable.class)))
                .thenReturn(Page.empty());

        advertisementService.getMyAds(owner, 0, 20, 42L, " 50%!sale_ ");

        verify(advertisementRepository)
                .findMyAds(eq(owner), eq(42L), eq("50!%!!sale!_"), any(Pageable.class));
    }

    private Advertisement activeAd(Long id, AdType type) {
        return Advertisement.builder()
                .id(id)
                .store(Store.builder().id(100L + id).status(StoreStatus.ACTIVE).build())
                .adType(type)
                .status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today().minusDays(1))
                .endDate(ServiceTime.today().plusDays(1))
                .build();
    }
}
