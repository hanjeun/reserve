package kr.it.reserve.feed.service;

import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.member.event.MemberWithdrawn;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component @RequiredArgsConstructor
public class FeedAccountCleanup {
    private final FeedPostRepository posts;
    private final FeedProfileRepository profiles;
    private final FileStorageService storage;
    private final FileDeletionOutboxService fileDeletions;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private kr.it.reserve.config.updates.AccountUpdateInvalidations contentUpdates;
    @EventListener @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) {
        // 기능 비활성화는 탈퇴 정리를 막지 않는다. 새 JAR은 기능 플래그와 무관하게 피드 스키마를 검증한다.
        var now = FeedService.now();
        profiles.findByMember_Id(event.memberId()).ifPresent(profile -> {
            String avatar = profile.getCustomAvatarKey();
            if (avatar != null && storage.isManagedFileUnderPrefix(avatar, FileStoragePaths.feedProfile(event.memberId()))) {
                fileDeletions.enqueue(avatar, FeedService.PROFILE_IMAGE_DELETION_SOURCE, event.memberId());
            }
            profile.withdraw(now);
        });
        posts.withdraw(event.memberId(), FeedPost.State.DELETED, now);
    }
    @EventListener @Transactional(propagation = Propagation.MANDATORY)
    public void closeStore(kr.it.reserve.store.event.StoreClosed event) {
        posts.closeStoreNews(event.storeId(), FeedService.now());
        if (contentUpdates != null) contentUpdates.publicContentChanged();
    }
}
