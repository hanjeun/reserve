package kr.it.reserve.feed.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.news.service.StoreNewsEvents;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service @RequiredArgsConstructor
public class FeedModerationService {
    private final FeedPolicy policy;
    private final StoreNewsAvailability newsAvailability;
    private final FeedService feeds;
    private final FeedPostRepository posts;
    private final FeedMediaRepository media;
    private final FeedReportRepository reports;
    private final FeedReportImageRepository images;
    private final FeedAuditRepository audits;
    private final ObjectMapper mapper;
    private final PromotionRepository promotions;
    @Autowired(required = false)
    private StoreNewsEvents newsEvents;

    @Transactional
    public void report(Long reporter, Long postId, FeedDto.ReportRequest request) {
        policy.requireEnabled(); feeds.activeWriter(reporter);
        if (posts.newsSourceId(postId).isPresent()) throw FeedException.missing();
        // 회원 잠금이 같은 계정의 중복 신고를 직렬화한다. DB unique도 유지한다.
        if (reports.findByPostIdAndReporterId(postId, reporter).isPresent()) return;
        FeedPost post = posts.findForUpdate(postId).orElseThrow(FeedException::missing);
        if (!feeds.isPublic(post)) throw FeedException.missing();
        if (!Set.of("SPAM", "ABUSE", "PRIVACY", "OTHER").contains(request.reason())) throw FeedException.invalid("신고 사유를 선택해주세요.");
        FeedDto.Post original = feeds.postDto(post, null);
        // 이후 프로필 변경이나 게시물 편집으로 신고 당시 본문을 재구성하지 않는다.
        FeedDto.Profile author = new FeedDto.Profile(original.author().publicId(), original.author().nickname(),
                original.author().bio(), null, false);
        FeedDto.Post snapshot = new FeedDto.Post(original.id(), original.content(), original.region(), original.createdAt(),
                original.updatedAt(), original.revision(), original.state(), false, author, List.of(), original.store(), original.promotion(), original.news());
        FeedReport report = reports.saveAndFlush(FeedReport.create(postId, reporter, request.reason(),
                FeedService.clean(request.detail(), 500, "신고 내용"), encode(snapshot), FeedService.now()));
        for (FeedMedia image : media.findByPost_IdOrderByPositionAscIdAsc(postId)) images.save(FeedReportImage.capture(report, image));
    }

    @Transactional
    public void reportNews(Long reporter, Long id, FeedDto.ReportRequest request) {
        newsAvailability.requireEnabled(); feeds.activeWriter(reporter);
        if (reports.findByPromotionIdAndReporterId(id, reporter).isPresent()) return;
        Promotion news = promotions.findForUpdate(id).orElseThrow(FeedException::missing);
        if (!StoreNewsPolicy.publiclyVisible(news)) throw FeedException.missing();
        if (!Set.of("SPAM", "ABUSE", "PRIVACY", "OTHER").contains(request.reason())) throw FeedException.invalid("신고 사유를 선택해주세요.");
        FeedPost post = FeedPost.linkedTo(news);
        if (post != null) posts.findForUpdate(post.getId()).orElseThrow(FeedException::missing);
        FeedDto.Post original = feeds.newsSnapshot(news);
        FeedDto.Profile author = new FeedDto.Profile(original.author().publicId(), original.author().nickname(), original.author().bio(), null, false);
        FeedDto.Post snapshot = new FeedDto.Post(original.id(), original.content(), original.region(), original.createdAt(), original.updatedAt(),
                original.revision(), original.state(), false, author, List.of(), original.store(), original.promotion(), original.news());
        FeedReport report = reports.saveAndFlush(FeedReport.createNews(post == null ? null : post.getId(), id, reporter, request.reason(),
                FeedService.clean(request.detail(), 500, "신고 내용"), encode(snapshot), FeedService.now()));
        if (post != null) for (FeedMedia image : media.findByPost_IdOrderByPositionAscIdAsc(post.getId())) images.save(FeedReportImage.capture(report, image));
    }

