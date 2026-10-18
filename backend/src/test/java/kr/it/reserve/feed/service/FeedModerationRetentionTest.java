package kr.it.reserve.feed.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class FeedModerationRetentionTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-11T04:00:00");
    private final FeedService feeds = mock(FeedService.class);
    private final FeedPostRepository posts = mock(FeedPostRepository.class);
    private final FeedMediaRepository media = mock(FeedMediaRepository.class);
    private final FeedReportRepository reports = mock(FeedReportRepository.class);
    private final FeedReportImageRepository evidence = mock(FeedReportImageRepository.class);
    private final FeedAuditRepository audits = mock(FeedAuditRepository.class);
    private final FileDeletionOutboxService deletion = mock(FileDeletionOutboxService.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final PromotionRepository promotions = mock(PromotionRepository.class);

    @Test
    void reportKeepsOriginalTextAndPhotoAfterAuthorEditHideAndProfileWithdrawal() {
        FeedProfile profile = FeedPostBoundaryTest.profile(FeedPostBoundaryTest.member(7L));
        FeedPost post = FeedPostBoundaryTest.post(profile);
        FeedMedia image = image(); image.attach(post, 0);
        FeedDto.Post original = new FeedDto.Post(20L, "신고 당시 원문", "서울", NOW.atOffset(ZoneOffset.UTC), NOW.atOffset(ZoneOffset.UTC),
                0, "PUBLISHED", false, new FeedDto.Profile(profile.getPublicId(), "신고 당시 닉네임", "당시 소개", "private-avatar", true),
                List.of(), null, null);
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(post)); when(feeds.isPublic(post)).thenReturn(true);
        when(feeds.postDto(post, null)).thenReturn(original);
        when(media.findByPost_IdOrderByPositionAscIdAsc(20L)).thenReturn(List.of(image));
        when(reports.saveAndFlush(any())).thenAnswer(invocation -> {
            FeedReport report = invocation.getArgument(0); ReflectionTestUtils.setField(report, "id", 30L); return report;
        });
        var reportCapture = org.mockito.ArgumentCaptor.forClass(FeedReport.class);
        var imageCapture = org.mockito.ArgumentCaptor.forClass(FeedReportImage.class);
        FeedModerationService moderation = new FeedModerationService(new FeedPolicy(true), new kr.it.reserve.feed.news.StoreNewsAvailability(true), feeds, posts, media, reports, evidence,
                audits, new ObjectMapper().findAndRegisterModules(), promotions);

        moderation.report(9L, 20L, new FeedDto.ReportRequest("PRIVACY", "노출 신고"));
        verify(reports).saveAndFlush(reportCapture.capture()); verify(evidence).save(imageCapture.capture());
        FeedReport saved = reportCapture.getValue(); FeedReportImage frozenImage = imageCapture.getValue();
        ReflectionTestUtils.setField(frozenImage, "id", 51L);
        post.edit("이후 편집 내용", null, null, null, false, NOW.plusHours(1)); post.setVisibility(true, NOW.plusHours(2));
        profile.update("변경 닉네임", "변경 닉네임", "변경 소개", false, NOW.plusHours(1)); image.detach(NOW.plusHours(1));
        profile.withdraw(NOW.plusHours(3));
        when(reports.findForRead(30L)).thenReturn(Optional.of(saved));
        when(evidence.findByReport_IdOrderByPositionAscIdAsc(30L)).thenReturn(List.of(frozenImage));
        when(posts.findById(20L)).thenReturn(Optional.of(post));

        FeedDto.Report result = moderation.readReport(99L, 30L);

        assertThat(result.postState()).isEqualTo("HIDDEN");
        assertThat(result.post().state()).isEqualTo("PUBLISHED");
        assertThat(result.post().content()).isEqualTo("신고 당시 원문");
        assertThat(result.post().author().nickname()).isEqualTo("신고 당시 닉네임");
        assertThat(profile.getNickname()).isEqualTo("탈퇴한 회원");
        assertThat(result.post().author().avatarUrl()).isNull();
        assertThat(result.post().images().getFirst().url()).isEqualTo("/api/admin/feed/reports/30/images/51");
        assertThat(frozenImage.getImageKey()).isEqualTo("owned.bin");
    }

    @Test
    void benefitReportKeepsItsSnapshotAndCannotBeSubmittedViaFeedCarrier() {
        Promotion news = news();
        news.editNews("신고 당시 소식", "신고 당시 원문", Promotion.NewsType.BENEFIT, NOW, NOW.plusDays(7), "신고 당시 조건", true, false);
        news.setRevision(3L);
        FeedPost carrier = FeedPost.create(FeedPostBoundaryTest.profile(news.getMember()), null, NOW);
        ReflectionTestUtils.setField(carrier, "id", 20L);
        carrier.linkNews(news, "서울", NOW);
        FeedMedia photo = image(); photo.attach(carrier, 0);
        FeedDto.News metadata = new FeedDto.News(11L, "신고 당시 소식", "BENEFIT", NOW.atOffset(ZoneOffset.UTC),
                NOW.plusDays(7).atOffset(ZoneOffset.UTC), "신고 당시 조건", "ONGOING", true, 3L);
        FeedDto.Post original = new FeedDto.Post(20L, "신고 당시 원문", "서울", NOW.atOffset(ZoneOffset.UTC), NOW.atOffset(ZoneOffset.UTC),
                3L, "PUBLISHED", false, new FeedDto.Profile(carrier.getProfile().getPublicId(), "당시 닉네임", "소개", "private-avatar", true),
                List.of(), null, null, metadata);
        when(promotions.findForUpdate(11L)).thenReturn(Optional.of(news));
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(carrier));
        when(feeds.newsSnapshot(news)).thenReturn(original);
        when(media.findByPost_IdOrderByPositionAscIdAsc(20L)).thenReturn(List.of(photo));
        when(reports.saveAndFlush(any())).thenAnswer(invocation -> {
            FeedReport report = invocation.getArgument(0); ReflectionTestUtils.setField(report, "id", 30L); return report;
        });
        var capture = org.mockito.ArgumentCaptor.forClass(FeedReport.class);
        var photoCapture = org.mockito.ArgumentCaptor.forClass(FeedReportImage.class);
        FeedModerationService moderation = moderation();

        moderation.reportNews(9L, 11L, new FeedDto.ReportRequest("PRIVACY", "노출 신고"));
        verify(reports).saveAndFlush(capture.capture());
        verify(evidence).save(photoCapture.capture());
        FeedReport saved = capture.getValue();
        when(posts.newsSourceId(20L)).thenReturn(Optional.of(11L));
        when(reports.findByPromotionIdAndReporterId(11L, 9L)).thenReturn(Optional.of(saved));
        assertThatThrownBy(() -> moderation.report(9L, 20L, new FeedDto.ReportRequest("SPAM", "피드 경로로 신고")))
                .isInstanceOf(FeedException.class);
        moderation.reportNews(9L, 11L, new FeedDto.ReportRequest("SPAM", "혜택에서 다시 신고"));

        verify(reports, times(1)).saveAndFlush(any());
        assertThat(saved.getPromotionId()).isEqualTo(11L);
        assertThat(saved.getPostId()).isEqualTo(20L);
        news.editNews("이후 제목", "이후 원문", Promotion.NewsType.NEWS, null, null, "이후 조건", false, false);
        news.deleteNews(NOW.plusDays(1));
        carrier.getProfile().withdraw(NOW.plusDays(1)); photo.detach(NOW.plusDays(1));
        FeedReportImage frozen = photoCapture.getValue(); ReflectionTestUtils.setField(frozen, "id", 51L);
        when(reports.findForRead(30L)).thenReturn(Optional.of(saved));
        when(evidence.findByReport_IdOrderByPositionAscIdAsc(30L)).thenReturn(List.of(frozen));
        when(promotions.findById(11L)).thenReturn(Optional.empty());

        FeedDto.Report result = moderation.readReport(99L, 30L);

        assertThat(result.postState()).isEqualTo("PURGED");
        assertThat(result.post().content()).isEqualTo("신고 당시 원문");
        assertThat(result.post().news().title()).isEqualTo("신고 당시 소식");
        assertThat(result.post().news().conditions()).isEqualTo("신고 당시 조건");
        assertThat(result.post().author().nickname()).isEqualTo("당시 닉네임");
        assertThat(result.post().author().avatarUrl()).isNull();
        assertThat(result.post().images().getFirst().url()).isEqualTo("/api/admin/feed/reports/30/images/51");
        assertThat(frozen.getImageKey()).isEqualTo("owned.bin");
    }

    @Test
    void legacyNewsCanBeReportedWithoutCreatingAFeedCarrier() {
        Promotion news = news();
        when(promotions.findForUpdate(11L)).thenReturn(Optional.of(news));
        when(feeds.newsSnapshot(news)).thenReturn(new FeedDto.Post(null, "기존 원문", null, NOW.atOffset(ZoneOffset.UTC), NOW.atOffset(ZoneOffset.UTC),
                0L, "PUBLISHED", false, new FeedDto.Profile("legacy", "공개 작성자", null, null, false), List.of(), null, null,
                new FeedDto.News(11L, "기존 소식", "NEWS", null, null, null, null, false, 0L)));
        when(reports.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        moderation().reportNews(9L, 11L, new FeedDto.ReportRequest("ABUSE", "신고"));

        verify(reports).saveAndFlush(argThat(report -> report.getPostId() == null && report.getPromotionId().equals(11L)));
        verifyNoInteractions(posts, media, evidence);
    }

    @Test
    void adminCannotRestoreNewsFromAClosedStoreOrADeletedOriginal() {
        Promotion closed = news(); closed.hideNews(true, NOW); closed.getStore().softDelete();
        when(promotions.findForUpdate(11L)).thenReturn(Optional.of(closed));

        assertThatThrownBy(() -> moderation().visibilityNews(99L, 11L, new FeedDto.VisibilityRequest(false, "복구", 0L)))
                .isInstanceOf(FeedException.class);
        assertThat(closed.getState()).isEqualTo(Promotion.State.HIDDEN);
        Promotion deleted = news(); deleted.deleteNews(NOW);
        when(promotions.findForUpdate(11L)).thenReturn(Optional.of(deleted));
        assertThatThrownBy(() -> moderation().visibilityNews(99L, 11L, new FeedDto.VisibilityRequest(false, "복구", 0L)))
                .isInstanceOf(FeedException.class);
        assertThat(deleted.getState()).isEqualTo(Promotion.State.DELETED);
        verifyNoInteractions(posts, audits);
    }

    @Test
    void adminCannotResurrectDeletedCarrierEvenIfOriginalStateIsInconsistent() {
        Promotion news = news();
        FeedPost carrier = FeedPost.create(FeedPostBoundaryTest.profile(news.getMember()), null, NOW);
        ReflectionTestUtils.setField(carrier, "id", 20L);
        carrier.linkNews(news, "서울", NOW);
        news.hideNews(true, NOW);
        carrier.delete(NOW);
        when(promotions.findForUpdate(11L)).thenReturn(Optional.of(news));
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(carrier));

        assertThatThrownBy(() -> moderation().visibilityNews(99L, 11L, new FeedDto.VisibilityRequest(false, "복원", 0L)))
                .isInstanceOf(FeedException.class);
        assertThat(news.getState()).isEqualTo(Promotion.State.HIDDEN);
        assertThat(carrier.getState()).isEqualTo(FeedPost.State.DELETED);
        verifyNoInteractions(audits);
    }

    @Test
    void disabledApiDoesNotStopOriginalPurgeOrDeleteCiphertextReferencedByReport() {
        assertThatThrownBy(() -> new FeedPolicy(false).requireEnabled()).isInstanceOf(FeedException.class);
        FeedPost post = FeedPostBoundaryTest.post(FeedPostBoundaryTest.profile(FeedPostBoundaryTest.member(7L)));
        post.delete(NOW.minusDays(31)); FeedMedia image = image(); image.attach(post, 0);
        when(posts.findById(20L)).thenReturn(Optional.of(post));
        when(media.findByPost_IdOrderByPositionAscIdAsc(20L)).thenReturn(List.of(image));
        when(evidence.existsByImageKey("owned.bin")).thenReturn(true);

        assertThat(retention().purgePost(20L, NOW)).isTrue();

        verify(posts).delete(post); verify(media).delete(image);
        verifyNoInteractions(deletion);
        verify(evidence, never()).deleteAll(any());
    }

    @Test
    void deletedLegacyNewsKeepsItsFullThirtyDayGraceEvenWithFeedApiDisabled() {
        Promotion news = news(); news.deleteNews(NOW.minusDays(30));
        when(promotions.findById(11L)).thenReturn(Optional.of(news));

        assertThat(retention().purgeNews(11L, NOW)).isFalse();

        verify(promotions, never()).delete(any(Promotion.class));
        verifyNoInteractions(posts, media, reports, evidence, deletion);
        assertThat(news.getContent()).isEqualTo("원본 내용");
        assertThat(retention().purgeNews(11L, NOW.plusNanos(1))).isTrue();
        verify(promotions).delete(news);
        verifyNoInteractions(posts, media, reports, evidence, deletion);
    }

    @Test
    void expiredCanonicalNewsPurgesBothOriginalsButKeepsCiphertextForIndependentReport() {
        Promotion news = news();
        FeedPost carrier = FeedPost.create(FeedPostBoundaryTest.profile(news.getMember()), null, NOW);
        ReflectionTestUtils.setField(carrier, "id", 20L); carrier.linkNews(news, "서울", NOW);
        news.deleteNews(NOW.minusDays(31));
        FeedMedia reported = image(); reported.attach(carrier, 0);
        FeedMedia unreported = FeedMedia.create(news.getMember(), "unreported.bin", "image/jpeg", 10, 10, 100, NOW);
        ReflectionTestUtils.setField(unreported, "id", 42L); unreported.attach(carrier, 1);
        when(promotions.findById(11L)).thenReturn(Optional.of(news));
        when(media.findByPost_IdOrderByPositionAscIdAsc(20L)).thenReturn(List.of(reported, unreported));
        when(evidence.existsByImageKey("owned.bin")).thenReturn(true);

        assertThat(retention().purgeNews(11L, NOW)).isTrue();

        var order = inOrder(entityManager, media, posts, promotions);
        order.verify(entityManager).find(Member.class, 7L, LockModeType.PESSIMISTIC_WRITE);
        order.verify(entityManager).refresh(news, LockModeType.PESSIMISTIC_WRITE);
        order.verify(entityManager).refresh(carrier, LockModeType.PESSIMISTIC_WRITE);
        order.verify(media).delete(reported);
        order.verify(media).delete(unreported);
        order.verify(media).flush();
        order.verify(posts).delete(carrier);
        order.verify(posts).flush();
        order.verify(promotions).delete(news);
        verify(deletion).enqueue("unreported.bin", "feed_post", 20L);
        verify(deletion, never()).enqueue(eq("owned.bin"), anyString(), anyLong());
        verify(evidence, never()).deleteAll(any());
        verifyNoInteractions(reports);
    }

    @Test
    void feedPurgeCannotShortenCanonicalNewsOwnGracePeriod() {
        Promotion news = news(); news.deleteNews(NOW.minusDays(10));
        FeedPost carrier = FeedPost.create(FeedPostBoundaryTest.profile(news.getMember()), null, NOW);
        ReflectionTestUtils.setField(carrier, "id", 20L); carrier.linkNews(news, "서울", NOW);
        carrier.delete(NOW.minusDays(31));
        when(posts.findById(20L)).thenReturn(Optional.of(carrier));

        assertThat(retention().purgePost(20L, NOW)).isFalse();

        verify(posts, never()).delete(any(FeedPost.class));
        verify(promotions, never()).delete(any(Promotion.class));
        verifyNoInteractions(media, reports, evidence, deletion);
    }

    @Test
    void heldResolvedReportSurvivesRetentionAndReleaseStartsNewClock() {
        FeedReport report = FeedReport.create(20L, 9L, "ABUSE", "원문", "{}", NOW.minusDays(500));
        report.review(FeedReport.Status.RESOLVED, true, "분쟁 보류", NOW.minusDays(400));
        when(evidence.findByReport_IdOrderByPositionAscIdAsc(30L)).thenReturn(List.of());
        when(reports.findForUpdate(30L)).thenReturn(Optional.of(report));

        assertThat(retention().purgeReport(30L, NOW)).isFalse();
        verifyNoInteractions(deletion, media);
        verify(reports, never()).delete(any());
        report.review(FeedReport.Status.RESOLVED, false, "보류 해제", NOW);
        assertThat(report.getResolvedAt()).isEqualTo(NOW);
        assertThat(retention().purgeReport(30L, NOW)).isFalse();
    }

    @Test
    void resolvedExpiredReportIsPurgedWithApiDisabled() {
        assertThatThrownBy(() -> new FeedPolicy(false).requireEnabled()).isInstanceOf(FeedException.class);
        FeedReport report = FeedReport.create(20L, 9L, "ABUSE", "원문", "{}", NOW.minusDays(500));
        report.review(FeedReport.Status.RESOLVED, false, "처리 완료", NOW.minusDays(400));
        when(evidence.findByReport_IdOrderByPositionAscIdAsc(30L)).thenReturn(List.of());
        when(reports.findForUpdate(30L)).thenReturn(Optional.of(report));

        assertThat(retention().purgeReport(30L, NOW)).isTrue();

        verify(reports).delete(report);
        verifyNoInteractions(deletion);
    }

    @Test
    void oldAuditRemainsUntilLastReportForSamePostIsPurged() {
        FeedAuditRecord record = FeedAuditRecord.record(99L, "POST_HIDDEN", 20L, null, "처리 사유",
                NOW.minusYears(1).minusDays(1));
        when(audits.findById(61L)).thenReturn(Optional.of(record));
        // 특정 신고 ID가 없는 숨김 기록도 같은 원문의 신고 자료가 남아 있으면 보존한다.
        when(audits.retainedReports(null, 20L)).thenReturn(1L, 0L);

        assertThat(retention().purgeAudit(61L, NOW)).isFalse();
        verify(audits, never()).delete(any());
        assertThat(retention().purgeAudit(61L, NOW)).isTrue();
        verify(audits).delete(record);
    }

    @Test
    void reportLinkedAuditSurvivesAfterOriginalPostIsGone() {
        FeedAuditRecord record = FeedAuditRecord.record(99L, "EVIDENCE_IMAGE_READ", 20L, 30L, "imageId=51",
                NOW.minusYears(1).minusDays(1));
        when(audits.findById(61L)).thenReturn(Optional.of(record));
        when(posts.findForUpdate(20L)).thenReturn(Optional.empty());
        when(audits.retainedReports(30L, 20L)).thenReturn(1L);

        assertThat(retention().purgeAudit(61L, NOW)).isFalse();

        verify(audits, never()).delete(any());
    }

    @Test
    void newsAuditSurvivesCarrierlessOriginalPurgeUntilLastCanonicalReportIsPurged() {
        FeedAuditRecord record = FeedAuditRecord.news(99L, "NEWS_HIDDEN", null, 11L, null, "처리 사유",
                NOW.minusYears(1).minusDays(1));
        when(audits.findById(61L)).thenReturn(Optional.of(record));
        when(promotions.findForUpdate(11L)).thenReturn(Optional.empty());
        when(audits.retainedNewsReports(11L)).thenReturn(1L, 0L);

        assertThat(retention().purgeAudit(61L, NOW)).isFalse();
        verify(audits, never()).delete(any());
        assertThat(retention().purgeAudit(61L, NOW)).isTrue();

        verify(audits).delete(record);
        verify(promotions, times(2)).findForUpdate(11L);
        verifyNoInteractions(posts, media, deletion);
    }

    @Test
    void accessAuditIsNotPurgedBeforeMinimumOneYear() {
        FeedAuditRecord record = FeedAuditRecord.record(99L, "POST_HIDDEN", 20L, null, "처리 사유",
                NOW.minusYears(1).plusDays(1));
        when(audits.findById(61L)).thenReturn(Optional.of(record));

        assertThat(retention().purgeAudit(61L, NOW)).isFalse();

        verify(audits, never()).retainedReports(any(), any());
        verify(audits, never()).delete(any());
    }

    @Test
    void twoYearAuditOptionKeepsRecordPastFirstYear() {
        FeedAuditRecord record = FeedAuditRecord.record(99L, "REPORT_READ", 20L, 30L, null, NOW.minusMonths(18));
        when(audits.findById(61L)).thenReturn(Optional.of(record));

        assertThat(retention(new FeedPolicy(false, "2")).purgeAudit(61L, NOW)).isFalse();
        verify(audits, never()).delete(any());
        assertThat(retention(new FeedPolicy(false, "1")).purgeAudit(61L, NOW)).isTrue();
        verify(audits).delete(record);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"0", "-1", "3", "1.5", "invalid"})
    void invalidAccessAuditPeriodNeverShortensRetention(String years) {
        assertThat(retention(new FeedPolicy(false, years)).purgeAudit(61L, NOW)).isFalse();
        verifyNoInteractions(audits);
    }

    private FeedRetentionService retention() {
        return retention(new FeedPolicy(false, "1"));
    }
    private FeedRetentionService retention(FeedPolicy policy) {
        return new FeedRetentionService(policy, posts, media, reports, evidence, audits, deletion, entityManager, promotions, mock(FeedCommentReportImageRepository.class));
    }
    private FeedModerationService moderation() {
        return new FeedModerationService(new FeedPolicy(true), new kr.it.reserve.feed.news.StoreNewsAvailability(true), feeds, posts, media, reports, evidence,
                audits, new ObjectMapper().findAndRegisterModules(), promotions);
    }
    private Promotion news() {
        Member owner = Member.builder().id(7L).role(Role.BUSINESS).termsAgreed(true).build();
        Store store = Store.builder().id(3L).name("가게").owner(owner).build();
        return Promotion.builder().id(11L).member(owner).store(store).title("원본 제목").content("원본 내용")
                .category(Promotion.PromotionCategory.CAFE).benefitState(Promotion.BenefitState.APPROVED).createdAt(NOW).updatedAt(NOW).build();
    }
    private FeedMedia image() {
        FeedMedia image = FeedMedia.create(FeedPostBoundaryTest.member(7L), "owned.bin", "image/jpeg", 10, 10, 100, NOW);
        ReflectionTestUtils.setField(image, "id", 41L); return image;
    }
}
