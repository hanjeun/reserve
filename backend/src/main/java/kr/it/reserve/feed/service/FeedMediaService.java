package kr.it.reserve.feed.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.*;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.*;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Service @RequiredArgsConstructor
public class FeedMediaService {
    private final FeedPolicy policy;
    private final StoreNewsAvailability newsAvailability;
    private final FeedImageCipher cipher;
    private final FeedService feeds;
    private final FeedMediaRepository media;
    private final FeedPostRepository posts;
    private final FeedReportRepository reports;
    private final FeedReportImageRepository evidence;
    private final FeedAuditRepository audits;
    private final FileStorageService storage;
    private final EntityManager entityManager;
    private final PromotionRepository promotions;
    private final FeedCommentRepository comments;
    private final FeedCommentReportRepository commentReports;
    private final FeedCommentReportImageRepository commentEvidence;
    private final Semaphore transfer = new Semaphore(1, true);

    public FeedDto.Configuration config() {
        return new FeedDto.Configuration(policy.isEnabled(), policy.isEnabled() && cipher.isEnabled(), FeedPolicy.MAX_IMAGES,
                FeedPolicy.MAX_IMAGE_BYTES, FeedPolicy.DELETE_GRACE_DAYS);
    }
    public FeedDto.Configuration newsConfig() {
        return new FeedDto.Configuration(newsAvailability.isEnabled(), newsAvailability.isEnabled() && cipher.isEnabled(), FeedPolicy.MAX_IMAGES,
                FeedPolicy.MAX_IMAGE_BYTES, FeedPolicy.DELETE_GRACE_DAYS);
    }

    @Transactional
    public FeedDto.Image upload(Long memberId, MultipartFile file) {
        policy.requireEnabled(); cipher.requireKey();
        Member member = feeds.activeWriter(memberId);
        // 화면 밖에서 직접 업로드하더라도 공개 프로필을 먼저 설정해야 한다.
        if (feeds.myProfile(memberId) == null) throw FeedException.invalid("먼저 공개 닉네임을 설정해주세요.");
        return uploadImage(member, file, false);
    }

    @Transactional
    public FeedDto.Image uploadNews(Long memberId, MultipartFile file) {
        newsAvailability.requireEnabled(); cipher.requireKey();
        Member member = feeds.activeWriter(memberId);
        if (!StoreNewsPolicy.newsWriter(member)) throw new FeedException("사업자 계정에서 혜택 사진을 첨부해주세요.", HttpStatus.FORBIDDEN);
        return uploadImage(member, file, true);
    }

    private FeedDto.Image uploadImage(Member member, MultipartFile file, boolean newsImage) {
        return bounded(() -> {
            var image = FeedImageNormalizer.inspect(file);
            String prefix = FileStoragePaths.feedImage(member.getId());
            String key = storage.storeEncryptedFeedImage(cipher.encrypt(image.bytes(), prefix), prefix);
            FeedMedia saved = media.saveAndFlush(FeedMedia.create(member, key, image.contentType(), image.width(), image.height(), image.bytes().length, FeedService.now()));
            return newsImage ? new FeedDto.Image(saved.getId(), "/api/store-news/media/" + saved.getId(), saved.getWidth(), saved.getHeight()) : feeds.imageDto(saved);
        });
    }

    /** 읽기 완료까지 회원→게시물 잠금을 유지해 비공개·탈퇴·사진 파기와의 경쟁을 직렬화한다. */
    @Transactional
    public ImageContent read(Long imageId, Long viewerId) {
        policy.requireEnabled(); cipher.requireKey();
        return readImage(imageId, viewerId, false);
    }

    @Transactional
    public ImageContent readNews(Long imageId, Long viewerId) {
        newsAvailability.requireEnabled(); cipher.requireKey();
        return readImage(imageId, viewerId, true);
    }

