package kr.it.reserve.promotion;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.promotion.service.PromotionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class PromotionViewConcurrencyTest {
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @Autowired PromotionService service;
    @Autowired PromotionRepository repository;

    @Test void parallelViewsAndAnOlderContentEditDoNotLoseIncrements() throws Exception {
        var tx = new TransactionTemplate(manager);
        Long id = tx.execute(ignored -> {
            var member = Member.builder().name("검증").email(UUID.randomUUID() + "@example.test").role(Role.BUSINESS).build();
            em.persist(member);
            var store = Store.builder().owner(member).name("조회수 검증").build();
            em.persist(store);
            var promotion = Promotion.builder().member(member).store(store).title("before").content("test")
                    .category(Promotion.PromotionCategory.ETC).build();
            em.persist(promotion);
            return promotion.getId();
        });
        CountDownLatch loaded = new CountDownLatch(1), allowEdit = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(6)) {
            Future<?> editor = pool.submit(() -> tx.executeWithoutResult(ignored -> {
                Promotion stale = em.find(Promotion.class, id);
                loaded.countDown();
                try {
                    if (!allowEdit.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("test timeout");
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                stale.setTitle("after");
            }));
            try {
                assertThat(loaded.await(10, TimeUnit.SECONDS)).isTrue();
                var views = new ArrayList<Future<?>>();
                for (int i = 0; i < 40; i++) views.add(pool.submit(() -> service.getPromotion(id)));
                for (Future<?> future : views) future.get(15, TimeUnit.SECONDS);
            } finally { allowEdit.countDown(); }
            editor.get(15, TimeUnit.SECONDS);
        }
        var result = repository.findById(id).orElseThrow();
        assertThat(result.getViewCount()).isEqualTo(40);
        assertThat(result.getTitle()).isEqualTo("after");
    }
}
