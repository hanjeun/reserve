package kr.it.reserve.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreImageOwnershipTest {

    private static final Long OWNER_ID = 1L;
    private static final Long STORE_ID = 7L;
    private static final String MAIN_PREFIX = "users/1/stores/7/thumbnails";
    private static final String DETAIL_PREFIX = "users/1/stores/7/images";
    private static final String MAIN = "https://cdn.example.test/users/1/stores/7/thumbnails/main.png";
    private static final String DETAIL_A = "https://cdn.example.test/users/1/stores/7/images/a.png";
    private static final String DETAIL_B = "https://cdn.example.test/users/1/stores/7/images/b.png";

    @Mock private StoreRepository storeRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private FileDeletionOutboxService fileDeletionOutboxService;
    @Mock private DataLifecycleGuard dataLifecycleGuard;
    @Mock private ReservationRepository reservationRepository;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private PromotionRepository promotionRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private ObjectMapper objectMapper;
    @Mock private Executor imageUploadExecutor;

    @InjectMocks private StoreService storeService;

    private Member owner;
    private Store store;

    @BeforeEach
    void setUp() {
        owner = Member.builder().id(OWNER_ID).name("owner").build();
        store = Store.builder()
                .id(STORE_ID)
                .owner(owner)
                .name("store")
                .mainImageUrl(MAIN)
                .detailImages(DETAIL_A + "," + DETAIL_B)
                .build();
        when(storeRepository.findByIdForUpdate(STORE_ID)).thenReturn(Optional.of(store));
    }

    @Test
    @DisplayName("다른 가게 대표 이미지 URL을 기존 이미지로 저장하지 않는다")
    void rejectsForeignMainImageReference() {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingMainImageUrl(
                "https://cdn.example.test/users/2/stores/9/thumbnails/main.png");

        assertImageConflict(request);

        assertThat(store.getMainImageUrl()).isEqualTo(MAIN);
        verify(storeRepository, never()).save(any(Store.class));
        verify(fileDeletionOutboxService, never()).enqueue(any(), any(), any());
    }

    @Test
    @DisplayName("내 상세 이미지를 대표 이미지 참조로 바꾸는 역할 혼합을 거절한다")
    void rejectsDetailImageUsedAsMainImage() {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingMainImageUrl(DETAIL_A);

        assertImageConflict(request);
    }

    @Test
    @DisplayName("다른 가게 상세 이미지와 중복 상세 이미지 참조를 거절한다")
    void rejectsForeignOrDuplicateDetailReferences() {
        StoreUpdateRequest foreign = new StoreUpdateRequest();
        foreign.setExistingDetailImageUrls(List.of(
                "https://cdn.example.test/users/2/stores/9/images/a.png"));
        assertImageConflict(foreign);

        StoreUpdateRequest duplicate = new StoreUpdateRequest();
        duplicate.setExistingDetailImageUrls(List.of(DETAIL_A, DETAIL_A));
        assertImageConflict(duplicate);
    }

    @Test
    @DisplayName("같은 가게의 기존 이미지만 유지하고 빠진 상세 이미지만 삭제함에 넣는다")
    void acceptsOwnedReferencesAndQueuesOnlyRemovedDetail() {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingMainImageUrl(MAIN);
        request.setExistingDetailImageUrls(List.of(DETAIL_B));
        when(fileStorageService.isManagedFileUnderPrefix(DETAIL_A, DETAIL_PREFIX)).thenReturn(true);
        when(storeRepository.save(store)).thenReturn(store);

        storeService.updateStore(STORE_ID, request, owner);

        assertThat(store.getMainImageUrl()).isEqualTo(MAIN);
        assertThat(store.getDetailImageList()).containsExactly(DETAIL_B);
        verify(fileDeletionOutboxService).enqueue(
                DETAIL_A, "STORE_DETAIL_IMAGE", STORE_ID);
        verify(fileDeletionOutboxService, never()).enqueue(
                MAIN, "STORE_MAIN_IMAGE", STORE_ID);
    }

    @Test
    @DisplayName("기존 DB에 오염된 URL이 빠져도 그 대상은 삭제함에 넣지 않는다")
    void skipsDeletionForPollutedStoredReference() {
        String polluted = "https://cdn.example.test/users/2/stores/9/images/a.png";
        store.setDetailImages(polluted);
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingDetailImageUrls(List.of());
        when(storeRepository.save(store)).thenReturn(store);

        storeService.updateStore(STORE_ID, request, owner);

        assertThat(store.getDetailImageList()).isEmpty();
        verify(fileDeletionOutboxService, never()).enqueue(
                polluted, "STORE_DETAIL_IMAGE", STORE_ID);
    }

    @Test
    @DisplayName("2026-04-26 이전 옛 경로로 저장된 사진도 유지한 채 수정되고, 빠진 옛 파일은 지우지 않는다")
    void keepsLegacyStoredImagesWithoutDeletingThem() {
        String legacyMain = "https://cdn.example.test/stores/thumbnails/old-main.png";
        String legacyDetail = "https://cdn.example.test/stores/images/old-a.png";
        store.setMainImageUrl(legacyMain);
        store.setDetailImages(legacyDetail + "," + DETAIL_B);
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingMainImageUrl(legacyMain);
        request.setExistingDetailImageUrls(List.of(DETAIL_B));
        when(storeRepository.save(store)).thenReturn(store);

        storeService.updateStore(STORE_ID, request, owner);

        assertThat(store.getMainImageUrl()).isEqualTo(legacyMain);
        assertThat(store.getDetailImageList()).containsExactly(DETAIL_B);
        verify(fileDeletionOutboxService, never()).enqueue(any(), any(), any());
    }

    private void assertImageConflict(StoreUpdateRequest request) {
        assertThatThrownBy(() -> storeService.updateStore(STORE_ID, request, owner))
                .isInstanceOfSatisfying(StoreException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getMessage()).contains("새로고침");
                });
    }
}
