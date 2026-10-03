package kr.it.reserve.advertisement.service;

import kr.it.reserve.advertisement.dto.AdCreateRequest;
import kr.it.reserve.advertisement.dto.AdUpdateRequest;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.entity.BannerMotionPreset;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.web.multipart.MultipartFile;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdvertisementBoundaryTest {
    @Mock private AdvertisementRepository repository;
    @Mock private StoreRepository storeRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private AdPaymentLedgerService adPaymentLedgerService;
    @Mock private PortoneService portoneService;
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

    @Test
    void bannerMotionUsesAStableDefaultAndRejectsUnknownCssKeys() {
        assertEquals(BannerMotionPreset.SOFT_RISE, AdvertisementService.resolveBannerMotion(null));
        assertEquals(BannerMotionPreset.TILT_UP_3D, AdvertisementService.resolveBannerMotion(" TILT_UP_3D "));
        assertThrows(AdvertisementException.class,
                () -> AdvertisementService.resolveBannerMotion("user-supplied-keyframes"));

        Advertisement legacy = Advertisement.builder()
                .store(Store.builder().id(1L).build())
                .adType(AdType.BANNER)
                .status(AdStatus.ACTIVE)
                .build();
        assertEquals(BannerMotionPreset.SOFT_RISE, legacy.getResolvedBannerMotion());
    }

    @Test
    void bannerCopyUsesRecommendationsAsDefaultsAndValidatesCustomTextBeforePersistence() {
        var recommended = AdvertisementService.resolveBannerContent("DISCOVER_STORE", null, null);
        assertEquals("새로운 가게를 만나보세요", recommended.title());
        assertEquals("예약 정보와 이용 시간을 둘러보세요", recommended.description());

        var custom = AdvertisementService.resolveBannerContent(
                "AVAILABLE_NOW", "  오늘\n바로 예약  ", " 원하는\t시간을 확인하세요 ");
        assertEquals("오늘 바로 예약", custom.title());
        assertEquals("원하는 시간을 확인하세요", custom.description());

        assertThrows(AdvertisementException.class,
                () -> AdvertisementService.resolveBannerContent("AVAILABLE_NOW", "제목만", " "));
        String longTitle = "가".repeat(Advertisement.BANNER_TITLE_MAX_LENGTH + 1);
        assertThrows(AdvertisementException.class,
                () -> AdvertisementService.resolveBannerContent("AVAILABLE_NOW", longTitle, "내용"));
        String longDescription = "가".repeat(Advertisement.BANNER_DESCRIPTION_MAX_LENGTH + 1);
        assertThrows(AdvertisementException.class,
                () -> AdvertisementService.resolveBannerContent("AVAILABLE_NOW", "제목", longDescription));
        assertThrows(AdvertisementException.class,
                () -> AdvertisementService.resolveBannerContent("UNTRUSTED_PRESET", "제목", "내용"));
    }

    @Test
    void createBannerPersistsCustomCopyWhileAmountStillComesFromTypeAndDates() {
        Member owner = Member.builder()
                .id(7L).name("사업자").email("owner@example.test").role(Role.BUSINESS).build();
        Store store = Store.builder().id(11L).name("가게").owner(owner).status(StoreStatus.ACTIVE).build();
        MultipartFile image = mock(MultipartFile.class);
        when(storeRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(store));
        when(repository.findFirstByStoreIdAndAdTypeAndStatusInAndStartDateGreaterThanEqual(
                eq(11L), eq(AdType.BANNER), anyList(), any())).thenReturn(Optional.empty());
        when(fileStorageService.storeFile(eq(image), anyString())).thenReturn("ads/banner.webp");
        when(fileStorageService.getPublicUrl("ads/banner.webp")).thenReturn("https://example.test/banner.webp");
        when(repository.save(any(Advertisement.class))).thenAnswer(invocation -> {
            Advertisement saved = invocation.getArgument(0);
            saved.setId(99L);
            return saved;
        });
        when(portoneService.getStoreId()).thenReturn("test-store");

        AdCreateRequest request = new AdCreateRequest();
        request.setStoreId(11L);
        request.setAdType("BANNER");
        request.setBannerCopyKey("AVAILABLE_NOW");
        request.setTitle("  직접 쓴 제목  ");
        request.setDescription("직접\n쓴 내용");
        request.setStartDate(ServiceTime.today().plusDays(1));
        request.setEndDate(ServiceTime.today().plusDays(2));
        request.setImages(List.of(image));

        var response = service.createAd(request, owner);

        var adCaptor = org.mockito.ArgumentCaptor.forClass(Advertisement.class);
        verify(repository).save(adCaptor.capture());
        assertEquals("직접 쓴 제목", adCaptor.getValue().getTitle());
        assertEquals("직접 쓴 내용", adCaptor.getValue().getDescription());
        assertEquals(10_000, adCaptor.getValue().getAmount());
        assertEquals(10_000, response.getAmount());
    }

    @Test
    void updateBannerKeepsOwnershipAndStatusGateWhilePersistingCustomCopy() {
        Member owner = Member.builder().id(17L).name("사업자").email("edit@example.test").role(Role.BUSINESS).build();
        Store store = Store.builder().id(21L).name("수정 가게").owner(owner).status(StoreStatus.ACTIVE).build();
        Advertisement ad = Advertisement.builder()
                .id(31L).store(store).adType(AdType.BANNER).status(AdStatus.ACTIVE)
                .title("이전 제목").description("이전 내용").build();
        when(adPaymentLedgerService.lockAdvertisement(31L)).thenReturn(ad);

        AdUpdateRequest request = new AdUpdateRequest();
        request.setTitle("  바뀐 제목 ");
        request.setDescription("바뀐\n내용");

        var response = service.updateAd(31L, request, owner);

        assertEquals("바뀐 제목", response.getTitle());
        assertEquals("바뀐 내용", response.getDescription());
        assertEquals(AdStatus.ACTIVE.name(), response.getStatus());
    }

    private Advertisement ad(long id, Store store) {
        return Advertisement.builder().id(id).store(store).adType(AdType.BADGE).status(AdStatus.ACTIVE).build();
    }
}
