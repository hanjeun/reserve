package kr.it.reserve.feed.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.concurrent.*;
import org.springframework.http.HttpStatus;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FeedMediaBoundaryTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-11T04:00:00");
    @Mock private FeedPolicy policy;
    @Mock private StoreNewsAvailability newsAvailability;
    @Mock private FeedImageCipher cipher;
    @Mock private FeedService feeds;
    @Mock private FeedMediaRepository media;
    @Mock private FeedPostRepository posts;
    @Mock private FeedReportRepository reports;
    @Mock private FeedReportImageRepository evidence;
    @Mock private FeedAuditRepository audits;
    @Mock private FileStorageService storage;
    @Mock private EntityManager entityManager;
    @Mock private PromotionRepository promotions;
    @Mock private FeedCommentRepository comments;
    @Mock private FeedCommentReportRepository commentReports;
    @Mock private FeedCommentReportImageRepository commentEvidence;
    @InjectMocks private FeedMediaService images;

    @Test
    void approvedBenefitPhotoIsReadableWithoutEnablingFeedOrPublicNickname() {
        Member owner = FeedPostBoundaryTest.member(7L); owner.setRole(Role.BUSINESS);
        FeedProfile internal = FeedProfile.mediaOwner(owner, NOW);
        Store store = Store.builder().id(3L).owner(owner).name("가게").build();
        Promotion benefit = Promotion.builder().id(11L).member(owner).store(store).title("혜택").content("본문")
                .category(Promotion.PromotionCategory.CAFE).benefitState(Promotion.BenefitState.APPROVED).build();
        FeedPost carrier = FeedPostBoundaryTest.post(internal); carrier.linkNews(benefit, "서울", NOW);
        setupRead(carrier); when(posts.findForRead(20L)).thenReturn(Optional.of(carrier));
        when(storage.readEncryptedFeedImage(eq("owned.bin"), anyString())).thenReturn(new byte[] {1});
        when(cipher.decrypt(any(), anyString())).thenReturn(new byte[] {2});
        FeedMediaService independent = new FeedMediaService(new FeedPolicy(false), new StoreNewsAvailability(true), cipher,
                feeds, media, posts, reports, evidence, audits, storage, entityManager, promotions, comments, commentReports, commentEvidence);

        assertThat(independent.readNews(41L, null).bytes()).containsExactly((byte) 2);
        assertThat(internal.isConfigured()).isFalse();
        verify(feeds, never()).myProfile(anyLong());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void publicMediaEndpointsCannotReadTheOtherPublicationChannel(boolean benefit) {
        Member owner = FeedPostBoundaryTest.member(7L); owner.setRole(Role.BUSINESS);
        FeedPost post = FeedPostBoundaryTest.post(FeedPostBoundaryTest.profile(owner));
        if (benefit) post.linkNews(Promotion.builder().id(11L).member(owner)
                .store(Store.builder().id(3L).owner(owner).name("가게").build()).title("혜택").content("본문")
                .category(Promotion.PromotionCategory.CAFE).benefitState(Promotion.BenefitState.APPROVED).build(), "서울", NOW);
        setupRead(post); when(posts.findForRead(20L)).thenReturn(Optional.of(post));

        assertThatThrownBy(() -> { if (benefit) images.read(41L, 7L); else images.readNews(41L, 7L); })
                .isInstanceOfSatisfying(FeedException.class, failure -> assertThat(failure.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        verifyNoInteractions(storage, audits);
        verify(cipher, never()).decrypt(any(), anyString());
    }

    @Test
    void anotherViewerIncludingAdminCannotReadUnattachedMedia() {
        FeedMedia image = image();
        when(media.ownerId(41L)).thenReturn(Optional.of(7L));
        when(media.findById(41L)).thenReturn(Optional.of(image));
        assertThatThrownBy(() -> images.read(41L, 99L)).isInstanceOf(FeedException.class);
        verifyNoInteractions(storage, audits, entityManager);
        verify(cipher, never()).decrypt(any(), anyString());
    }

    @Test
    void hiddenPostIsCheckedBeforeDownloadingCiphertext() {
        FeedPost post = FeedPostBoundaryTest.post(FeedPostBoundaryTest.profile(FeedPostBoundaryTest.member(7L)));
        post.setVisibility(true, NOW); setupRead(post);
        when(posts.findForRead(20L)).thenReturn(Optional.of(post));
        when(feeds.isPublic(post)).thenReturn(false);

        assertThatThrownBy(() -> images.read(41L, 99L)).isInstanceOf(FeedException.class);
        verifyNoInteractions(storage, audits);
    }

    @Test
    void deletedPostImageIsUnavailableEvenToOwner() {
        FeedPost post = FeedPostBoundaryTest.post(FeedPostBoundaryTest.profile(FeedPostBoundaryTest.member(7L)));
        post.delete(NOW); setupRead(post);
        when(posts.findForRead(20L)).thenReturn(Optional.of(post));

        assertThatThrownBy(() -> images.read(41L, 7L)).isInstanceOf(FeedException.class);
        verifyNoInteractions(storage, audits);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void adminEvidenceReadUsesSnapshotAndLeavesAuditAfterOriginalDeleted(boolean newsReport) {
        FeedMedia original = image();
        FeedReport report = newsReport
                ? FeedReport.createNews(20L, 11L, 9L, "PRIVACY", "신고", "{}", NOW)
                : FeedReport.create(20L, 9L, "PRIVACY", "신고", "{}", NOW);
        ReflectionTestUtils.setField(report, "id", 30L);
        FeedReportImage snapshot = FeedReportImage.capture(report, original);
        ReflectionTestUtils.setField(snapshot, "id", 51L);
        when(reports.findForRead(30L)).thenReturn(Optional.of(report));
        when(evidence.findByIdAndReport_Id(51L, 30L)).thenReturn(Optional.of(snapshot));
        when(storage.readEncryptedFeedImage(eq("owned.bin"), anyString())).thenReturn(new byte[] {1});
        when(cipher.decrypt(any(), anyString())).thenReturn(new byte[] {2});

        assertThat(images.readEvidence(99L, 30L, 51L).bytes()).containsExactly((byte) 2);
        verify(feeds).requireAdmin(99L);
        verifyNoInteractions(posts, media);
        verify(audits).save(argThat(record -> record.getActorId().equals(99L)
                && record.getAction().equals("EVIDENCE_IMAGE_READ") && record.getReportId().equals(30L)
                && java.util.Objects.equals(record.getPromotionId(), newsReport ? 11L : null)));
    }

    @Test
    void phoneJpegOrientationBecomesPixelsAndExifIsNotRetained() throws Exception {
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 3, BufferedImage.TYPE_INT_RGB), "jpeg", jpeg);
        // EXIF IFD0 Orientation=6 (90° clockwise), without other metadata.
        byte[] exif = HexFormat.of().parseHex("ffe1002245786966000049492a0008000000010012010300010000000600000000000000");
        ByteArrayOutputStream original = new ByteArrayOutputStream();
        original.write(jpeg.toByteArray(), 0, 2); original.write(exif);
        original.write(jpeg.toByteArray(), 2, jpeg.size() - 2);

        var result = FeedImageNormalizer.inspect(new MockMultipartFile("file", "phone.jpg", "image/jpeg", original.toByteArray()));

        assertThat(result.width()).isEqualTo(3);
        assertThat(result.height()).isEqualTo(2);
        assertThat(result.contentType()).isEqualTo("image/jpeg");
        assertThat(FeedJpegOrientation.read(result.bytes())).isEqualTo(1);
        assertThat(FeedJpegOrientation.read(new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe1, 0, 127})).isEqualTo(1);
    }

    @Test
    void parallelPhotoReadWaitsForCurrentTransferInsteadOfImmediateRejection() throws Exception {
        setupRead(null);
        when(storage.readEncryptedFeedImage(eq("owned.bin"), anyString())).thenReturn(new byte[] {1});
        when(cipher.decrypt(any(), anyString())).thenReturn(new byte[] {2});
        Semaphore gate = (Semaphore) ReflectionTestUtils.getField(images, "transfer");
        ExecutorService reader = Executors.newSingleThreadExecutor();
        gate.acquire();
        boolean released = false;
        try {
            Future<FeedMediaService.ImageContent> pending = reader.submit(() -> images.read(41L, 7L));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (!gate.hasQueuedThreads() && !pending.isDone() && System.nanoTime() < deadline) Thread.sleep(5);
            assertThat(gate.hasQueuedThreads()).isTrue();
            assertThat(pending.isDone()).isFalse();
            verifyNoInteractions(storage);
            gate.release(); released = true;

            assertThat(pending.get(2, TimeUnit.SECONDS).bytes()).containsExactly((byte) 2);
            assertThat(gate.availablePermits()).isEqualTo(1);
        } finally {
            if (!released) gate.release();
            reader.shutdownNow();
            reader.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void transferTimeoutDoesNotReadStorageOrReleaseUnacquiredPermit() throws Exception {
        setupRead(null);
        Semaphore gate = mock(Semaphore.class);
        when(gate.tryAcquire(anyLong(), any(TimeUnit.class))).thenReturn(false);
        ReflectionTestUtils.setField(images, "transfer", gate);

        assertThatThrownBy(() -> images.read(41L, 7L)).isInstanceOfSatisfying(FeedException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        verifyNoInteractions(storage);
        verify(gate, never()).release();
    }

    @Test
    void interruptedTransferWaitRestoresInterruptWithoutReadingStorage() {
        setupRead(null);
        Semaphore gate = (Semaphore) ReflectionTestUtils.getField(images, "transfer");
        try {
            Thread.currentThread().interrupt();
            assertThatThrownBy(() -> images.read(41L, 7L)).isInstanceOfSatisfying(FeedException.class,
                    exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(gate.availablePermits()).isEqualTo(1);
            verifyNoInteractions(storage);
        } finally { Thread.interrupted(); }
    }

    private void setupRead(FeedPost post) {
        FeedMedia image = image(); if (post != null) image.attach(post, 0);
        when(media.ownerId(41L)).thenReturn(Optional.of(7L));
        when(entityManager.find(Member.class, 7L, LockModeType.PESSIMISTIC_READ)).thenReturn(image.getMember());
        when(media.findForRead(41L)).thenReturn(Optional.of(image));
        when(media.findById(41L)).thenReturn(Optional.of(image));
    }
    private FeedMedia image() {
        FeedMedia image = FeedMedia.create(FeedPostBoundaryTest.member(7L), "owned.bin", "image/jpeg", 10, 10, 100, NOW);
        ReflectionTestUtils.setField(image, "id", 41L); return image;
    }
}