    @Transactional
    public Page<FeedDto.Report> reports(Long admin, int page, int size, String selectedStatus) {
        requireModerationEnabled(); feeds.requireAdmin(admin);
        var pageable = PageRequests.bounded(page, size);
        FeedReport.Status status = selectedStatus == null || selectedStatus.isBlank() ? null : status(selectedStatus);
        Page<FeedDto.Report> result = (status == null ? reports.findAllByOrderByCreatedAtDescIdDesc(pageable)
                : reports.findByStatusOrderByCreatedAtDescIdDesc(status, pageable)).map(this::reportDto);
        audits.saveAll(result.getContent().stream().map(report -> FeedAuditRecord.news(admin, "REPORT_LIST_READ",
                report.postId(), report.post().news() == null ? null : report.post().news().id(), report.id(), null, FeedService.now())).toList());
        return result;
    }

    @Transactional
    public FeedDto.Report readReport(Long admin, Long id) {
        requireModerationEnabled(); feeds.requireAdmin(admin);
        FeedReport report = reports.findForRead(id).orElseThrow(FeedException::missing);
        audits.save(FeedAuditRecord.news(admin, "REPORT_READ", report.getPostId(), report.getPromotionId(), id, null, FeedService.now()));
        return reportDto(report);
    }

    @Transactional
    public FeedDto.Report review(Long admin, Long id, FeedDto.ReviewReportRequest request) {
        requireModerationEnabled(); feeds.requireAdmin(admin);
        FeedReport report = reports.findForUpdate(id).orElseThrow(FeedException::missing);
        FeedReportReviewPolicy.requireRevision(request.revision(), report.getRevision());
        FeedReport.Status status = status(request.status());
        String note = FeedReportReviewPolicy.requiredNote(request.note());
        boolean wasHold = report.isHold();
        report.review(status, request.hold(), note, FeedService.now());
        audits.save(FeedAuditRecord.news(admin, "REPORT_REVIEW", report.getPostId(), report.getPromotionId(), id,
                "status=" + status + ", hold=" + request.hold() + ", note=" + note, FeedService.now()));
        if (wasHold != request.hold()) audits.save(FeedAuditRecord.news(admin, request.hold() ? "HOLD_SET" : "HOLD_RELEASED", report.getPostId(), report.getPromotionId(), id, note, FeedService.now()));
        reports.flush();
        return reportDto(report);
    }

