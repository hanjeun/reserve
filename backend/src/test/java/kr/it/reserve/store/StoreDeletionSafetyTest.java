package kr.it.reserve.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.controller.StoreApiController;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Optional;
import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 가게 삭제가 진행 중인 예약과 결제 원장을 우회하지 못하도록 공개 API와 서비스 관문을 고정한다.
 */
@ExtendWith(MockitoExtension.class)
class StoreDeletionSafetyTest {

    @Mock private StoreRepository storeRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private FileDeletionOutboxService fileDeletionOutboxService;
    @Mock private DataLifecycleGuard dataLifecycleGuard;
    @Mock private ReservationRepository reservationRepository;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private PromotionRepository promotionRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private ObjectMapper objectMapper;
    @Mock private Executor imageUploadExecutor;

    @InjectMocks
    private StoreService storeService;

    @Test
    @DisplayName("가게 삭제 API는 force 우회 파라미터를 노출하지 않는다")
    void deleteEndpointDoesNotExposeForceOverride() {
        Method deleteStore = Arrays.stream(StoreApiController.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("deleteStore"))
                .findFirst()
                .orElseThrow();

        assertThat(deleteStore.getParameterTypes()).containsExactly(Long.class);
    }

    @Test
    @DisplayName("거래 원장을 우회하는 가게·회원 일괄 삭제 repository 관문이 없다")
    void financialBulkDeleteMethodsDoNotExist() {
        assertThat(Arrays.stream(PaymentRepository.class.getDeclaredMethods())
                .map(Method::getName).toList()).doesNotContain("deleteByStoreId");
        assertThat(Arrays.stream(ReviewRepository.class.getDeclaredMethods())
                .map(Method::getName).toList()).doesNotContain("deleteByStoreId", "deleteByMemberId");
        assertThat(Arrays.stream(ReservationRepository.class.getDeclaredMethods())
                .map(Method::getName).toList()).doesNotContain(
                        "deleteByStoreId", "deleteByMemberId", "hardDeleteByDeletedAtBefore");
    }

    @Test
    @DisplayName("진행 중인 예약이 있으면 결제와 예약 데이터를 삭제하지 않는다")
    void activeReservationsBlockEveryDestructiveDelete() {
        Long storeId = 7L;
        Member owner = Member.builder().id(1L).build();
        Store store = Store.builder().id(storeId).owner(owner).build();

        when(storeRepository.findByIdForUpdate(storeId)).thenReturn(Optional.of(store));
        org.mockito.Mockito.doThrow(new StoreException(
                        "가게 영업을 종료하기 전에 미결 항목을 처리해주세요. 예약 2건",
                        org.springframework.http.HttpStatus.CONFLICT))
                .when(dataLifecycleGuard).requireStoreClosureAllowed(storeId);

        assertThatThrownBy(() -> storeService.deleteStore(storeId, owner))
                .isInstanceOf(StoreException.class)
                .hasMessageContaining("미결 항목")
                .hasMessageContaining("예약 2건");

        verify(dataLifecycleGuard).requireStoreClosureAllowed(storeId);
        verify(storeRepository).findByIdForUpdate(storeId);
        verify(favoriteRepository, never()).deleteByStoreId(storeId);
        verify(promotionRepository, never()).deleteByStoreId(storeId);
        verify(storeRepository, never()).delete(any(Store.class));
        verifyNoInteractions(fileStorageService);
        verifyNoInteractions(fileDeletionOutboxService);
    }

    @Test
    @DisplayName("영업 종료는 거래 원장을 보존하고 공개 연결과 이미지만 정리한다")
    void closurePreservesFinancialAndReservationLedgers() {
        Long storeId = 8L;
        Member owner = Member.builder().id(1L).build();
        Store store = Store.builder()
                .id(storeId)
                .owner(owner)
                .mainImageUrl("stores/8/main.png")
                .detailImages("stores/8/detail-a.png,stores/8/detail-b.png")
                .build();
        Advertisement ad = Advertisement.builder()
                .id(30L)
                .store(store)
                .imageUrls("ads/30/banner.png")
                .build();

        when(storeRepository.findByIdForUpdate(storeId)).thenReturn(Optional.of(store));
        when(advertisementRepository.findByStoreId(storeId)).thenReturn(List.of(ad));

        storeService.deleteStore(storeId, owner);

        verify(dataLifecycleGuard).requireStoreClosureAllowed(storeId);
        verify(favoriteRepository).deleteByStoreId(storeId);
        verify(promotionRepository).deleteByStoreId(storeId);
        verify(storeRepository, never()).delete(any(Store.class));
        verify(fileDeletionOutboxService).enqueue("stores/8/main.png", "STORE_MAIN_IMAGE", storeId);
        verify(fileDeletionOutboxService).enqueue("stores/8/detail-a.png", "STORE_DETAIL_IMAGE", storeId);
        verify(fileDeletionOutboxService).enqueue("stores/8/detail-b.png", "STORE_DETAIL_IMAGE", storeId);
        verify(fileDeletionOutboxService).enqueue("ads/30/banner.png", "ADVERTISEMENT_IMAGE", 30L);
        verifyNoInteractions(fileStorageService);

        assertThat(store.isDeleted()).isTrue();
        assertThat(store.getMainImageUrl()).isNull();
        assertThat(store.getDetailImageList()).isEmpty();
        assertThat(ad.getImageUrlList()).isEmpty();
    }
}
