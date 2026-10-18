package kr.it.reserve.feed.service;

import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.feed.FeedInteractionPolicy;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.dto.FeedInteractionDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.FeedNotificationRepository;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.event.MemberWithdrawn;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class FeedNotificationService {
    private final FeedInteractionPolicy policy;
    private final FeedService feeds;
    private final FeedNotificationRepository notifications;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EntityUpdates updates;
    @Transactional(propagation = Propagation.MANDATORY)
    public void comment(FeedComment item) {
        var actor = item.getProfile(); var owner = item.getPost().getProfile().getMember();
        send(owner, actor, item, item.getParent() == null ? "COMMENT" : "REPLY");
        if (item.getParent() != null && item.getParent().getProfile() != null) {
            var parentOwner = item.getParent().getProfile().getMember();
            if (!Objects.equals(parentOwner.getId(), owner.getId())) send(parentOwner, actor, item, "REPLY");
        }
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public void likedComment(FeedComment item, FeedProfile actor) {
        if (item.getProfile() != null && actor != null) send(item.getProfile().getMember(), actor, item, "COMMENT_LIKE");
    }
    private void send(Member recipient, FeedProfile actor, FeedComment comment, String kind) {
        if (actor == null || recipient == null || Objects.equals(recipient.getId(), actor.getMember().getId()) || !FeedService.readableMember(recipient)) return;
        if (!notifications.existsByRecipient_IdAndActor_IdAndComment_IdAndKind(recipient.getId(), actor.getId(), comment.getId(), kind)) {
            var saved = notifications.save(FeedNotification.create(recipient, actor, comment, kind, FeedService.now()));
            if (updates != null) changed(recipient.getId(), saved.getId(), comment.getPost().getId(), EntityUpdates.Operation.CREATED);
        }
    }
    public Page<FeedInteractionDto.Notification> list(Long member, boolean unread, int page, int size) {
        policy.requireEnabled(); feeds.activeReader(member);
        return notifications.list(member, unread, LocalDateTime.now(), PageRequests.bounded(page, size)).map(item ->
            new FeedInteractionDto.Notification(item.getId(), item.getKind(), item.getComment().getPost().getId(), item.getComment().getId(),
                feeds.profileDto(item.getActor()), item.getReadAt() != null, item.getCreatedAt().atOffset(ZoneOffset.UTC)));
    }
    public FeedInteractionDto.NotificationCount count(Long member) {
        policy.requireEnabled(); feeds.activeReader(member); return new FeedInteractionDto.NotificationCount(notifications.unread(member, LocalDateTime.now()));
    }
    @Transactional public void read(Long member, Long id) {
        policy.requireEnabled(); feeds.activeReader(member);
        var item = notifications.findByIdAndRecipient_Id(id, member).orElseThrow(FeedException::missing);
        item.read(FeedService.now());
        changed(member, id, item.getComment().getPost().getId(), EntityUpdates.Operation.UPDATED);
    }
    @Transactional public void readAll(Long member) {
        policy.requireEnabled(); feeds.activeReader(member); notifications.readAll(member, FeedService.now());
        changed(member, 0L, null, EntityUpdates.Operation.INVALIDATED);
    }
    private void changed(Long member, Long id, Long post, EntityUpdates.Operation operation) {
        if (updates != null) updates.publish(EntityUpdates.Domain.NOTIFICATION, id, post, null,
                operation, false, java.util.Set.of(member), false);
    }
    @EventListener @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) { notifications.withdraw(event.memberId()); }
    @Scheduled(fixedDelayString = "${feed.retention.interval-ms:3600000}") @Transactional
    public void purge() { notifications.purge(FeedService.now().minusDays(90)); }
}
