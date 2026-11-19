package kr.it.reserve.review;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.audit.service.AuditCleanupWorker;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.global.error.ReviewException;
import kr.it.reserve.global.trash.ReceivedInquiryTrash;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.dto.ReviewCreateRequest;
import kr.it.reserve.review.dto.ReviewUpdateRequest;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.review.service.ReviewInteractions;
import kr.it.reserve.review.service.ReviewMutationGuard;
import kr.it.reserve.review.service.ReviewPhotos;
import kr.it.reserve.review.service.ReviewService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:review-rating;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
        "spring.datasource.driver-class-name=org.h2.Driver"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ReviewService.class, ReviewMutationGuard.class, ReviewInteractions.class,
        AuditLogService.class, ReviewRatingPersistenceTest.Json.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ReviewRatingPersistenceTest {
    @Autowired ReviewRepository reviews;
    @Autowired ReservationRepository reservations;
    @Autowired StoreRepository stores;
    @Autowired MemberRepository members;
    @Autowired ReviewService service;
    @Autowired AuditLogService audit;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean FeedService feeds;
    @MockitoBean ReviewPhotos photos;
    @Autowired ReviewInteractions interactions;
    @MockitoBean AuditCleanupWorker cleanup;
    @MockitoBean PaymentService payments;
    @MockitoBean ReceivedInquiryTrash inquiryTrash;
    private TransactionTemplate tx;
    private Fixture fixture;

    @TestConfiguration(proxyBeanMethods = false)
    static class Json {
        @Bean ObjectMapper mapper() { return new ObjectMapper(); }
    }

    @BeforeEach
    void seedCompletedVisits() {
        tx = new TransactionTemplate(transactions);
        fixture = tx.execute(ignored -> {
            Member owner = member("owner", Role.BUSINESS);
            Member customer = member("customer", Role.USER);
            Store store = stores.saveAndFlush(Store.builder().owner(owner).name("합성 리뷰 가게")
                    .rating(1.0).reviewCount(2).build());
            Reservation first = visit(customer, store, 1, true);
            Reservation second = visit(customer, store, 2, true);
            Reservation third = visit(customer, store, 3, false);
            Review a = review(customer, store, first);
            Review b = review(customer, store, second);
            return new Fixture(store.getId(), customer.getId(), third.getId(), a.getId(), b.getId());
        });
    }

    @Test
    void concurrentEditsRecalculateFromBothCommittedReviewsDespiteEarlierReads() throws Exception {
        concurrently(
                () -> service.updateReview(fixture.firstReview(), update(5), customer()),
                () -> service.updateReview(fixture.secondReview(), update(5), customer()));

        assertStats(5.0, 2);
    }

    @Test
    void concurrentCreateEditAndDeleteKeepTheSameStoreCountAndAverage() throws Exception {
        concurrently(
                () -> service.updateReview(fixture.firstReview(), update(5), customer()),
                () -> service.deleteReview(fixture.secondReview(), customer()),
                () -> service.createReview(create(3), customer()));

        assertStats(4.0, 2);
        tx.executeWithoutResult(ignored -> assertThat(reservations.findById(fixture.unusedVisit()).orElseThrow().isReviewWritten()).isTrue());
    }

    @Test
    void concurrentSubmissionsConsumeOneCompletedVisitOnlyOnce() throws Exception {
        var successes = new java.util.concurrent.atomic.AtomicInteger();
        var rejected = new java.util.concurrent.atomic.AtomicInteger();
        Runnable submission = () -> {
            service.createReview(create(4), customer());
            successes.incrementAndGet();
        };
        concurrently(error -> {
            assertThat(error).isInstanceOfSatisfying(ReviewException.class,
                    reviewError -> assertThat(reviewError.getStatus()).isEqualTo(HttpStatus.CONFLICT));
            rejected.incrementAndGet();
        }, submission, submission);

        assertThat(successes).hasValue(1);
        assertThat(rejected).hasValue(1);
        assertStats(2.0, 3);
    }

    @Test
    void creatingAReviewAlongsideLikesAndCommentsKeepsMemberAndReviewFkLocksOrdered() throws Exception {
        concurrently(
                () -> service.createReview(create(4), customer()),
                () -> interactions.setLike(fixture.firstReview(), customer(), true),
                () -> interactions.addComment(fixture.secondReview(), customer(), UUID.randomUUID(), "합성 댓글이에요."));

        assertStats(2.0, 3);
        tx.executeWithoutResult(ignored -> {
            var summaries = interactions.summaries(java.util.List.of(fixture.firstReview(), fixture.secondReview()), customer());
            assertThat(summaries.get(fixture.firstReview()).likeCount()).isEqualTo(1);
            assertThat(summaries.get(fixture.secondReview()).commentCount()).isEqualTo(1);
        });
    }

    @Test
    void participationUsesTheLockedMemberInsteadOfTheOldRequestPrincipal() {
        var revocation = new TransactionTemplate(transactions);
        revocation.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(ignored -> {
            Member stale = customer();
            revocation.executeWithoutResult(change -> members.findById(fixture.customer()).orElseThrow().setTermsAgreed(false));
            assertThat(stale.isTermsAgreed()).isTrue();
            assertThatThrownBy(() -> interactions.setLike(fixture.firstReview(), stale, true))
                    .isInstanceOfSatisfying(ReviewException.class,
                            error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
            ignored.setRollbackOnly();
        });
        assertStats(1.0, 2);
    }

    @Test
    void moderatorHidingAndTrashRestorationUseTheSameRatingBoundary() {
        service.updateReview(fixture.secondReview(), update(5), customerInNewTransaction());
        assertStats(3.0, 2);
        audit.softDeleteReview(fixture.firstReview());
        assertStats(5.0, 1);
        audit.restore("REVIEW", fixture.firstReview());
        assertStats(3.0, 2);
        service.moderateVisibility(fixture.secondReview(), true);
        assertStats(1.0, 1);
        service.moderateVisibility(fixture.firstReview(), true);
        assertStats(null, 0);
        service.moderateVisibility(fixture.secondReview(), false);
        assertStats(5.0, 1);
    }

    @Test
    void rollbackRestoresReviewAndDenormalizedStatsTogether() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            service.updateReview(fixture.firstReview(), update(5), customer());
            assertThat(stores.findById(fixture.store()).orElseThrow().getRating()).isEqualTo(3.0);
            throw new IllegalStateException("synthetic rollback");
        })).isInstanceOf(IllegalStateException.class).hasMessage("synthetic rollback");

        assertStats(1.0, 2);
        Integer persistedRating = tx.execute(ignored -> reviews.findById(fixture.firstReview()).orElseThrow().getRating());
        assertThat(persistedRating).isEqualTo(1);
    }

    @Test
    void anEarlierReservationSnapshotCannotReopenAConsumedVisitAfterTheReviewWasDeleted() throws Exception {
        CountDownLatch read = new CountDownLatch(1), resume = new CountDownLatch(1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var waiting = pool.submit(() -> tx.executeWithoutResult(ignored -> {
                assertThat(reservations.findById(fixture.unusedVisit()).orElseThrow().isReviewWritten()).isFalse();
                read.countDown();
                await(resume);
                assertThatThrownBy(() -> service.createReview(create(4), customer()))
                        .isInstanceOfSatisfying(ReviewException.class,
                                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.CONFLICT));
                // 참여 서비스의 예외가 표시한 rollback-only를 명시해 바깥 시험 TX도 정상 롤백한다.
                ignored.setRollbackOnly();
            }));
            try {
                assertThat(read.await(10, TimeUnit.SECONDS)).isTrue();
                Member customer = customerInNewTransaction();
                Long reviewId = service.createReview(create(4), customer).getId();
                service.deleteReview(reviewId, customer);
                assertStats(1.0, 2);
            } finally {
                resume.countDown();
            }
            waiting.get(25, TimeUnit.SECONDS);
        }
    }

    @Test
    void failedCreationRollsBackItsVisitConsumptionAndRating() {
        assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
            service.createReview(create(4), customer());
            throw new IllegalStateException("synthetic creation rollback");
        })).isInstanceOf(IllegalStateException.class).hasMessage("synthetic creation rollback");

        assertStats(1.0, 2);
        tx.executeWithoutResult(ignored -> {
            assertThat(reservations.findById(fixture.unusedVisit()).orElseThrow().isReviewWritten()).isFalse();
            assertThat(service.canWriteReview(fixture.unusedVisit(), customer())).isTrue();
        });
    }

    private void concurrently(Runnable... actions) throws Exception {
        concurrently(null, actions);
    }

    private void concurrently(java.util.function.Consumer<RuntimeException> failure, Runnable... actions) throws Exception {
        CountDownLatch read = new CountDownLatch(actions.length), start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(actions.length)) {
            var futures = new ArrayList<java.util.concurrent.Future<?>>();
            for (Runnable action : actions) {
                futures.add(pool.submit(() -> {
                    try {
                        tx.executeWithoutResult(ignored -> {
                            // MySQL 하위 시험에서는 이 조회가 쓰기 전의 RR snapshot과 관리 엔티티를 만든다.
                            assertThat(reviews.findAverageRatingByStoreId(fixture.store())).isEqualTo(1.0);
                            stores.findById(fixture.store()).orElseThrow();
                            reviews.findById(fixture.firstReview()).orElseThrow();
                            reservations.findById(fixture.unusedVisit()).orElseThrow().isReviewWritten();
                            read.countDown();
                            await(start);
                            action.run();
                        });
                    } catch (RuntimeException error) {
                        if (failure == null) throw error;
                        failure.accept(error);
                    }
                }));
            }
            try {
                assertThat(read.await(10, TimeUnit.SECONDS)).isTrue();
            } finally {
                start.countDown();
            }
            for (var future : futures) future.get(25, TimeUnit.SECONDS);
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Synthetic review test timed out");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }

    private void assertStats(Double rating, int count) {
        tx.executeWithoutResult(ignored -> {
            Store store = stores.findById(fixture.store()).orElseThrow();
            Double average = reviews.findAverageRatingByStoreId(fixture.store());
            assertThat(store.getRating()).isEqualTo(rating);
            assertThat(store.getReviewCount()).isEqualTo(count);
            assertThat(reviews.countByStoreId(fixture.store())).isEqualTo(count);
            assertThat(average == null ? null : Math.round(average * 10) / 10.0).isEqualTo(rating);
        });
    }

    private Member customer() { return members.findById(fixture.customer()).orElseThrow(); }
    private Member customerInNewTransaction() { return tx.execute(ignored -> customer()); }

    private Member member(String label, Role role) {
        return members.saveAndFlush(Member.builder().name("합성 " + label).role(role).termsAgreed(true)
                .email(label + "-" + UUID.randomUUID() + "@review.example.invalid").build());
    }

    private Reservation visit(Member customer, Store store, int day, boolean reviewWritten) {
        return reservations.saveAndFlush(Reservation.builder().member(customer).store(store).guestCount(1)
                .reservationDate(LocalDate.of(2026, 1, day)).reservationTime(LocalTime.NOON)
                .status(Reservation.ReservationStatus.COMPLETED).reviewWritten(reviewWritten).build());
    }

    private Review review(Member customer, Store store, Reservation visit) {
        return reviews.saveAndFlush(Review.builder().member(customer).store(store).reservation(visit).rating(1)
                .title("합성 리뷰").content("격리된 합성 리뷰 내용이에요.").build());
    }

    private ReviewCreateRequest create(int rating) {
        var request = new ReviewCreateRequest();
        request.setReservationId(fixture.unusedVisit());
        request.setRating(rating);
        request.setTitle("합성 새 리뷰");
        request.setContent("격리된 합성 새 리뷰예요.");
        return request;
    }

    private ReviewUpdateRequest update(int rating) {
        return new ReviewUpdateRequest(rating, "합성 수정 리뷰", "격리된 합성 수정 내용이에요.");
    }

    private record Fixture(Long store, Long customer, Long unusedVisit, Long firstReview, Long secondReview) { }
}
