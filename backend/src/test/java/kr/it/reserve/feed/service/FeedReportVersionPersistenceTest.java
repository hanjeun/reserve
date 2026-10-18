package kr.it.reserve.feed.service;

import jakarta.persistence.OptimisticLockException;
import kr.it.reserve.feed.entity.FeedCommentReport;
import kr.it.reserve.feed.entity.FeedReport;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class FeedReportVersionPersistenceTest {
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void anOldPersistenceContextCannotOverwriteTheSavedReasonOrHold(boolean comment) {
        var registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.connection.url", "jdbc:h2:mem:review_" + UUID.randomUUID() + ";MODE=MySQL")
                .applySetting("hibernate.connection.driver_class", "org.h2.Driver")
                .applySetting("hibernate.hbm2ddl.auto", "create-drop").build();
        try (var factory = new MetadataSources(registry).addAnnotatedClass(FeedReport.class)
                .addAnnotatedClass(FeedCommentReport.class).buildMetadata().buildSessionFactory()) {
            Object initial = comment ? commentReport() : FeedReport.create(20L, 9L, "SPAM", "", "{}", LocalDateTime.now());
            try (var setup = factory.createEntityManager()) {
                setup.getTransaction().begin(); setup.persist(initial); setup.getTransaction().commit();
            }
            Class<?> type = initial.getClass();
            Object id = ReflectionTestUtils.getField(initial, "id");
            try (var first = factory.createEntityManager(); var old = factory.createEntityManager()) {
                first.getTransaction().begin(); old.getTransaction().begin();
                Object latest = first.find(type, id);
                Object stale = old.find(type, id);
                review(latest, true, "첫 관리자 분쟁 보류"); first.getTransaction().commit();
                assertThat(ReflectionTestUtils.getField(latest, "revision")).isEqualTo(1L);
                review(stale, false, "이전 창의 메모");
                assertThatThrownBy(() -> old.getTransaction().commit()).isInstanceOf(OptimisticLockException.class);
            }
            try (var verify = factory.createEntityManager()) {
                Object saved = verify.find(type, id);
                assertThat(ReflectionTestUtils.getField(saved, "hold")).isEqualTo(true);
                assertThat(ReflectionTestUtils.getField(saved, "note")).isEqualTo("첫 관리자 분쟁 보류");
                assertThat(ReflectionTestUtils.getField(saved, "revision")).isEqualTo(1L);
            }
        } finally { StandardServiceRegistryBuilder.destroy(registry); }
    }

    private FeedCommentReport commentReport() {
        var item = new FeedCommentReport();
        ReflectionTestUtils.setField(item, "commentId", 40L); ReflectionTestUtils.setField(item, "postId", 20L);
        ReflectionTestUtils.setField(item, "reporterId", 9L); ReflectionTestUtils.setField(item, "reason", "SPAM");
        ReflectionTestUtils.setField(item, "snapshotJson", "{}"); ReflectionTestUtils.setField(item, "status", FeedReport.Status.OPEN);
        ReflectionTestUtils.setField(item, "createdAt", LocalDateTime.now()); return item;
    }
    private void review(Object item, boolean hold, String note) {
        if (item instanceof FeedReport report) report.review(FeedReport.Status.RESOLVED, hold, note, LocalDateTime.now());
        else ((FeedCommentReport) item).review(FeedReport.Status.RESOLVED, hold, note, LocalDateTime.now());
    }
}
