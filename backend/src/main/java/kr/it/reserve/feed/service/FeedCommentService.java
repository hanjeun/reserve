package kr.it.reserve.feed.service;

import kr.it.reserve.config.updates.EntityUpdates;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.*;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.global.common.PageRequests;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.HashSet;

@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class FeedCommentService {
    private final FeedInteractionPolicy policy;
    private final FeedService feeds;
    private final FeedPostRepository posts;
    private final FeedCommentRepository comments;
    private final FeedCommentReportRepository reports;
    private final FeedAuditRepository audits;
    private final ObjectMapper mapper;
    private final EntityManager entityManager;
    private final FeedMediaRepository media;
    private final ContentLikeRepository likes;
    private final FeedCommentReportImageRepository evidence;
    private final FeedNotificationService notifications;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EntityUpdates updates;

    public FeedInteractionDto.Comment readPublic(Long id, Long viewer) {
        policy.requireEnabled(); var item = comments.findById(id).orElseThrow(FeedException::missing);
        publicPost(item.getPost().getId(), false);
        if (item.getState() == FeedComment.State.HIDDEN || item.getParent() != null && item.getParent().getState() == FeedComment.State.HIDDEN
            || !visible(item) && (item.getParent() != null || comments.countReplies(item.getId(), LocalDateTime.now()) == 0)) throw FeedException.missing();
        return dto(item, viewer);
    }

    public Page<FeedInteractionDto.Comment> list(Long post, Long viewer, int page, int size) {
        policy.requireEnabled(); publicPost(post, false);
        return comments.roots(post, LocalDateTime.now(), PageRequests.bounded(page, size)).map(item -> dto(item, viewer));
    }
    public Page<FeedInteractionDto.Comment> replies(Long parentId, Long viewer, int page, int size) {
        policy.requireEnabled(); FeedComment parent = comments.findById(parentId).orElseThrow(FeedException::missing);
        publicPost(parent.getPost().getId(), false);
        if (parent.getParent() != null || parent.getState() == FeedComment.State.HIDDEN) throw FeedException.missing();
        return comments.replies(parentId, LocalDateTime.now(), PageRequests.bounded(page, size)).map(item -> dto(item, viewer));
    }
    @Transactional
    public FeedInteractionDto.Comment create(Long member, Long postId, FeedInteractionDto.CommentRequest request) {
        policy.requireEnabled(); feeds.activeWriter(member); FeedProfile profile = feeds.writableProfile(member);
        String requestId = requestId(request.clientRequestId());
        var previous = comments.findByProfile_Member_IdAndClientRequestId(member, requestId);
        if (previous.isPresent()) {
            FeedComment saved = previous.get();
            if (!Objects.equals(saved.getPost().getId(), postId) || !Objects.equals(saved.getParent() == null ? null : saved.getParent().getId(), request.parentId())) {
                throw FeedException.invalid("댓글 작성을 다시 열어주세요.");
            }
            publicPost(postId, true);
            return dto(locked(saved.getId()), member);
        }
        FeedPost post = publicPost(postId, true);
        FeedComment parent = request.parentId() == null ? null : locked(request.parentId());
        if (parent != null && (parent.getParent() != null || !Objects.equals(parent.getPost().getId(), postId) || !visible(parent))) {
            throw FeedException.invalid("답글을 달 댓글을 다시 확인해주세요.");
        }
        List<Long> images = imageIds(request.mediaIds());
        FeedComment item = comments.saveAndFlush(FeedComment.create(post, profile, parent, text(request.content(), images), requestId, FeedService.now()));
        applyMedia(item, images, member); notifications.comment(item);
        changed(item, false, EntityUpdates.Operation.CREATED);
        return dto(item, member);
    }
    @Transactional
    public FeedInteractionDto.Comment edit(Long member, Long id, FeedInteractionDto.CommentRequest request) {
        policy.requireEnabled(); feeds.activeWriter(member); feeds.writableProfile(member);
        FeedComment candidate = comments.findById(id).orElseThrow(FeedException::missing);
        publicPost(candidate.getPost().getId(), true);
        FeedComment item = locked(id); owner(item, member);
        if (!visible(item)) throw FeedException.missing();
        revision(item, request.revision());
        List<Long> images = request.mediaIds() == null ? media.findByComment_IdOrderByPositionAscIdAsc(id).stream().map(FeedMedia::getId).toList() : imageIds(request.mediaIds());
        item.edit(text(request.content(), images), FeedService.now()); applyMedia(item, images, member); comments.flush();
        changed(item, false, EntityUpdates.Operation.UPDATED);
        return dto(item, member);
    }
    @Transactional
    public void delete(Long member, Long id) {
        policy.requireEnabled(); feeds.activeWriter(member);
        FeedComment candidate = comments.findById(id).orElseThrow(FeedException::missing);
        posts.findForUpdate(candidate.getPost().getId()).orElseThrow(FeedException::missing);
        FeedComment item = locked(id); owner(item, member);
        if (item.getState() != FeedComment.State.DELETED) {
            boolean wasPublic = publicComment(item);
            item.delete(FeedService.now());
            changed(item, wasPublic, EntityUpdates.Operation.DELETED);
        }
    }
    @Transactional
    public void report(Long member, Long id, FeedDto.ReportRequest request) {
        policy.requireEnabled(); feeds.activeWriter(member);
        if (reports.findByCommentIdAndReporterId(id, member).isPresent()) return;
        FeedComment candidate = comments.findById(id).orElseThrow(FeedException::missing);
        publicPost(candidate.getPost().getId(), true);
        FeedComment item = locked(id);
        if (!visible(item) || item.getParent() != null && item.getParent().getState() == FeedComment.State.HIDDEN) throw FeedException.missing();
        if (!Set.of("SPAM", "ABUSE", "PRIVACY", "OTHER").contains(request.reason())) throw FeedException.invalid("신고 사유를 선택해주세요.");
        var original = dto(item, null);
        var author = original.author();
        var snapshot = new FeedInteractionDto.Comment(original.id(), original.postId(), original.parentId(), original.content(),
            new FeedDto.Profile(author.publicId(), author.nickname(), author.bio(), null, false), original.state(), false, original.revision(), 0, original.createdAt(), original.updatedAt(), original.images(), false, 0);
        try {
            var report = reports.saveAndFlush(FeedCommentReport.create(item, member, request.reason(), FeedService.clean(request.detail(), 500, "신고 내용"), mapper.writeValueAsString(snapshot), FeedService.now()));
            for (var image : media.findByComment_IdOrderByPositionAscIdAsc(item.getId())) evidence.save(FeedCommentReportImage.capture(report, image));
        } catch (JsonProcessingException error) { throw new IllegalStateException("Comment evidence encoding failed", error); }
    }
    @Transactional
    public Page<FeedInteractionDto.CommentReport> reports(Long admin, String status, int page, int size) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        var bounds = PageRequests.bounded(page, size);
        var result = status == null ? reports.findAllByOrderByCreatedAtDescIdDesc(bounds) : reports.findByStatusOrderByCreatedAtDescIdDesc(reportStatus(status), bounds);
        for (var item : result) audit(admin, "COMMENT_REPORT_LIST_READ", item.getPostId(), item.getCommentId(), "report=" + item.getId());
        return result.map(this::reportDto);
    }
    @Transactional
    public FeedInteractionDto.CommentReport readReport(Long admin, Long id) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        var item = reports.findForUpdate(id).orElseThrow(FeedException::missing);
        audit(admin, "COMMENT_REPORT_READ", item.getPostId(), item.getCommentId(), "report=" + id); return reportDto(item);
    }
    @Transactional
    public FeedInteractionDto.CommentReport review(Long admin, Long id, FeedDto.ReviewReportRequest request) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        var item = reports.findForUpdate(id).orElseThrow(FeedException::missing);
        FeedReportReviewPolicy.requireRevision(request.revision(), item.getRevision());
        String note = FeedReportReviewPolicy.requiredNote(request.note());
        item.review(reportStatus(request.status()), request.hold(), note, FeedService.now());
        audit(admin, "COMMENT_REPORT_REVIEW", item.getPostId(), item.getCommentId(), "report=" + id + ", hold=" + request.hold() + ", note=" + note);
        reports.flush();
        return reportDto(item);
    }
    @Transactional
    public FeedInteractionDto.Comment current(Long admin, Long id) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        var item = comments.findById(id).orElseThrow(FeedException::missing);
        audit(admin, "COMMENT_READ", item.getPost().getId(), id, null);
        var profile = item.getProfile();
        var author = profile == null ? null : new FeedDto.Profile(profile.getPublicId(), profile.getNickname(), profile.getBio(), null, false);
        return new FeedInteractionDto.Comment(item.getId(), item.getPost().getId(), item.getParent() == null ? null : item.getParent().getId(), item.getContent(), author,
            item.getState().name(), false, item.getRevision(), 0, item.getCreatedAt().atOffset(ZoneOffset.UTC), item.getUpdatedAt().atOffset(ZoneOffset.UTC),
            media.findByComment_IdOrderByPositionAscIdAsc(id).stream().map(image -> new FeedDto.Image(image.getId(), "/api/admin/feed/comments/" + id + "/images/" + image.getId(), image.getWidth(), image.getHeight())).toList(), false, 0);
    }
    @Transactional
    public FeedInteractionDto.Comment visibility(Long admin, Long id, FeedInteractionDto.CommentVisibility request) {
        policy.requireEnabled(); feeds.requireAdmin(admin);
        FeedComment candidate = comments.findById(id).orElseThrow(FeedException::missing);
        posts.findForUpdate(candidate.getPost().getId()).orElseThrow(FeedException::missing);
        FeedComment item = locked(id);
        revision(item, request.revision());
        if (item.getState() == FeedComment.State.DELETED) throw FeedException.missing();
        if (!request.hidden()) {
            publicPost(item.getPost().getId(), false); if (!visibleAuthor(item)) throw FeedException.missing();
            if (item.getParent() != null && item.getParent().getState() == FeedComment.State.HIDDEN) {
                throw new FeedException("부모 댓글을 복원한 뒤 답글을 복원해주세요.", HttpStatus.CONFLICT);
            }
        }
        String reason = FeedService.clean(request.reason(), 500, "숨김·복원 이유");
        if (reason.isBlank()) throw FeedException.invalid("숨김·복원 이유를 입력해주세요.");
        boolean wasPublic = publicComment(item);
        item.visibility(request.hidden(), FeedService.now()); comments.flush();
        audit(admin, request.hidden() ? "COMMENT_HIDDEN" : "COMMENT_RESTORED", item.getPost().getId(), id, reason);
        changed(item, wasPublic, EntityUpdates.Operation.UPDATED);
        return dto(item, admin);
    }
    private boolean publicComment(FeedComment item) {
        return feeds.isPublic(item.getPost()) && visible(item)
                && (item.getParent() == null || visible(item.getParent()));
    }
    private void changed(FeedComment item, boolean wasPublic, EntityUpdates.Operation operation) {
        if (updates == null) return;
        Long owner = item.getProfile() == null ? null : item.getProfile().getMember().getId();
        updates.publish(EntityUpdates.Domain.COMMENT, item.getId(), item.getPost().getId(),
                item.getPost().getStore() == null ? null : item.getPost().getStore().getId(), operation,
                wasPublic || publicComment(item), owner == null ? Set.of() : Set.of(owner), false);
    }
    private FeedPost publicPost(Long id, boolean lock) {
        FeedPost item = (lock ? posts.findForUpdate(id) : posts.findById(id)).orElseThrow(FeedException::missing);
        if (!feeds.isPublic(item)) throw FeedException.missing(); return item;
    }
    private FeedComment locked(Long id) {
        FeedComment item = comments.findForUpdate(id).orElseThrow(FeedException::missing);
        entityManager.refresh(item, LockModeType.PESSIMISTIC_WRITE); return item;
    }
    private boolean visibleAuthor(FeedComment item) { return item.getProfile() != null && !item.getProfile().isHidden() && FeedService.readableMember(item.getProfile().getMember()); }
    private boolean visible(FeedComment item) { return item.getState() == FeedComment.State.PUBLISHED && visibleAuthor(item); }
    private FeedInteractionDto.Comment dto(FeedComment item, Long viewer) {
        boolean publicBody = visible(item);
        return new FeedInteractionDto.Comment(item.getId(), item.getPost().getId(), item.getParent() == null ? null : item.getParent().getId(),
            publicBody ? item.getContent() : "", publicBody ? feeds.profileDto(item.getProfile()) : null, publicBody ? item.getState().name() : "DELETED",
            item.getProfile() != null && Objects.equals(viewer, item.getProfile().getMember().getId()), item.getRevision(),
            item.getParent() == null && item.getState() != FeedComment.State.HIDDEN ? comments.countReplies(item.getId(), LocalDateTime.now()) : 0,
            item.getCreatedAt().atOffset(ZoneOffset.UTC), item.getUpdatedAt().atOffset(ZoneOffset.UTC),
            publicBody ? media.findByComment_IdOrderByPositionAscIdAsc(item.getId()).stream().map(feeds::imageDto).toList() : List.of(),
            publicBody && viewer != null && likes.findByMember_IdAndComment_Id(viewer, item.getId()).isPresent(), publicBody ? likes.countByComment_Id(item.getId()) : 0);
    }
    private FeedInteractionDto.CommentReport reportDto(FeedCommentReport item) {
        try {
            var original = mapper.readValue(item.getSnapshotJson(), FeedInteractionDto.Comment.class);
            var images = evidence.findByReport_IdOrderByPositionAscIdAsc(item.getId()).stream().map(image -> new FeedDto.Image(image.getId(),
                "/api/admin/feed/comment-reports/" + item.getId() + "/images/" + image.getId(), image.getWidth(), image.getHeight())).toList();
            var snapshot = new FeedInteractionDto.Comment(original.id(), original.postId(), original.parentId(), original.content(), original.author(), original.state(), false,
                original.revision(), 0, original.createdAt(), original.updatedAt(), images, false, 0);
            return new FeedInteractionDto.CommentReport(item.getId(), item.getCommentId(), item.getPostId(), item.getReason(), item.getDetail(), item.getStatus().name(), item.isHold(), item.getNote(),
                item.getCreatedAt().atOffset(ZoneOffset.UTC), snapshot, item.getRevision()); }
        catch (JsonProcessingException error) { throw new IllegalStateException("Comment evidence decoding failed", error); }
    }
    private void audit(Long actor, String action, Long post, Long comment, String reason) {
        audits.save(FeedAuditRecord.record(actor, action, post, null, "comment=" + comment + (reason == null ? "" : ", " + reason), FeedService.now()));
    }
    private void owner(FeedComment item, Long member) { if (item.getProfile() == null || !Objects.equals(item.getProfile().getMember().getId(), member)) throw FeedException.missing(); }
    private void revision(FeedComment item, Long version) { if (version == null || version != item.getRevision()) throw new FeedException("댓글이 변경됐어요. 다시 불러와주세요.", HttpStatus.CONFLICT); }
    private String text(String value, List<Long> images) { String text = FeedService.clean(value, 1000, "댓글"); if (text.isBlank() && images.isEmpty()) throw FeedException.invalid("댓글이나 사진을 추가해주세요."); return text; }
    private List<Long> imageIds(List<Long> values) {
        List<Long> ids = values == null ? List.of() : values;
        if (ids.size() > FeedPolicy.MAX_IMAGES || ids.stream().anyMatch(id -> id == null || id <= 0) || new HashSet<>(ids).size() != ids.size()) throw FeedException.invalid("댓글 사진을 다시 선택해주세요. 최대 6장까지 첨부할 수 있어요.");
        return ids;
    }
    private void applyMedia(FeedComment comment, List<Long> ids, Long owner) {
        Map<Long, FeedMedia> selected = new HashMap<>();
        for (Long id : ids.stream().sorted().toList()) {
            var image = media.findForUpdate(id).orElseThrow(() -> FeedException.invalid("첨부 사진을 찾을 수 없어요."));
            if (!Objects.equals(image.getMember().getId(), owner) || image.getPost() != null || image.getOriginalPostId() != null
                || image.getComment() != null && !Objects.equals(image.getComment().getId(), comment.getId())
                || image.getOriginalCommentId() != null && !Objects.equals(image.getOriginalCommentId(), comment.getId())) throw FeedException.invalid("다른 글이나 댓글의 사진은 사용할 수 없어요.");
            selected.put(id, image);
        }
        for (var previous : media.findByComment_IdOrderByPositionAscIdAsc(comment.getId())) if (!selected.containsKey(previous.getId())) previous.detach(FeedService.now());
        for (int position = 0; position < ids.size(); position++) selected.get(ids.get(position)).attachComment(comment, position);
        media.flush();
    }
    private String requestId(String value) {
        try { String normalized = UUID.fromString(value).toString(); if (!normalized.equalsIgnoreCase(value)) throw FeedException.invalid("댓글 작성을 다시 열어주세요."); return normalized; }
        catch (IllegalArgumentException | NullPointerException error) { throw FeedException.invalid("댓글 작성을 다시 열어주세요."); }
    }
    private FeedReport.Status reportStatus(String value) {
        if (!Set.of("OPEN", "RESOLVED").contains(value)) throw FeedException.invalid("신고 상태를 다시 선택해주세요.");
        return FeedReport.Status.valueOf(value);
    }
}
