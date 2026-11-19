package kr.it.reserve.feed.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.FeedException;
import kr.it.reserve.feed.FeedInteractionPolicy;
import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.feed.dto.FeedInteractionDto;
import kr.it.reserve.feed.entity.FeedComment;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.entity.FeedProfile;
import kr.it.reserve.feed.news.StoreNewsAvailability;
import kr.it.reserve.feed.news.dto.StoreNewsDto;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.repository.*;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.persistence.CurrentLockedState;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/** 외부 서비스 없이 별도 loopback MySQL의 실제 version·RR 현재 읽기를 검사해요. */
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_FEED_STATE_TEST_ISOLATED", matches = "1")
class FeedCurrentLockedStateMySqlTest {
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @Autowired MemberRepository members;
    @Autowired FeedProfileRepository profiles;
    @Autowired FeedPostRepository posts;
    @Autowired FeedCommentRepository comments;
    @Autowired FeedMediaRepository media;
    @Autowired FeedCommentReportRepository reports;
    @Autowired FeedCommentReportImageRepository evidence;
    @Autowired FeedAuditRepository audits;
    @Autowired ContentLikeRepository likes;
    @Autowired PromotionRepository promotions;
    @Autowired StoreRepository stores;
    private TransactionTemplate tx;
    private Fixture fixture;
    private FeedCommentService commentService;
    private StoreNewsService newsService;
    private ContentLikeService likeService;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactions);
        tx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        var feeds = new FeedService(new FeedPolicy(true), profiles, posts, comments, mock(ProfileReviewReader.class), media, members, stores,
                promotions, mock(FileStorageService.class), mock(FileDeletionOutboxService.class));
        ReflectionTestUtils.setField(feeds, "entityManager", entityManager);
        var availability = new StoreNewsAvailability(true);
        var policy = new FeedInteractionPolicy(new FeedPolicy(true), availability);
        ReflectionTestUtils.setField(policy, "enabled", true);
        var notifications = mock(FeedNotificationService.class);
        commentService = new FeedCommentService(policy, feeds, posts, comments, reports, audits, new ObjectMapper(),
                entityManager, media, likes, evidence, notifications);
        newsService = new StoreNewsService(availability, feeds, promotions, posts, media, members, stores, entityManager, audits, policy, likes);
        likeService = new ContentLikeService(policy, feeds, newsService, posts, promotions, likes, comments, commentService, notifications, profiles, entityManager);
        fixture = tx.execute(ignored -> {
            LocalDateTime now = now();
            String suffix = UUID.randomUUID().toString();
            var member = members.saveAndFlush(Member.builder().name("합성 사업자").role(Role.BUSINESS).termsAgreed(true)
                    .email(suffix + "@feed-state.example.invalid").build());
            var profile = FeedProfile.create(member, now);
            profile.update("합성 " + suffix.substring(0, 8), "synthetic:" + suffix, "", false, now);
            profiles.saveAndFlush(profile);
            var store = stores.saveAndFlush(Store.builder().owner(member).name("합성 가게").address("서울 강남구 합성로 1")
                    .status(StoreStatus.ACTIVE).build());
            var post = FeedPost.create(profile, null, now);
            post.edit("원래 게시글", "서울", store, null, false, now);
            posts.saveAndFlush(post);
            var comment = comments.saveAndFlush(FeedComment.create(post, profile, null, "원래 댓글", null, now));
            var news = promotions.saveAndFlush(Promotion.builder().member(member).store(store).title("원래 소식")
                    .content("원래 소식 본문").category(Promotion.PromotionCategory.CAFE).conditions("").build());
            var carrier = FeedPost.create(profile, null, now);
            carrier.linkNews(news, "서울", now);
            posts.saveAndFlush(carrier);
            return new Fixture(member.getId(), store.getId(), post.getId(), comment.getId(), news.getId());
        });
    }

    @ParameterizedTest
    @EnumSource(Versioned.class)
    void dirtyFlushAndRepeatedCurrentRefreshKeepOneVersionIncrementAndTheSameManagedObject(Versioned kind) {
        long before = tx.execute(ignored -> {
            Object target = entityManager.find(kind.type, fixture.id(kind), LockModeType.PESSIMISTIC_WRITE);
            long revision = revision(target);
            edit(target, "같은 트랜잭션의 변경");
            CurrentLockedState.refresh(entityManager, target);
            assertThat(entityManager.find(kind.type, fixture.id(kind))).isSameAs(target);
            assertThat(entityManager.contains(target)).isTrue();
            assertThat(revision(target)).isEqualTo(revision + 1);
            var context = entityManager.unwrap(org.hibernate.engine.spi.SessionImplementor.class).getPersistenceContextInternal();
            var afterDirtyFlush = context.getEntry(target).getLockMode();
            assertThat(afterDirtyFlush).isEqualTo(org.hibernate.LockMode.WRITE);
            CurrentLockedState.refresh(entityManager, target);
            entityManager.flush();
            assertThat(revision(target)).isEqualTo(revision + 1);
            assertThat(context.getEntry(target).getLockMode()).isEqualTo(afterDirtyFlush);
            return revision;
        });
        tx.executeWithoutResult(ignored -> {
            Object saved = entityManager.find(kind.type, fixture.id(kind));
            assertThat(revision(saved)).isEqualTo(before + 1);
            assertThat(content(saved)).isEqualTo("같은 트랜잭션의 변경");
        });
    }

    @Test
    void aCommentRequestFromAnEarlierSnapshotCannotOverwriteTheLatestRevision() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            var stale = comments.findById(fixture.comment()).orElseThrow();
            long previousRevision = stale.getRevision();
            separately(() -> comments.findById(stale.getId()).orElseThrow().edit("다른 창의 최신 댓글", now()));
            commentService.edit(fixture.member(), stale.getId(), new FeedInteractionDto.CommentRequest("이전 창의 댓글", null, previousRevision, null));
        })).isInstanceOfAny(FeedException.class, ObjectOptimisticLockingFailureException.class);
        tx.executeWithoutResult(ignored -> assertThat(comments.findById(fixture.comment()).orElseThrow().getContent()).isEqualTo("다른 창의 최신 댓글"));
    }

    @Test
    void aNewsRequestFromAnEarlierSnapshotCannotOverwriteTheLatestRevision() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            var stale = promotions.findById(fixture.news()).orElseThrow();
            long previousRevision = stale.getRevision();
            separately(() -> promotions.findById(stale.getId()).orElseThrow().setContent("다른 창의 최신 소식"));
            newsService.edit(fixture.member(), stale.getId(), new StoreNewsDto.Request(fixture.store(), "이전 제목", "이전 창의 소식",
                    "NEWS", null, null, "", false, List.of(), false, previousRevision, null, false));
        })).isInstanceOf(FeedException.class).hasMessageContaining("변경됐어요");
        tx.executeWithoutResult(ignored -> assertThat(promotions.findById(fixture.news()).orElseThrow().getContent()).isEqualTo("다른 창의 최신 소식"));
    }

    @Test
    void aCommentHiddenAfterAnEarlierSnapshotCannotReceiveANewLike() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            var stale = comments.findById(fixture.comment()).orElseThrow();
            separately(() -> comments.findById(stale.getId()).orElseThrow().visibility(true, now()));
            likeService.set(fixture.member(), "COMMENT", stale.getId(), true);
        })).isInstanceOfAny(FeedException.class, ObjectOptimisticLockingFailureException.class);
        tx.executeWithoutResult(ignored -> assertThat(likes.findByMember_IdAndComment_Id(fixture.member(), fixture.comment())).isEmpty());
    }

    @Test
    void fixtureUsesMySqlRepeatableRead() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.");
        assertThat(jdbc.queryForObject("SELECT @@transaction_isolation", String.class)).isEqualTo("REPEATABLE-READ");
    }

    private void separately(Runnable work) {
        var transaction = new TransactionTemplate(transactions);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.executeWithoutResult(ignored -> work.run());
    }

    private static long revision(Object value) {
        if (value instanceof FeedComment comment) return comment.getRevision();
        if (value instanceof FeedPost post) return post.getRevision();
        return ((Promotion) value).getRevision();
    }

    private static void edit(Object value, String text) {
        if (value instanceof FeedComment comment) comment.edit(text, now());
        else if (value instanceof FeedPost post) post.edit(text, "서울", post.getStore(), null, false, now());
        else ((Promotion) value).setContent(text);
    }

    private static String content(Object value) {
        if (value instanceof FeedComment comment) return comment.getContent();
        if (value instanceof FeedPost post) return post.getContent();
        return ((Promotion) value).getContent();
    }

    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }

    private enum Versioned {
        COMMENT(FeedComment.class), POST(FeedPost.class), NEWS(Promotion.class);
        final Class<?> type;
        Versioned(Class<?> type) { this.type = type; }
    }

    private record Fixture(Long member, Long store, Long post, Long comment, Long news) {
        Long id(Versioned kind) { return switch (kind) { case COMMENT -> comment; case POST -> post; case NEWS -> news; }; }
    }

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_FEED_STATE_TEST_URL");
        String user = required("RESERVE_MYSQL_FEED_STATE_TEST_USER");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_feed_state_[a-z0-9_]+(?:\\?.*)?")
                || !user.matches("reserve_feed_state_test[a-z0-9_]*"))
            throw new IllegalArgumentException("Feed state tests require a disposable loopback database and a dedicated account");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> required("RESERVE_MYSQL_FEED_STATE_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.maximum-pool-size", () -> "4");
        properties.add("spring.datasource.hikari.minimum-idle", () -> "0");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 10");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated feed fixture input: " + key);
        return value;
    }
}
