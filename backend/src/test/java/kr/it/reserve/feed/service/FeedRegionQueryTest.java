package kr.it.reserve.feed.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.dto.FeedDto;
import kr.it.reserve.feed.entity.FeedComment;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.feed.entity.ContentLike;
import kr.it.reserve.feed.repository.FeedMediaRepository;
import kr.it.reserve.feed.repository.FeedCommentRepository;
import kr.it.reserve.feed.repository.FeedPostRepository;
import kr.it.reserve.feed.repository.FeedProfileRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.entity.ReviewPhoto;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class FeedRegionQueryTest {
    private static final LocalDateTime NOW = LocalDateTime.parse("2026-10-12T04:00:00");
    @Autowired FeedProfileRepository profiles;
    @Autowired FeedPostRepository posts;
    @Autowired FeedCommentRepository comments;
    @Autowired ReviewRepository reviews;
    @Autowired FeedMediaRepository media;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired PromotionRepository promotions;
    @Autowired EntityManager entityManager;
    private FeedService feeds;

    @BeforeEach void configure() {
        feeds = new FeedService(new FeedPolicy(true), profiles, posts, comments, new FeedProfileReviewReader(reviews), media, members, stores, promotions,
                mock(FileStorageService.class), mock(FileDeletionOutboxService.class));
        ReflectionTestUtils.setField(feeds, "entityManager", entityManager);
    }

    @Test void directoryAndFiltersCountOnlyPublishedVisiblePostsAndNormalizeStoreAddresses() {
        Member author = member("public");
        FeedProfile profile = profile(author);
        Store store = store(author, "서울특별시 강남구 공개로 1");
        post(profile, "서울 강남구", null, false);
        post(profile, null, store, false);
        post(profile, "부산 해운대구", null, false);
        post(profile, null, null, false);
        post(profile, "제주 제주시", null, true);
        post(profile, "경기 수원시", null, false).delete(NOW);
        post(profile, "인천 남동구", null, false).setVisibility(true, NOW);
        FeedProfile hiddenProfile = profile(member("hidden"));
        ReflectionTestUtils.setField(hiddenProfile, "hidden", true);
        post(hiddenProfile, "대전 서구", null, false);
        entityManager.flush();

        assertThat(feeds.publicRegions()).extracting(FeedDto.RegionGroup::name).containsExactly("서울", "부산");
        assertThat(feeds.publicRegions().getFirst().count()).isEqualTo(2);
        assertThat(feeds.publicRegions().getFirst().areas()).containsExactly(new FeedDto.RegionArea("강남구", 2));
        assertThat(feeds.publicPosts(0, 20, null, false, null).getTotalElements()).isEqualTo(4);
        assertThat(feeds.publicPosts(0, 20, "서울", false, null).getTotalElements()).isEqualTo(2);
        assertThat(feeds.publicPosts(0, 20, "서울 강남구", false, null).getTotalElements()).isEqualTo(2);
    }

    @Test void revokedStoreAddressesCannotRevealDistrictsButIndependentExplicitRegionsRemainPublic() {
        Member author = member("owner");
        FeedProfile profile = profile(author);
        Store closed = store(author, "서울특별시 비공개구 비공개로 1");
        closed.softDelete();
        post(profile, null, closed, false);
        post(profile, "서울", closed, false);
        post(profile, "경기 수원시", closed, false);
        Member revokedOwner = member("revoked");
        Store revoked = store(revokedOwner, "제주특별자치도 제주시 비공개로 2");
        revokedOwner.setStatus(MemberStatus.SUSPENDED);
        revokedOwner.setSuspendedUntil(LocalDateTime.now().plusDays(1));
        post(profile, null, revoked, false);
        entityManager.flush();

        assertThat(feeds.publicRegions()).extracting(FeedDto.RegionGroup::name).containsExactly("경기", "서울");
        assertThat(feeds.publicRegions().stream().filter(group -> group.name().equals("서울")).findFirst().orElseThrow().areas()).isEmpty();
        assertThat(feeds.publicPosts(0, 20, "서울 비공개구", false, null).getTotalElements()).isZero();
        assertThat(feeds.publicPosts(0, 20, "제주", false, null).getTotalElements()).isZero();
        assertThat(feeds.publicPosts(0, 20, "경기 수원시", false, null).getTotalElements()).isEqualTo(1);
        assertThat(feeds.publicPosts(0, 20, null, false, null).getTotalElements()).isEqualTo(4);
    }

    @Test void benefitPhotosAreExcludedFromFeedAndRegionCountsEvenWhenApproved() {
        Member author = member("news");
        FeedProfile profile = profile(author);
        Store store = store(author, "서울특별시 중구 공개로 3");
        Promotion news = promotions.save(Promotion.builder().member(author).store(store).title("소식")
                .content("본문").category(Promotion.PromotionCategory.ETC).state(Promotion.State.PUBLISHED).feedEnabled(true).build());
        FeedPost carrier = FeedPost.create(profile, null, NOW);
        carrier.linkNews(news, "서울", NOW);
        posts.save(carrier);
        entityManager.flush();
        assertThat(feeds.publicRegions()).isEmpty();
        assertThat(feeds.publicPosts(0, 20, "서울 중구", false, null).getTotalElements()).isZero();
        news.setBenefitState(Promotion.BenefitState.APPROVED);
        entityManager.flush();
        assertThat(feeds.publicRegions()).isEmpty();
        assertThat(feeds.publicPosts(0, 20, "서울 중구", false, null).getTotalElements()).isZero();
        news.setFeedEnabled(true);
        author.setRole(Role.USER);
        entityManager.flush();
        assertThat(feeds.publicRegions()).isEmpty();
        assertThat(feeds.publicPosts(0, 20, "서울 중구", false, null).getTotalElements()).isZero();
    }

    @Test void popularPostsUseStoredLikesThenNewestAndExcludeHiddenPosts() {
        Member author = member("ranking");
        FeedProfile profile = profile(author);
        FeedPost first = post(profile, "서울", null, false);
        FeedPost second = post(profile, "서울", null, false);
        FeedPost newest = post(profile, "부산", null, false);
        FeedPost hidden = post(profile, "서울", null, false);
        hidden.setVisibility(true, NOW);
        for (FeedPost item : new FeedPost[]{first, second, hidden}) {
            entityManager.persist(ContentLike.create(author, item, null, NOW));
        }
        entityManager.flush();

        assertThat(feeds.publicPosts(0, 2, null, false, null, "popular").getContent())
                .extracting(FeedDto.Post::id).containsExactly(second.getId(), first.getId());
        assertThat(feeds.publicPosts(1, 2, null, false, null, "popular").getContent())
                .extracting(FeedDto.Post::id).containsExactly(newest.getId());
        assertThat(feeds.publicPosts(0, 2, null, false, null, "popular").getTotalElements()).isEqualTo(3);
        assertThat(feeds.publicPosts(0, 20, "부산", false, null, "popular").getContent())
                .extracting(FeedDto.Post::id).containsExactly(newest.getId());
        assertThat(feeds.publicPosts(0, 20, null, false, null).getContent())
                .extracting(FeedDto.Post::id).containsExactly(newest.getId(), second.getId(), first.getId());
    }

    @Test void profileScopeGuardsEveryActivityAndDefaultsExistingThreadsToTheirOriginalExposure() {
        var member = member("profile");
        var owner = profile(member);
        var viewer = member("profile-viewer");
        var post = post(owner, "서울", null, false);
        String address = owner.getPublicId();
        assertThat(feeds.publicProfile(address).activityAvailable()).isFalse();
        assertThat(feeds.authorPosts(address, 0, 12, null).getTotalElements()).isEqualTo(1);
        assertThatThrownBy(() -> feeds.authorComments(address, 0, 12, null)).isInstanceOf(FeedException.class);
        assertThatThrownBy(() -> feeds.authorReviews(address, 0, 12, null)).isInstanceOf(FeedException.class);

        owner.setVisibility(FeedProfile.Visibility.MEMBERS);
        assertThatThrownBy(() -> feeds.publicProfile(address)).isInstanceOfSatisfying(FeedException.class,
                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(feeds.publicProfile(address, viewer.getId()).activityAvailable()).isTrue();
        assertThat(feeds.reviewAuthors(java.util.List.of(member.getId()), null)).isEmpty();
        assertThat(feeds.reviewAuthors(java.util.List.of(member.getId()), viewer)).containsKey(member.getId());
        assertThat(feeds.readPost(post.getId(), null).author().publicId()).isNull();
        assertThat(feeds.readPost(post.getId(), viewer.getId()).author().publicId()).isEqualTo(address);
        assertThat(feeds.authorPosts(address, 0, 12, viewer.getId()).getTotalElements()).isEqualTo(1);
        viewer.setStatus(MemberStatus.SUSPENDED);
        viewer.setSuspendedUntil(NOW.plusYears(20));
        assertThatThrownBy(() -> feeds.publicProfile(address, viewer.getId())).isInstanceOf(FeedException.class);

        owner.setVisibility(FeedProfile.Visibility.PRIVATE);
        assertThat(feeds.reviewAuthors(java.util.List.of(member.getId()), member)).isEmpty();
        assertThatThrownBy(() -> feeds.authorPosts(address, 0, 12, viewer.getId())).isInstanceOf(FeedException.class);
        assertThatThrownBy(() -> feeds.authorComments(address, 0, 12, viewer.getId())).isInstanceOf(FeedException.class);
        assertThatThrownBy(() -> feeds.authorReviews(address, 0, 12, viewer.getId())).isInstanceOf(FeedException.class);
        assertThat(feeds.publicProfile(address, member.getId()).mine()).isTrue();
        assertThat(feeds.authorPosts(address, 0, 12, member.getId()).getTotalElements()).isEqualTo(1);
        assertThat(feeds.readPost(post.getId(), null).author().nickname()).isEqualTo(owner.getNickname());
        assertThat(feeds.readPost(post.getId(), null).author().publicId()).isNull();
        assertThat(feeds.readPost(post.getId(), member.getId()).author().publicId()).isEqualTo(address);
    }

    @Test void aggregateShowsOnlyPublishedCommentsAndReviewsWithPublicDestinations() {
        var author = member("activity");
        var profile = profile(author);
        profile.setVisibility(FeedProfile.Visibility.PUBLIC);
        var host = member("host");
        var hostProfile = profile(host);
        var visiblePost = post(hostProfile, "서울", null, false);
        var draftPost = post(hostProfile, "서울", null, true);
        var visible = comments.save(FeedComment.create(visiblePost, profile, null, "공개 댓글", null, NOW));
        comments.save(FeedComment.create(draftPost, profile, null, "초안 댓글", null, NOW));
        var hiddenParent = comments.save(FeedComment.create(visiblePost, hostProfile, null, "숨긴 댓글", null, NOW));
        hiddenParent.visibility(true, NOW);
        comments.save(FeedComment.create(visiblePost, profile, hiddenParent, "숨긴 답글", null, NOW));
        var deleted = comments.save(FeedComment.create(visiblePost, profile, null, "삭제한 댓글", null, NOW));
        deleted.delete(NOW);
        var store = store(host, "서울");
        var closed = store(host, "서울");
        closed.softDelete();
        reviews.save(Review.builder().member(author).store(store).title("공개 리뷰").content("공개 내용").rating(5).createdAt(NOW).build());
        reviews.save(Review.builder().member(author).store(store).title("별칭 리뷰").content("본문").rating(5)
                .createdAt(NOW).authorAlias("땅을 파는 두더지").build());
        reviews.save(Review.builder().member(author).store(closed).title("폐점 리뷰").content("본문").rating(5).createdAt(NOW).build());
        reviews.save(Review.builder().member(author).store(store).title("숨긴 리뷰").content("본문").rating(5).createdAt(NOW).moderationHidden(true).build());
        entityManager.flush();
        entityManager.clear();

        assertThat(feeds.authorComments(profile.getPublicId(), 0, 12, null).getContent()).singleElement()
                .satisfies(comment -> {
                    assertThat(comment.content()).isEqualTo("공개 댓글");
                    assertThat(comment.commentPublicId()).isEqualTo(visible.getPublicId());
                    assertThat(comment.postPublicId()).isEqualTo(visiblePost.getPublicId());
                });
        assertThat(feeds.authorReviews(profile.getPublicId(), 0, 12, null).getContent()).singleElement()
                .satisfies(review -> {
                    assertThat(review.storePublicId()).isEqualTo(store.getPublicId());
                    assertThat(review.title()).isEqualTo("공개 리뷰");
                });
        assertThat(feeds.authorReviews(profile.getPublicId(), 0, 12, author.getId()).getContent())
                .extracting(FeedDto.ProfileReview::title).containsExactlyInAnyOrder("공개 리뷰", "별칭 리뷰");
    }

    @Test void profileReviewsPreserveTheirPagesAndPublicPhotoReferences() {
        var author = member("paged-review-author");
        var profile = profile(author);
        profile.setVisibility(FeedProfile.Visibility.PUBLIC);
        var destination = store(member("paged-review-host"), "서울");
        for (int index = 0; index < 2; index++) {
            reviews.saveAndFlush(Review.builder().member(author).store(destination).title("이전 리뷰 " + index)
                    .content("합성 공개 리뷰예요.").rating(4).createdAt(NOW).build());
        }
        var latest = Review.builder().member(author).store(destination).title("사진 리뷰")
                .content("사진이 있는 합성 리뷰예요.").rating(5).createdAt(NOW).build();
        var photo = new ReviewPhoto(latest, "synthetic-private-object.bin", "image/png", 180, 320);
        latest.getPhotos().add(photo);
        reviews.saveAndFlush(latest);
        entityManager.clear();

        var first = feeds.authorReviews(profile.getPublicId(), 0, 1, null);
        assertThat(first.getTotalElements()).isEqualTo(3);
        assertThat(first.getTotalPages()).isEqualTo(3);
        assertThat(first.getNumber()).isZero();
        assertThat(first.getContent()).singleElement().satisfies(review -> {
            assertThat(review.id()).isEqualTo(latest.getId());
            assertThat(review.photos()).containsExactly(new FeedDto.ProfileReviewPhoto(photo.getId(),
                    "/api/reviews/" + latest.getId() + "/photos/" + photo.getId(), 180, 320));
        });
        var second = feeds.authorReviews(profile.getPublicId(), 1, 1, null);
        assertThat(second.getTotalElements()).isEqualTo(3);
        assertThat(second.getNumber()).isEqualTo(1);
        assertThat(second.getSize()).isEqualTo(1);
        assertThat(second.getContent()).singleElement().extracting(FeedDto.ProfileReview::title).isEqualTo("이전 리뷰 1");
    }

    private Member member(String name) {
        return members.save(Member.builder().name(name).email(name + "@region.example.invalid").role(Role.BUSINESS).termsAgreed(true).build());
    }
    private FeedProfile profile(Member member) {
        FeedProfile profile = FeedProfile.create(member, NOW);
        profile.update(member.getName(), member.getName(), "", false, NOW);
        return profiles.save(profile);
    }
    private Store store(Member member, String address) {
        return stores.save(Store.builder().owner(member).name(member.getName()).address(address).status(StoreStatus.ACTIVE).build());
    }
    private FeedPost post(FeedProfile profile, String region, Store store, boolean draft) {
        FeedPost post = FeedPost.create(profile, null, NOW);
        post.edit("본문", region, store, null, draft, NOW);
        return posts.save(post);
    }
}
