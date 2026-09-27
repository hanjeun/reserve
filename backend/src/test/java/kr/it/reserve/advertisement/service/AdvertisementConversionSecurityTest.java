package kr.it.reserve.advertisement.service;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdvertisementConversionSecurityTest {

    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private ReservationRepository reservationRepository;
    @InjectMocks private AdvertisementService advertisementService;

    @Test
    void incrementsOnlyAfterTheReservationIsAtomicallyClaimed() {
        Member member = Member.builder().id(7L).build();
        Advertisement ad = activeBanner(11L, 31L);
        when(advertisementRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(ad));
        when(reservationRepository.claimAdvertisementConversion(
                eq(41L), eq(7L), eq(31L), eq(11L), any(LocalDateTime.class),
                eq(List.of(Reservation.ReservationStatus.PENDING, Reservation.ReservationStatus.CONFIRMED))))
                .thenReturn(1);

        advertisementService.recordConversion(11L, 41L, member);

        verify(advertisementRepository).addConversionCount(11L, 1);
    }

    @Test
    void doesNotIncrementWhenTheReservationWasAlreadyClaimedOrFailsTheRepositoryGuards() {
        Member member = Member.builder().id(7L).build();
        Advertisement ad = activeBanner(11L, 31L);
        when(advertisementRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(ad));
        when(reservationRepository.claimAdvertisementConversion(
                eq(41L), eq(7L), eq(31L), eq(11L), any(LocalDateTime.class), any()))
                .thenReturn(0);

        advertisementService.recordConversion(11L, 41L, member);

        verify(advertisementRepository, never()).addConversionCount(11L, 1);
    }

    @Test
    void rejectsAAdvertisementThatIsNotAnActiveBannerBeforeTouchingReservations() {
        Member member = Member.builder().id(7L).build();
        Advertisement badge = Advertisement.builder()
                .id(11L)
                .store(Store.builder().id(31L).build())
                .adType(AdType.BADGE)
                .status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today().minusDays(1))
                .endDate(ServiceTime.today().plusDays(1))
                .build();
        when(advertisementRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(badge));

        assertThatThrownBy(() -> advertisementService.recordConversion(11L, 41L, member))
                .isInstanceOf(AdvertisementException.class)
                .hasMessageContaining("배너");
        verify(reservationRepository, never()).claimAdvertisementConversion(
                any(), any(), any(), any(), any(), any());
    }

    @Test
    void rejectsMissingInactiveAndDeletedAdvertisementsBeforeTouchingReservations() {
        Member member = Member.builder().id(7L).build();
        Advertisement inactive = activeBanner(12L, 31L);
        inactive.setStatus(AdStatus.SUSPENDED);
        Advertisement deleted = activeBanner(13L, 31L);
        deleted.softDelete();
        when(advertisementRepository.findByIdForUpdate(11L)).thenReturn(Optional.empty());
        when(advertisementRepository.findByIdForUpdate(12L)).thenReturn(Optional.of(inactive));
        when(advertisementRepository.findByIdForUpdate(13L)).thenReturn(Optional.of(deleted));

        assertThatThrownBy(() -> advertisementService.recordConversion(11L, 41L, member))
                .isInstanceOf(AdvertisementException.class);
        assertThatThrownBy(() -> advertisementService.recordConversion(12L, 41L, member))
                .isInstanceOf(AdvertisementException.class);
        assertThatThrownBy(() -> advertisementService.recordConversion(13L, 41L, member))
                .isInstanceOf(AdvertisementException.class);

        verify(reservationRepository, never()).claimAdvertisementConversion(
                any(), any(), any(), any(), any(), any());
    }

    private Advertisement activeBanner(Long id, Long storeId) {
        return Advertisement.builder()
                .id(id)
                .store(Store.builder().id(storeId).build())
                .adType(AdType.BANNER)
                .status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today().minusDays(1))
                .endDate(ServiceTime.today().plusDays(1))
                .build();
    }
}
