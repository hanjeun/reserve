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
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 상세 이미지 드래그 정렬 — 기존 사진과 새 사진이 섞인 순서를 그대로 저장하고, 순열이 아니면 업로드 전에 거절한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class StoreDetailImageOrderTest {

    private static final Long OWNER_ID = 1L;
    private static final Long STORE_ID = 7L;
    private static final String MAIN = "https://cdn.example.test/users/1/stores/7/thumbnails/main.png";
    private static final String DETAIL_A = "https://cdn.example.test/users/1/stores/7/images/a.png";
    private static final String DETAIL_B = "https://cdn.example.test/users/1/stores/7/images/b.png";
    private static final String NEW_URL = "https://cdn.example.test/users/1/stores/7/images/new.png";

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
        when(storeRepository.save(store)).thenReturn(store);
        // 병렬 업로드를 테스트 스레드에서 바로 실행한다.
        doAnswer(invocation -> {
            ((Runnable) invocation.getArgument(0)).run();
            return null;
        }).when(imageUploadExecutor).execute(any(Runnable.class));
        when(fileStorageService.storeFile(any(MultipartFile.class), anyString())).thenReturn("users/1/stores/7/images/new.png");
        when(fileStorageService.getPublicUrl("users/1/stores/7/images/new.png")).thenReturn(NEW_URL);
    }

    private static MultipartFile newImage() {
        return new MockMultipartFile("detailImages", "new.png", "image/png", new byte[] {1, 2, 3});
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @DisplayName("사진 자동 넘김 설정을 수정하고 응답에 반영한다")
    void updatesImageAutoplay(boolean enabled) {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setImageAutoplayEnabled(enabled);

        StoreResponse response = storeService.updateStore(STORE_ID, request, owner);

        assertThat(store.getImageAutoplayEnabled()).isEqualTo(enabled);
        assertThat(response.getImageAutoplayEnabled()).isEqualTo(enabled);
    }

    @Test
    @DisplayName("예전 수정 요청이 사진 자동 넘김을 보내지 않으면 기존 설정을 보존한다")
    void preservesImageAutoplayWhenOmitted() {
        store.setImageAutoplayEnabled(false);

        StoreResponse response = storeService.updateStore(STORE_ID, new StoreUpdateRequest(), owner);

        assertThat(store.getImageAutoplayEnabled()).isFalse();
        assertThat(response.getImageAutoplayEnabled()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @DisplayName("등록한 사진 자동 넘김 설정을 저장한다")
    void createsImageAutoplay(boolean enabled) {
        when(storeRepository.save(any(Store.class))).thenAnswer(invocation -> {
            Store saved = invocation.getArgument(0);
            saved.setId(STORE_ID);
            return saved;
        });
        StoreCreateRequest request = new StoreCreateRequest();
        request.setName("store");
        request.setImageAutoplayEnabled(enabled);

        assertThat(storeService.createStore(request, owner).getImageAutoplayEnabled()).isEqualTo(enabled);
    }

    @Test
    @DisplayName("기존 가게와 예전 등록 요청은 자동 넘김 기본값을 유지한다")
    void defaultsImageAutoplayToEnabled() {
        assertThat(new StoreCreateRequest().getImageAutoplayEnabled()).isTrue();
        assertThat(store.getImageAutoplayEnabled()).isTrue();
        store.setImageAutoplayEnabled(null);
        assertThat(StoreResponse.fromEntity(store).getImageAutoplayEnabled()).isTrue();
    }

    @Test
    @DisplayName("새 사진을 기존 사진 사이에 끼운 순서를 그대로 저장한다")
    void savesInterleavedOrder() {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingMainImageUrl(MAIN);
        request.setExistingDetailImageUrls(List.of(DETAIL_B, DETAIL_A));
        request.setDetailImages(List.of(newImage()));
        request.setDetailImageOrder(List.of("e1", "n0", "e0"));

        storeService.updateStore(STORE_ID, request, owner);

        assertThat(store.getDetailImageList()).containsExactly(DETAIL_A, NEW_URL, DETAIL_B);
    }

    @Test
    @DisplayName("순서 정보가 없으면 예전처럼 기존 사진 → 새 사진")
    void keepsLegacyOrderWithoutOrderField() {
        StoreUpdateRequest request = new StoreUpdateRequest();
        request.setExistingMainImageUrl(MAIN);
        request.setExistingDetailImageUrls(List.of(DETAIL_B, DETAIL_A));
        request.setDetailImages(List.of(newImage()));

        storeService.updateStore(STORE_ID, request, owner);

        assertThat(store.getDetailImageList()).containsExactly(DETAIL_B, DETAIL_A, NEW_URL);
    }

    @Test
    @DisplayName("빠지거나 겹치거나 범위 밖인 순서는 업로드 전에 400 으로 거절한다")
    void rejectsNonPermutationBeforeUpload() {
        for (List<String> order : List.of(
                List.of("e0", "n0"),              // e1 누락
                List.of("e0", "e0", "n0"),        // 중복
                List.of("e0", "e1", "n1"),        // 새 파일 범위 밖
                List.of("e0", "e1", "x0"))) {     // 모르는 형식
            StoreUpdateRequest request = new StoreUpdateRequest();
            request.setExistingMainImageUrl(MAIN);
            request.setExistingDetailImageUrls(List.of(DETAIL_A, DETAIL_B));
            request.setDetailImages(List.of(newImage()));
            request.setDetailImageOrder(order);

            assertThatThrownBy(() -> storeService.updateStore(STORE_ID, request, owner))
                    .isInstanceOfSatisfying(StoreException.class,
                            e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        }
        verify(fileStorageService, never()).storeFile(any(MultipartFile.class), anyString());
        assertThat(store.getDetailImageList()).containsExactly(DETAIL_A, DETAIL_B);
    }
}
