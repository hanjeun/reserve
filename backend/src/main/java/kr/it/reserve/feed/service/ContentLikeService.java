package kr.it.reserve.feed.service;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.FeedInteractionDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.ZoneOffset;
import java.util.Optional;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class ContentLikeService {
    private final FeedInteractionPolicy policy;
    private final FeedService feeds;
    private final StoreNewsService newsService;
    private final FeedPostRepository posts;
    private final PromotionRepository news;
    private final ContentLikeRepository likes;
    private final FeedCommentRepository comments;
    private final FeedCommentService commentService;
    private final FeedNotificationService notifications;
    private final FeedProfileRepository profiles;
    private final EntityManager entityManager;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EntityUpdates updates;

    public FeedInteractionDto.Status status(String type, Long id, Long viewer) {
        requireEnabled(type); Target target = target(type, id, false);
        if (!visible(target)) throw FeedException.missing();
        return status(target, viewer);
    }
    @Transactional
    public FeedInteractionDto.Status set(Long member, String type, Long id, boolean liked) {
        requireEnabled(type); var actor = feeds.activeWriter(member);
        Target target = target(type, id, true);
        if (liked && !visible(target)) throw FeedException.missing();
        Optional<ContentLike> existing = existing(target, member);
        boolean changed = liked != existing.isPresent();
        if (liked && existing.isEmpty()) {
            likes.saveAndFlush(target.comment() == null ? ContentLike.create(actor, target.post(), target.news(), FeedService.now()) : ContentLike.comment(actor, target.comment(), FeedService.now()));
            if (target.comment() != null) notifications.likedComment(target.comment(), profiles.findByMember_Id(member).filter(profile -> profile.isConfigured() && !profile.isHidden()).orElse(null));
        }
        else if (!liked && existing.isPresent()) { likes.delete(existing.get()); likes.flush(); }
        if (changed) changed(target, member);
        return visible(target) ? status(target, member) : new FeedInteractionDto.Status(target.type(), target.id(), false, 0, 0);
    }
    private void changed(Target target, Long member) {
        if (updates == null) return;
        Long parent = target.comment() == null ? null : target.comment().getPost().getId();
        Long store = target.news() != null ? target.news().getStore().getId()
                : target.post() != null && target.post().getStore() != null ? target.post().getStore().getId() : null;
        updates.publish(EntityUpdates.Domain.LIKE, target.id(), parent, store,
                EntityUpdates.Operation.UPDATED,
                EntityUpdates.TargetType.valueOf(target.type()), false, java.util.Set.of(member), false);
        if (!visible(target)) return;
        var domain = target.comment() != null ? EntityUpdates.Domain.COMMENT
                : target.news() != null ? EntityUpdates.Domain.NEWS
                : EntityUpdates.Domain.FEED;
        updates.publish(domain, target.id(), parent, store, EntityUpdates.Operation.UPDATED,
                EntityUpdates.TargetType.valueOf(target.type()), true, java.util.Set.of(), false);
    }
    public Page<FeedInteractionDto.LikedItem> mine(Long member, String type, int page, int size) {
        policy.requireAnyEnabled(); feeds.activeReader(member); // 활성 계정 확인. 좋아요에는 공개 닉네임이 필수가 아니다.
        if (!java.util.Set.of("ALL", "POST", "NEWS", "COMMENT").contains(type)) throw FeedException.invalid("좋아요 종류를 다시 선택해주세요.");
        var bounds = PageRequests.bounded(page, size);
        var result = switch (type) {
            case "POST" -> likes.findByMember_IdAndPostIsNotNullOrderByCreatedAtDescIdDesc(member, bounds);
            case "NEWS" -> likes.findByMember_IdAndNewsIsNotNullOrderByCreatedAtDescIdDesc(member, bounds);
            case "COMMENT" -> likes.findByMember_IdAndCommentIsNotNullOrderByCreatedAtDescIdDesc(member, bounds);
            default -> likes.findByMember_IdOrderByCreatedAtDescIdDesc(member, bounds);
        };
        return result.map(item -> {
            Target target = item.getComment() != null ? new Target(null, null, item.getComment()) : item.getNews() == null ? new Target(item.getPost(), null, null) : new Target(null, item.getNews(), null);
            boolean available = visible(target);
            return new FeedInteractionDto.LikedItem(item.getId(), target.type(), target.id(), item.getCreatedAt().atOffset(ZoneOffset.UTC), available,
                available && target.post() != null ? feeds.postDto(target.post(), member) : null,
                available && target.news() != null ? newsService.publicDetail(target.id()) : null,
                available && target.comment() != null ? commentService.readPublic(target.id(), member) : null);
        });
    }
    private Target target(String type, Long id, boolean lock) {
        if (id == null || id <= 0) throw FeedException.missing();
        if ("NEWS".equals(type)) return new Target(null, (lock ? news.findForUpdate(id) : news.findById(id)).orElseThrow(FeedException::missing), null);
        if ("COMMENT".equals(type)) {
            var candidate = comments.findById(id).orElseThrow(FeedException::missing);
            if (lock) posts.findForUpdate(candidate.getPost().getId()).orElseThrow(FeedException::missing);
            var comment = lock ? comments.findForUpdate(id).orElseThrow(FeedException::missing) : candidate;
            if (lock) entityManager.refresh(comment, LockModeType.PESSIMISTIC_WRITE);
            return new Target(null, null, comment);
        }
        if (!"POST".equals(type)) throw FeedException.invalid("좋아요 대상을 다시 확인해주세요.");
        // 혜택의 내부 사진 행을 POST 대상으로 사용하거나 NEWS로 우회 변환하지 않는다.
        if (posts.newsSourceId(id).isPresent()) throw FeedException.missing();
        return new Target((lock ? posts.findForUpdate(id) : posts.findById(id)).orElseThrow(FeedException::missing), null, null);
    }
    private boolean visible(Target target) {
        if (target.comment() != null) {
            var comment = target.comment(); var profile = comment.getProfile();
            return policy.isEnabled() && feeds.isPublic(comment.getPost()) && comment.getState() == FeedComment.State.PUBLISHED && profile != null
                && !profile.isHidden() && FeedService.readableMember(profile.getMember()) && (comment.getParent() == null || comment.getParent().getState() != FeedComment.State.HIDDEN);
        }
        return target.news() != null ? policy.isNewsEnabled() && StoreNewsPolicy.publicBenefit(target.news()) : policy.isEnabled() && feeds.isPublic(target.post());
    }
    private Optional<ContentLike> existing(Target target, Long viewer) {
        if (viewer == null) return Optional.empty();
        if (target.comment() != null) return likes.findByMember_IdAndComment_Id(viewer, target.id());
        return target.news() == null ? likes.findByMember_IdAndPost_Id(viewer, target.id()) : likes.findByMember_IdAndNews_Id(viewer, target.id());
    }
    private FeedInteractionDto.Status status(Target target, Long viewer) {
        long count;
        if (target.comment() != null) count = likes.countByComment_Id(target.id());
        else count = target.news() == null ? likes.countByPost_Id(target.id()) : likes.countByNews_Id(target.id());
        FeedPost post = target.post();
        long replies = post != null && feeds.isPublic(post) ? comments.countVisible(post.getId(), java.time.LocalDateTime.now()) : 0;
        return new FeedInteractionDto.Status(target.type(), target.id(), existing(target, viewer).isPresent(), count, replies);
    }
    private void requireEnabled(String type) { if ("NEWS".equals(type)) policy.requireNewsEnabled(); else policy.requireEnabled(); }
    private record Target(FeedPost post, Promotion news, FeedComment comment) {
        String type() { return comment != null ? "COMMENT" : news == null ? "POST" : "NEWS"; }
        Long id() { return comment != null ? comment.getId() : news == null ? post.getId() : news.getId(); }
    }
}
