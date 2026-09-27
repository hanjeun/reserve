package kr.it.reserve.promotion;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.promotion.service.PromotionService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@Import(PromotionService.class)
@ActiveProfiles("test")
class PublicPromotionRepositoryTest {

    @Autowired EntityManager em;
    @Autowired PromotionRepository repository;
    @Autowired PromotionService service;

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

    private Long promotion(StoreStatus status, boolean deleted) {
        Member author = Member.builder().name("private author").email(UUID.randomUUID() + "@example.test")
                .role(Role.BUSINESS).build();
        em.persist(author);
        Store store = Store.builder().owner(author).name("public store").status(status)
                .deletedAt(deleted ? LocalDateTime.now() : null).build();
        em.persist(store);
        Promotion promotion = Promotion.builder().member(author).store(store).title("가게 소식")
                .content("안내 원문").category(Promotion.PromotionCategory.ETC).build();
        em.persist(promotion);
        return promotion.getId();
    }
}
