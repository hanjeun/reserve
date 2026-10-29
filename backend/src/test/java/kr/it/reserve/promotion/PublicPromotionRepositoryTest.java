package kr.it.reserve.promotion;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.promotion.service.PromotionService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@Import(PromotionService.class)
@ActiveProfiles("test")
class PublicPromotionRepositoryTest {

    @Autowired EntityManager em;
    @Autowired PromotionRepository repository;
    @Autowired PromotionService service;

    @Test
    void unapprovedBenefitIsExcludedFromCountAndDetailDespiteLegacyFeedOptIn() {
        Long approved = promotion(StoreStatus.ACTIVE, false);
        Long pending = promotion(StoreStatus.ACTIVE, false);
        Long feedOnly = promotion(StoreStatus.ACTIVE, false);
        em.find(Promotion.class, pending).setBenefitState(Promotion.BenefitState.PENDING);
        em.find(Promotion.class, feedOnly).setBenefitState(Promotion.BenefitState.PENDING);
        em.find(Promotion.class, feedOnly).setFeedEnabled(true);
        em.flush(); em.clear();

        var result = repository.findAllPublic(PageRequest.of(0, 1));
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).extracting(Promotion::getId).containsExactly(approved);
        assertThat(repository.findPublicById(pending)).isEmpty();
        assertThat(repository.findPublicById(feedOnly)).isEmpty();
        assertThatThrownBy(() -> service.getPublicPromotion(feedOnly)).isInstanceOf(kr.it.reserve.global.error.PromotionException.class);
        assertThatThrownBy(() -> service.getPublicPromotion(pending)).isInstanceOf(kr.it.reserve.global.error.PromotionException.class);
    }

    @Test
    void publicContentCountAndDetailExcludeDeletedSuspendedAndBannedStores() {
        Long activeOne = promotion(StoreStatus.ACTIVE, false);
        Long activeTwo = promotion(StoreStatus.ACTIVE, false);
        Long deleted = promotion(StoreStatus.ACTIVE, true);
        Long suspended = promotion(StoreStatus.SUSPENDED, false);
        Long banned = promotion(StoreStatus.BANNED, false);
        em.flush();
        em.clear();

        var first = service.getPublicPromotions(0, 1);
        var second = service.getPublicPromotions(1, 1);

        assertThat(first.getTotalElements()).isEqualTo(2);
        assertThat(second.getTotalElements()).isEqualTo(2);
        assertThat(List.of(first.getContent().getFirst().getId(), second.getContent().getFirst().getId()))
                .containsExactlyInAnyOrder(activeOne, activeTwo);
        assertThat(repository.findPublicById(activeOne)).isPresent();
        assertThat(service.getPublicPromotion(activeOne).getContent()).isEqualTo("안내 원문");
        em.flush();
        em.clear();
        assertThat(repository.findById(activeOne).orElseThrow().getViewCount()).isZero();
        for (Long hidden : List.of(deleted, suspended, banned)) {
            assertThat(repository.findPublicById(hidden)).isEmpty();
        }
    }

    @Test
    void publicPaginationUsesCreationTimeThenIdWithoutDuplicateBoundaryRows() {
        Long oldest = promotion(StoreStatus.ACTIVE, false);
        Long first = promotion(StoreStatus.ACTIVE, false);
        Long second = promotion(StoreStatus.ACTIVE, false);
        Long third = promotion(StoreStatus.ACTIVE, false);
        em.flush();
        LocalDateTime sameTime = LocalDateTime.of(2026, 9, 1, 0, 0);
        em.createQuery("UPDATE Promotion p SET p.createdAt = :createdAt")
                .setParameter("createdAt", sameTime).executeUpdate();
        em.createQuery("UPDATE Promotion p SET p.createdAt = :createdAt WHERE p.id = :id")
                .setParameter("createdAt", sameTime.minusDays(1)).setParameter("id", oldest).executeUpdate();
        em.clear();

        var pageOne = repository.findAllPublic(PageRequest.of(0, 2));
        var pageTwo = repository.findAllPublic(PageRequest.of(1, 2));

        assertThat(pageOne.getContent()).extracting(Promotion::getId).containsExactly(third, second);
        assertThat(pageTwo.getContent()).extracting(Promotion::getId).containsExactly(first, oldest);
        assertThat(pageOne.getTotalElements()).isEqualTo(4);
        assertThat(pageTwo.getTotalElements()).isEqualTo(4);
    }

    @Test
    void publicContentCountAndDetailAlsoExcludeUnpublishedNewsAndLostAuthorAuthority() {
        Long visible = promotion(StoreStatus.ACTIVE, false);
        Long draft = promotion(StoreStatus.ACTIVE, false);
        Long hidden = promotion(StoreStatus.ACTIVE, false);
        Long deleted = promotion(StoreStatus.ACTIVE, false);
        Long consentWithdrawn = promotion(StoreStatus.ACTIVE, false);
        Long transferred = promotion(StoreStatus.ACTIVE, false);
        em.find(Promotion.class, draft).setState(Promotion.State.DRAFT);
        em.find(Promotion.class, hidden).setState(Promotion.State.HIDDEN);
        em.find(Promotion.class, deleted).deleteNews(LocalDateTime.now());
        em.find(Promotion.class, consentWithdrawn).getMember().setTermsAgreed(false);
        em.find(Promotion.class, transferred).getStore().setOwner(em.find(Promotion.class, visible).getMember());
        em.flush(); em.clear();

        var result = repository.findAllPublic(PageRequest.of(0, 1));

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).extracting(Promotion::getId).containsExactly(visible);
        for (Long excluded : List.of(draft, hidden, deleted, consentWithdrawn, transferred)) {
            assertThat(repository.findPublicById(excluded)).isEmpty();
        }
    }

    @Test
    void approvedBenefitDoesNotDependOnPublicFeedProfileButRetainsPublicationGuards() {
        Long visible = promotion(StoreStatus.ACTIVE, false);
        Long hiddenProfile = promotion(StoreStatus.ACTIVE, false);
        Long hiddenCarrier = promotion(StoreStatus.ACTIVE, false);
        Long draft = promotion(StoreStatus.ACTIVE, false);
        Long closed = promotion(StoreStatus.ACTIVE, true);
        for (Long id : List.of(hiddenProfile, hiddenCarrier)) {
            Promotion news = em.find(Promotion.class, id);
            FeedProfile profile = FeedProfile.create(news.getMember(), StoreNewsPolicy.now());
            profile.update("공개 닉네임 " + id, "nickname:" + id, "", false, StoreNewsPolicy.now());
            em.persist(profile);
            FeedPost carrier = FeedPost.create(profile, null, StoreNewsPolicy.now());
            carrier.linkNews(news, "서울", StoreNewsPolicy.now());
            em.persist(carrier);
            if (id.equals(hiddenProfile)) profile.withdraw(StoreNewsPolicy.now());
            else carrier.setVisibility(true, StoreNewsPolicy.now());
        }
        em.find(Promotion.class, draft).setState(Promotion.State.DRAFT);
        em.flush(); em.clear();

        for (String sort : List.of("latest", "popular", "likes")) {
            var result = service.getAllPromotions(0, 10, sort);
            assertThat(result.getTotalElements()).isEqualTo(2);
            assertThat(result.getContent()).extracting(PromotionDto.PromotionResponse::getId).containsExactlyInAnyOrder(visible, hiddenProfile);
        }
        assertThat(repository.findAllPublic(PageRequest.of(0, 1)).getTotalElements()).isEqualTo(2);
        assertThat(repository.findPublicById(hiddenProfile)).isPresent();
        assertThat(repository.findPublicById(hiddenCarrier)).isEmpty();
        assertThat(repository.findById(closed)).isPresent();
    }

    private Long promotion(StoreStatus status, boolean deleted) {
        Member author = Member.builder().name("private author").email(UUID.randomUUID() + "@example.test")
                .role(Role.BUSINESS).termsAgreed(true).build();
        em.persist(author);
        Store store = Store.builder().owner(author).name("public store").status(status)
                .deletedAt(deleted ? LocalDateTime.now() : null).build();
        em.persist(store);
        Promotion promotion = Promotion.builder().member(author).store(store).title("가게 소식")
                .content("안내 원문").category(Promotion.PromotionCategory.ETC).benefitState(Promotion.BenefitState.APPROVED).build();
        em.persist(promotion);
        return promotion.getId();
    }

    @Test
    void deletedApplicationsAreExcludedBeforePaginationAndCounting() {
        Long approved = promotion(StoreStatus.ACTIVE, false);
        Long pending = promotion(StoreStatus.ACTIVE, false);
        Long deleted = promotion(StoreStatus.ACTIVE, false);
        Long deletedCarrier = promotion(StoreStatus.ACTIVE, false);
        Long timestampOnly = promotion(StoreStatus.ACTIVE, false);
        em.find(Promotion.class, pending).setBenefitState(Promotion.BenefitState.PENDING);
        em.find(Promotion.class, deleted).deleteNews(StoreNewsPolicy.now());
        em.find(Promotion.class, timestampOnly).setDeletedAt(StoreNewsPolicy.now());
        Promotion linked = em.find(Promotion.class, deletedCarrier);
        FeedProfile profile = FeedProfile.mediaOwner(linked.getMember(), StoreNewsPolicy.now());
        em.persist(profile);
        FeedPost post = FeedPost.create(profile, null, StoreNewsPolicy.now());
        post.linkNews(linked, "서울", StoreNewsPolicy.now()); em.persist(post); post.delete(StoreNewsPolicy.now());
        em.flush(); em.clear();

        var page = repository.findAll(StoreNewsPolicy.applicationSpecification(null), PageRequest.of(0, 1));
        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(repository.findAll(StoreNewsPolicy.applicationSpecification(Promotion.BenefitState.PENDING)))
                .extracting(Promotion::getId).containsExactly(pending);
        assertThat(repository.findAll(StoreNewsPolicy.applicationSpecification(Promotion.BenefitState.APPROVED)))
                .extracting(Promotion::getId).containsExactly(approved);
        assertThat(repository.findById(deleted)).isPresent();
    }
}
