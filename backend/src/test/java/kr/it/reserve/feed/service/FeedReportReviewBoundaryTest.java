package kr.it.reserve.feed.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.validation.Validation;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.promotion.repository.PromotionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeedReportReviewBoundaryTest {
    private final FeedService feeds = mock(FeedService.class);
    private final FeedPostRepository posts = mock(FeedPostRepository.class);
    private final FeedReportRepository reports = mock(FeedReportRepository.class);
    private final FeedCommentReportRepository commentReports = mock(FeedCommentReportRepository.class);
    private final PromotionRepository promotions = mock(PromotionRepository.class);
    private final FeedAuditRepository audits = mock(FeedAuditRepository.class);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final FeedReport report = FeedReport.create(20L, 7L, "SPAM", "", "{}", LocalDateTime.now());

    private FeedModerationService moderation() {
        return new FeedModerationService(new FeedPolicy(true), new StoreNewsAvailability(true), feeds, posts,
                mock(FeedMediaRepository.class), reports, mock(FeedReportImageRepository.class), audits, mapper,
                promotions);
    }
    private FeedCommentService comments() {
        var policy = new FeedInteractionPolicy(new FeedPolicy(true), new StoreNewsAvailability(true));
        ReflectionTestUtils.setField(policy, "enabled", true);
        return new FeedCommentService(policy, feeds, posts, mock(FeedCommentRepository.class), commentReports,
                audits, mapper, mock(EntityManager.class), mock(FeedMediaRepository.class), mock(ContentLikeRepository.class), mock(FeedCommentReportImageRepository.class), mock(FeedNotificationService.class));
    }

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings = {" ", "\n\t", "\u2003"})
    void blankReviewReasonIsRejectedBeforeStateHoldOrAuditChanges(String note) {
        when(reports.findForUpdate(30L)).thenReturn(Optional.of(report));
        assertThatThrownBy(() -> moderation().review(99L, 30L, new FeedDto.ReviewReportRequest("RESOLVED", true, note, 0L)))
                .isInstanceOf(FeedException.class).hasMessageContaining("처리 이유");
        assertThat(report.getStatus()).isEqualTo(FeedReport.Status.OPEN);
        assertThat(report.isHold()).isFalse();
        verifyNoInteractions(audits); verify(reports, never()).flush();
    }

    @Test void staleReportCannotReleaseAnotherAdministratorsHold() {
        report.review(FeedReport.Status.RESOLVED, true, "분쟁 보류", LocalDateTime.now());
        ReflectionTestUtils.setField(report, "revision", 2L);
        when(reports.findForUpdate(30L)).thenReturn(Optional.of(report));
        assertThatThrownBy(() -> moderation().review(99L, 30L, new FeedDto.ReviewReportRequest("OPEN", false, "오래된 창", 1L)))
                .isInstanceOfSatisfying(FeedException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(report.isHold()).isTrue(); assertThat(report.getNote()).isEqualTo("분쟁 보류");
        assertThat(report.getStatus()).isEqualTo(FeedReport.Status.RESOLVED);
        verifyNoInteractions(audits); verify(reports, never()).flush();
    }

    @Test void staleCommentReportCannotChangeItsResolutionOrHold() {
        var item = new FeedCommentReport();
        item.review(FeedReport.Status.RESOLVED, true, "다른 관리자 처리", LocalDateTime.now());
        ReflectionTestUtils.setField(item, "revision", 3L);
        when(commentReports.findForUpdate(40L)).thenReturn(Optional.of(item));
        assertThatThrownBy(() -> comments().review(99L, 40L, new FeedDto.ReviewReportRequest("OPEN", false, "옛 처리", 2L)))
                .isInstanceOfSatisfying(FeedException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(item.isHold()).isTrue(); assertThat(item.getNote()).isEqualTo("다른 관리자 처리");
        verifyNoInteractions(audits); verify(commentReports, never()).flush();
    }

    @Test void apiValidationRequiresAReasonAndAnExplicitNonnegativeRevision() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new FeedDto.ReviewReportRequest("RESOLVED", false, " ", null)))
                    .extracting(item -> item.getPropertyPath().toString()).contains("note", "revision");
            assertThat(validator.validate(new FeedDto.ReviewReportRequest("RESOLVED", false, "확인", -1L))).isNotEmpty();
        }
        assertThatThrownBy(() -> FeedReportReviewPolicy.requireRevision(null, 0)).isInstanceOf(FeedException.class);
    }

    @Test void aNonAdminCannotReachTheLockedReport() {
        doThrow(new FeedException("접근 권한이 없어요.", HttpStatus.FORBIDDEN)).when(feeds).requireAdmin(7L);
        assertThatThrownBy(() -> moderation().review(7L, 30L, new FeedDto.ReviewReportRequest("RESOLVED", false, "확인", 0L)))
                .isInstanceOf(FeedException.class);
        verifyNoInteractions(reports, audits);
    }

    @Test void anOldHideOrRestoreActionCannotChangeARevisedPostOrNewsItem() {
        var post = FeedPostBoundaryTest.post(FeedPostBoundaryTest.profile(FeedPostBoundaryTest.member(7L)));
        ReflectionTestUtils.setField(post, "revision", 2L);
        when(posts.findForUpdate(20L)).thenReturn(Optional.of(post));
        assertThatThrownBy(() -> moderation().visibility(99L, 20L, new FeedDto.VisibilityRequest(true, "옛 검토", 1L)))
                .isInstanceOfSatisfying(FeedException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(post.getState()).isEqualTo(FeedPost.State.PUBLISHED);
        var news = kr.it.reserve.promotion.entity.Promotion.builder().id(11L).revision(2L).state(kr.it.reserve.promotion.entity.Promotion.State.HIDDEN).build();
        when(promotions.findForUpdate(11L)).thenReturn(Optional.of(news));
        assertThatThrownBy(() -> moderation().visibilityNews(99L, 11L, new FeedDto.VisibilityRequest(false, "옛 검토", 1L)))
                .isInstanceOfSatisfying(FeedException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(news.getState()).isEqualTo(kr.it.reserve.promotion.entity.Promotion.State.HIDDEN);
        verifyNoInteractions(audits); verify(posts, never()).flush(); verify(promotions, never()).flush();
    }
}