    @Transactional
    public FeedDto.Post visibility(Long admin, Long postId, FeedDto.VisibilityRequest request) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        if (posts.newsSourceId(postId).isPresent()) throw FeedException.missing();
        FeedPost post = posts.findForUpdate(postId).orElseThrow(FeedException::missing);
        FeedReportReviewPolicy.requireRevision(request.revision(), post.getRevision(), "게시물 내용이나 공개 상태가 바뀌었어요. 다시 불러와 검토해주세요.");
        if (post.getState() != FeedPost.State.PUBLISHED && post.getState() != FeedPost.State.HIDDEN) {
            throw new FeedException("초안·삭제된 게시물은 공개 상태를 변경할 수 없어요.", HttpStatus.CONFLICT);
        }
        String reason = FeedService.clean(request.reason(), 500, "처리 사유");
        if (reason.isBlank()) throw FeedException.invalid("처리 사유를 입력해주세요.");
        boolean wasPublic = feeds.isPublic(post);
        post.setVisibility(request.hidden(), FeedService.now());
        audits.save(FeedAuditRecord.record(admin, request.hidden() ? "POST_HIDDEN" : "POST_RESTORED", postId, null, reason, FeedService.now()));
        posts.flush();
        feeds.changed(post, wasPublic, EntityUpdates.Operation.UPDATED);
        return feeds.postDto(post, admin);
    }

    @Transactional
    public FeedDto.Post visibilityNews(Long admin, Long id, FeedDto.VisibilityRequest request) {
        newsAvailability.requireEnabled(); feeds.requireAdmin(admin);
        Promotion news = promotions.findForUpdate(id).orElseThrow(FeedException::missing);
        FeedReportReviewPolicy.requireRevision(request.revision(), news.getRevision(), "소식 내용이나 공개 상태가 바뀌었어요. 다시 불러와 검토해주세요.");
        if (news.getState() != Promotion.State.PUBLISHED && news.getState() != Promotion.State.HIDDEN) {
            throw new FeedException("초안·삭제한 소식은 공개 상태를 변경할 수 없어요.", HttpStatus.CONFLICT);
        }
        FeedPost post = FeedPost.linkedTo(news);
        if (post != null) {
            posts.findForUpdate(post.getId()).orElseThrow(FeedException::missing);
            if (post.getState() != FeedPost.State.PUBLISHED && post.getState() != FeedPost.State.HIDDEN) {
                throw new FeedException("초안·삭제된 연결 게시물은 공개 상태를 변경할 수 없어요.", HttpStatus.CONFLICT);
            }
        }
        if (!request.hidden() && (!StoreNewsPolicy.usable(news.getStore()) || !StoreNewsPolicy.newsWriter(news.getMember())
                || !Objects.equals(news.getMember().getId(), news.getStore().getOwner().getId()))) {
            throw new FeedException("현재 가게나 작성자 상태로는 소식을 다시 공개할 수 없어요.", HttpStatus.CONFLICT);
        }
        String reason = FeedService.clean(request.reason(), 500, "처리 사유");
        if (reason.isBlank()) throw FeedException.invalid("처리 사유를 입력해주세요.");
        boolean wasPublic = StoreNewsPolicy.publiclyVisible(news);
        news.hideNews(request.hidden(), FeedService.now()); news.setUpdatedAt(FeedService.now());
        audits.save(FeedAuditRecord.news(admin, request.hidden() ? "NEWS_HIDDEN" : "NEWS_RESTORED", post == null ? null : post.getId(), id, null, reason, FeedService.now()));
        promotions.flush(); posts.flush();
        if (newsEvents != null) newsEvents.changed(news.getId(), news.getMember().getId(), wasPublic || StoreNewsPolicy.publiclyVisible(news));
        return feeds.newsSnapshot(news);
    }

    @Transactional(readOnly = true)
    public Page<FeedDto.Audit> audit(Long admin, int page, int size) {
        requireModerationEnabled(); feeds.requireAdmin(admin);
        return audits.findAllByOrderByCreatedAtDescIdDesc(PageRequests.bounded(page, size))
                .map(item -> new FeedDto.Audit(item.getId(), item.getActorId(), item.getAction(), item.getPostId(), item.getReportId(), item.getReason(), item.getCreatedAt().atOffset(ZoneOffset.UTC), item.getPromotionId()));
    }

    private void requireModerationEnabled() {
        if (!policy.isEnabled() && !newsAvailability.isEnabled()) policy.requireEnabled();
    }

    private FeedDto.Report reportDto(FeedReport report) {
        FeedDto.Post original = decode(report.getSnapshotJson());
        List<FeedDto.Image> media = images.findByReport_IdOrderByPositionAscIdAsc(report.getId()).stream()
                .map(image -> new FeedDto.Image(image.getOriginalMediaId(), "/api/admin/feed/reports/" + report.getId() + "/images/" + image.getId(), image.getWidth(), image.getHeight())).toList();
        FeedDto.Post snapshot = new FeedDto.Post(original.id(), original.content(), original.region(), original.createdAt(), original.updatedAt(),
                original.revision(), original.state(), false, original.author(), media, original.store(), original.promotion(), original.news());
        CurrentTarget target = report.getPromotionId() != null
                ? promotions.findById(report.getPromotionId()).map(news -> new CurrentTarget(news.getState().name(), news.getRevision())).orElse(new CurrentTarget("PURGED", null))
                : posts.findById(report.getPostId()).map(post -> new CurrentTarget(post.getState().name(), post.getRevision())).orElse(new CurrentTarget("PURGED", null));
        return new FeedDto.Report(report.getId(), report.getPostId(), report.getReason(), report.getDetail(), report.getStatus().name(),
                report.isHold(), report.getNote(), report.getCreatedAt().atOffset(ZoneOffset.UTC),
                target.state(), snapshot, report.getRevision(), target.revision());
    }
    private record CurrentTarget(String state, Long revision) {}
    private FeedReport.Status status(String value) {
        try { return FeedReport.Status.valueOf(value); }
        catch (IllegalArgumentException | NullPointerException exception) { throw FeedException.invalid("신고 상태를 선택해주세요."); }
    }
    private String encode(FeedDto.Post post) {
        try { return mapper.writeValueAsString(post); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Feed report snapshot serialization failed", exception); }
    }
    private FeedDto.Post decode(String json) {
        try { return mapper.readValue(json, FeedDto.Post.class); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Feed report snapshot deserialization failed", exception); }
    }
}
