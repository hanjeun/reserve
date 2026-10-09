package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageHiddenRepository;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatMessageVisibilityService;
import kr.it.reserve.chat.service.ChatRetractionService;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Release gate for the exact manual DDL on an empty, loopback-only MySQL database. */
@EnabledIfEnvironmentVariable(named = "RESERVE_MYSQL_HIDDEN_TEST_ISOLATED", matches = "1")
@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ContextConfiguration(classes = ChatMessageVisibilityMySqlReleaseTest.Config.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ChatMessageVisibilityMySqlReleaseTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = {ChatMessage.class, Member.class})
    @EnableJpaRepositories(basePackageClasses = {ChatMessageRepository.class, MemberRepository.class})
    @EnableJpaAuditing
    @Import({ChatService.class, ChatMessageVisibilityService.class, ChatRetractionService.class})
    static class Config {}

    @Autowired ChatMessageVisibilityService visibility;
    @Autowired ChatRetractionService changes;
    @Autowired ChatMessageHiddenRepository hidden;
    @Autowired ChatMessageRepository messages;
    @Autowired ChatRoomRepository rooms;
    @Autowired MemberRepository members;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean StoreRepository stores;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry properties) {
        String url = required("RESERVE_MYSQL_HIDDEN_TEST_URL");
        if (!url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/reserve_release_hidden_[a-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalArgumentException("Private deletion tests require a loopback database with the isolated prefix");
        }
        String user = required("RESERVE_MYSQL_HIDDEN_TEST_USER");
        if (!user.matches("reserve_hidden_test[a-z0-9_]*")) {
            throw new IllegalArgumentException("Private deletion tests require a dedicated restricted test account");
        }
        String password = required("RESERVE_MYSQL_HIDDEN_TEST_PASSWORD");
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.datasource.username", () -> user);
        properties.add("spring.datasource.password", () -> password);
        properties.add("spring.datasource.hikari.transaction-isolation", () -> "TRANSACTION_REPEATABLE_READ");
        properties.add("spring.datasource.hikari.connection-init-sql", () -> "SET SESSION innodb_lock_wait_timeout = 5");
        // The operator must create the schema from manual-ddl.md; tests cannot create or repair it.
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing isolated private deletion setting: " + name);
        return value;
    }

    @BeforeEach void requireExactEngineDdlAndRestrictedAccount() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.0.45");
        assertThat(jdbc.queryForObject("SELECT DATABASE()", String.class)).startsWith("reserve_release_hidden_");
        assertThat(jdbc.queryForList("SHOW GRANTS", String.class)).allSatisfy(grant ->
                assertThat(grant).doesNotContain("ALL PRIVILEGES", "CREATE", "ALTER", "DROP"));
        assertThat(jdbc.queryForList("""
                SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'chat_message_hidden' AND INDEX_NAME = 'uk_chat_hidden_viewer'
                  AND NON_UNIQUE = 0 ORDER BY SEQ_IN_INDEX
                """, String.class)).containsExactly("message_id", "member_id");
        assertThat(jdbc.queryForList("""
                SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_message_hidden'
                """, String.class)).containsExactlyInAnyOrder("CASCADE", "CASCADE");
        assertThat(jdbc.queryForList("""
                SELECT CONCAT(REFERENCED_TABLE_NAME, '.', REFERENCED_COLUMN_NAME)
                  FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'chat_message_hidden' AND REFERENCED_TABLE_NAME IS NOT NULL
                """, String.class)).containsExactlyInAnyOrder("chat_message.id", "member.member_id");
        assertThat(hidden.count()).isZero();
        assertThat(messages.count()).isZero();
        assertThat(rooms.count()).isZero();
        assertThat(members.count()).isZero();
    }

    @AfterEach void clearSyntheticFixture() {
        hidden.deleteAll();
        messages.deleteAll();
        rooms.deleteAll();
        members.deleteAll();
    }

    @Test void overlappingDeletionRequestsWaitForTheRoomLockAndCommitOnePreference() throws Exception {
        var viewer = member("duplicate");
        var room = rooms.save(ChatRoom.builder().member(viewer).build());
        var original = message(room, viewer, "원문");
        var firstSaved = new CountDownLatch(1);
        var releaseFirst = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            try {
                var first = workers.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                    var result = visibility.hide(viewer, room.getId(), original.getId());
                    firstSaved.countDown();
                    await(releaseFirst);
                    return result;
                }));
                await(firstSaved);
                var second = workers.submit(() -> {
                    secondStarted.countDown();
                    return visibility.hide(viewer, room.getId(), original.getId());
                });
                await(secondStarted);
                assertThatThrownBy(() -> second.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                assertThat(changes.changes(viewer, room.getId(), 0, 0).hiddenMessageIds()).isEmpty();
                releaseFirst.countDown();
                assertThat(first.get(6, TimeUnit.SECONDS).isHidden()).isTrue();
                assertThat(second.get(6, TimeUnit.SECONDS).isHidden()).isTrue();
                assertThat(hidden.count()).isEqualTo(1);
                assertThat(messages.findById(original.getId()).orElseThrow().getContent()).isEqualTo("원문");
            } finally { releaseFirst.countDown(); }
        }
    }

    @Test void concurrentDifferentDeletionsCannotCommitBehindAnAlreadyConsumedPrivateCursor() throws Exception {
        var viewer = member("cursor");
        var room = rooms.save(ChatRoom.builder().member(viewer).build());
        var firstMessage = message(room, viewer, "첫 메시지");
        var secondMessage = message(room, viewer, "둘째 메시지");
        var firstSaved = new CountDownLatch(1);
        var releaseFirst = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        var secondSaved = new CountDownLatch(1);
        var releaseSecond = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            try {
                var first = workers.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                    visibility.hide(viewer, room.getId(), firstMessage.getId());
                    firstSaved.countDown();
                    await(releaseFirst);
                    return true;
                }));
                await(firstSaved);
                var second = workers.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                    secondStarted.countDown();
                    visibility.hide(viewer, room.getId(), secondMessage.getId());
                    secondSaved.countDown();
                    await(releaseSecond);
                    return true;
                }));
                await(secondStarted);
                assertThatThrownBy(() -> second.get(200, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                releaseFirst.countDown();
                assertThat(first.get(6, TimeUnit.SECONDS)).isTrue();
                await(secondSaved);
                var firstChange = changes.changes(viewer, room.getId(), 0, 0);
                assertThat(firstChange.hiddenMessageIds()).containsExactly(firstMessage.getId());
                releaseSecond.countDown();
                assertThat(second.get(6, TimeUnit.SECONDS)).isTrue();
                var nextChange = changes.changes(viewer, room.getId(), 0, firstChange.nextHiddenId());
                assertThat(nextChange.hiddenMessageIds()).containsExactly(secondMessage.getId());
                assertThat(nextChange.nextHiddenId()).isGreaterThan(firstChange.nextHiddenId());
                assertThat(nextChange.nextRevision()).isZero();
            } finally { releaseFirst.countDown(); releaseSecond.countDown(); }
        }
    }

    @Test void rolledBackDeletionLeavesNeitherAHiddenResponseNorAConsumedPreference() {
        var viewer = member("rollback");
        var room = rooms.save(ChatRoom.builder().member(viewer).build());
        var original = message(room, viewer, "유지할 메시지");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            visibility.hide(viewer, room.getId(), original.getId());
            status.setRollbackOnly();
        });
        assertThat(hidden.count()).isZero();
        assertThat(changes.changes(viewer, room.getId(), 0, 0).hiddenMessageIds()).isEmpty();
        assertThat(visibility.hide(viewer, room.getId(), original.getId()).isHidden()).isTrue();
        assertThat(hidden.count()).isEqualTo(1);
        assertThat(messages.findById(original.getId()).orElseThrow().getContent()).isEqualTo("유지할 메시지");
    }

    private Member member(String label) {
        return members.save(Member.builder().name(label).email(label + "@example.invalid").role(Role.USER).build());
    }
    private ChatMessage message(ChatRoom room, Member viewer, String content) {
        return messages.saveAndFlush(ChatMessage.builder().room(room).senderMemberId(viewer.getId())
                .senderRole(SenderRole.MEMBER).content(content).build());
    }
    private static void await(CountDownLatch gate) {
        try {
            if (!gate.await(6, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for the isolated deletion transaction");
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted isolated deletion transaction", failure);
        }
    }
}