    private ImageContent readImage(Long imageId, Long viewerId, boolean newsImage) {
        Long ownerId = media.ownerId(imageId).orElseThrow(FeedException::missing);
        FeedMedia candidate = media.findById(imageId).orElseThrow(FeedException::missing);
        FeedPost originalPost = candidate.getComment() == null ? candidate.getPost() : candidate.getComment().getPost();
        Long originalPostId = originalPost == null ? null : originalPost.getId();
        Long originalCommentId = candidate.getComment() == null ? null : candidate.getComment().getId();
        if (originalPost == null && !Objects.equals(ownerId, viewerId)) throw FeedException.missing();
        // 댓글 사진 소유자와 게시물 작성자를 모두 잠근 뒤 게시물을 잠근다.
        var ownerIds = new java.util.TreeSet<Long>(); ownerIds.add(ownerId);
        if (originalPost != null) ownerIds.add(originalPost.getProfile().getMember().getId());
        Member owner = null;
        for (Long memberId : ownerIds) {
            Member locked = entityManager.find(Member.class, memberId, LockModeType.PESSIMISTIC_READ);
            if (locked == null) throw FeedException.missing();
            entityManager.refresh(locked, LockModeType.PESSIMISTIC_READ);
            if (Objects.equals(ownerId, memberId)) owner = locked;
        }
        if (candidate.getPost() != null) entityManager.refresh(posts.findForRead(candidate.getPost().getId()).orElseThrow(FeedException::missing), LockModeType.PESSIMISTIC_READ);
        if (candidate.getComment() != null) {
            entityManager.refresh(posts.findForRead(candidate.getComment().getPost().getId()).orElseThrow(FeedException::missing), LockModeType.PESSIMISTIC_READ);
            var comment = comments.findForRead(candidate.getComment().getId()).orElseThrow(FeedException::missing);
            entityManager.refresh(comment, LockModeType.PESSIMISTIC_READ);
        }
        FeedMedia image = media.findForRead(imageId).orElseThrow(FeedException::missing);
        entityManager.refresh(image, LockModeType.PESSIMISTIC_READ);
        FeedPost currentPost = image.getComment() == null ? image.getPost() : image.getComment().getPost();
        if (!Objects.equals(originalPostId, currentPost == null ? null : currentPost.getId())
            || !Objects.equals(originalCommentId, image.getComment() == null ? null : image.getComment().getId())) throw FeedException.missing();
        boolean mine = Objects.equals(ownerId, viewerId);
        if (owner == null || owner.isDeleted() || owner.isSuspended() || !owner.isTermsAgreed()) throw FeedException.missing();
        if (image.getComment() != null) {
            if (newsImage) throw FeedException.missing();
            var comment = image.getComment();
            var post = posts.findForRead(comment.getPost().getId()).orElseThrow(FeedException::missing);
            comment = comments.findForRead(comment.getId()).orElseThrow(FeedException::missing);
            if (!feeds.isPublic(post) || comment.getState() != FeedComment.State.PUBLISHED || comment.getProfile() == null || comment.getProfile().isHidden()
                || comment.getParent() != null && comment.getParent().getState() == FeedComment.State.HIDDEN) throw FeedException.missing();
        } else
        if (image.getPost() != null) {
            FeedPost post = posts.findForRead(image.getPost().getId()).orElseThrow(FeedException::missing);
            if (newsImage != (post.getNewsPromotion() != null)) throw FeedException.missing();
            boolean publicSource = newsImage ? StoreNewsPolicy.publicBenefit(post.getNewsPromotion()) : feeds.isPublic(post);
            if (post.getState() == FeedPost.State.DELETED || !newsImage && post.getProfile().isHidden()
                    || (!publicSource && !mine)) throw FeedException.missing();
        } else if (!mine) throw FeedException.missing();
        String prefix = FileStoragePaths.feedImage(ownerId);
        return bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedFeedImage(image.getImageKey(), prefix), prefix), image.getContentType()));
    }

    @Transactional
    public ImageContent readBenefitApplication(Long adminId, Long newsId, Long imageId) {
        newsAvailability.requireEnabled(); cipher.requireKey(); feeds.requireAdmin(adminId);
        var news = promotions.findForRead(newsId).orElseThrow(FeedException::missing);
        if (StoreNewsPolicy.deleted(news) || news.getNewsPost() == null
                || news.getBenefitState() == Promotion.BenefitState.NONE || news.getBenefitState() == Promotion.BenefitState.DRAFT) throw FeedException.missing();
        FeedPost post = posts.findForRead(news.getNewsPost().getId()).orElseThrow(FeedException::missing);
        FeedMedia image = media.findForRead(imageId).orElseThrow(FeedException::missing);
        if (post.isDeleted() || image.getPost() == null || !Objects.equals(image.getPost().getId(), post.getId())
                || !Objects.equals(image.getMember().getId(), news.getMember().getId())) throw FeedException.missing();
        String prefix = FileStoragePaths.feedImage(image.getMember().getId());
        ImageContent content = bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedFeedImage(image.getImageKey(), prefix), prefix), image.getContentType()));
        audits.save(FeedAuditRecord.news(adminId, "BENEFIT_IMAGE_READ", post.getId(), newsId, null,
                "imageId=" + imageId + ", revision=" + news.getRevision(), FeedService.now()));
        return content;
    }

    @Transactional
    public ImageContent readEvidence(Long adminId, Long reportId, Long imageId) {
        if (!policy.isEnabled() && !newsAvailability.isEnabled()) policy.requireEnabled();
        cipher.requireKey(); feeds.requireAdmin(adminId);
        FeedReport report = reports.findForRead(reportId).orElseThrow(FeedException::missing);
        FeedReportImage image = evidence.findByIdAndReport_Id(imageId, reportId).orElseThrow(FeedException::missing);
        String prefix = FileStoragePaths.feedImage(image.getOwnerId());
        ImageContent content = bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedFeedImage(image.getImageKey(), prefix), prefix), image.getContentType()));
        audits.save(FeedAuditRecord.news(adminId, "EVIDENCE_IMAGE_READ", image.getReport().getPostId(), report.getPromotionId(), reportId,
                "imageId=" + image.getId(), FeedService.now()));
        return content;
    }

    @Transactional
    public ImageContent readCommentEvidence(Long adminId, Long reportId, Long imageId) {
        policy.requireEnabled(); cipher.requireKey(); feeds.requireAdmin(adminId);
        var report = commentReports.findForUpdate(reportId).orElseThrow(FeedException::missing);
        var image = commentEvidence.findByIdAndReport_Id(imageId, reportId).orElseThrow(FeedException::missing);
        String prefix = FileStoragePaths.feedImage(image.getOwnerId());
        ImageContent content = bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedFeedImage(image.getImageKey(), prefix), prefix), image.getContentType()));
        audits.save(FeedAuditRecord.record(adminId, "COMMENT_EVIDENCE_IMAGE_READ", report.getPostId(), null, "report=" + reportId + ", image=" + imageId, FeedService.now()));
        return content;
    }

    @Transactional
    public ImageContent readCurrentComment(Long adminId, Long commentId, Long imageId) {
        policy.requireEnabled(); cipher.requireKey(); feeds.requireAdmin(adminId);
        var comment = comments.findById(commentId).orElseThrow(FeedException::missing);
        posts.findForRead(comment.getPost().getId()).orElseThrow(FeedException::missing);
        comment = comments.findForRead(commentId).orElseThrow(FeedException::missing);
        entityManager.refresh(comment, LockModeType.PESSIMISTIC_READ);
        var image = media.findForRead(imageId).orElseThrow(FeedException::missing);
        if (image.getComment() == null || !Objects.equals(image.getComment().getId(), commentId)) throw FeedException.missing();
        String prefix = FileStoragePaths.feedImage(image.getMember().getId());
        ImageContent content = bounded(() -> new ImageContent(cipher.decrypt(storage.readEncryptedFeedImage(image.getImageKey(), prefix), prefix), image.getContentType()));
        audits.save(FeedAuditRecord.record(adminId, "COMMENT_IMAGE_READ", comment.getPost().getId(), null, "comment=" + commentId + ", image=" + imageId, FeedService.now()));
        return content;
    }

    private <T> T bounded(Supplier<T> action) {
        // 여러 사진 GET은 차례로 처리하되 메모리 동시 사용과 요청 대기는 각각 1개·10초로 제한한다.
        try {
            if (!transfer.tryAcquire(10, TimeUnit.SECONDS)) {
                throw new FeedException("잠시 후 사진을 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new FeedException("사진 요청이 중단됐어요. 다시 시도해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        try { return action.get(); } finally { transfer.release(); }
    }

    public record ImageContent(byte[] bytes, String contentType) {
        @Override public String toString() { return "ImageContent[byteCount=" + bytes.length + ", contentType=" + contentType + "]"; }
    }
}
