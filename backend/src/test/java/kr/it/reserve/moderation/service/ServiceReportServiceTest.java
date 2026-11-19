package kr.it.reserve.moderation.service;

import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.moderation.entity.ServiceReport;
import kr.it.reserve.moderation.entity.ServiceReportEntry;
import kr.it.reserve.moderation.repository.AdminReportQueueRepository;
import kr.it.reserve.moderation.repository.ServiceReportEntryRepository;
import kr.it.reserve.moderation.repository.ServiceReportRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.review.service.ReviewService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ServiceReportServiceTest {
    @Mock ServiceReportRepository reports;
    @Mock ServiceReportEntryRepository entries;
    @Mock ReviewRepository reviews;
    @Mock ReservationRepository reservations;
    @Mock StoreRepository stores;
    @Mock PaymentRepository payments;
    @Mock ReviewService reviewService;
    @Mock AdminReportQueueRepository queue;
    @InjectMocks ServiceReportService service;

    private final Member owner = Member.builder().id(3L).role(Role.BUSINESS).termsAgreed(true).build();
    private final Member reviewer = Member.builder().id(7L).role(Role.USER).termsAgreed(true).build();

    @Test
    void theAuthorCannotReportTheirOwnReview() {
        var review = Review.builder().store(Store.builder().owner(owner).build()).member(reviewer).build();
        when(reviews.findById(14L)).thenReturn(Optional.of(review));

        assertThatThrownBy(() -> service.submit(reviewer, ServiceReport.TargetType.REVIEW, 14L,
                ServiceReportService.Reason.ABUSE, "신고 근거"))
                .isInstanceOfSatisfying(BusinessException.class, error -> org.assertj.core.api.Assertions.assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(reports, entries);
    }

    @Test
    void aRetriedReportDoesNotAddAnotherEntry() {
        var reader = Member.builder().id(12L).role(Role.USER).termsAgreed(true).build();
        var store = Store.builder().id(15L).owner(owner).build();
        var review = Review.builder().store(store).member(reviewer).rating(1).title("리뷰").content("내용").build();
        var report = mock(ServiceReport.class);
        when(report.getId()).thenReturn(1L);
        when(reviews.findById(14L)).thenReturn(Optional.of(review));
        when(reports.findByTargetTypeAndTargetId(ServiceReport.TargetType.REVIEW, 14L)).thenReturn(Optional.of(report));
        when(entries.existsByReportIdAndActorIdAndKind(1L, reader.getId(), ServiceReportEntry.Kind.REPORT)).thenReturn(true);

        service.submit(reader, ServiceReport.TargetType.REVIEW, 14L, ServiceReportService.Reason.ABUSE, "신고 근거");
        verify(reports).insertTarget(eq("REVIEW"), eq(14L), eq(15L), eq(7L), eq("ABUSE"), any());
        verify(entries, never()).save(any());
        verify(report, never()).recordActivity(any());
    }

    @Test
    void aNonAdministratorCannotReadTheQueue() {
        assertThatThrownBy(() -> service.queue(owner, null, null, 0, 20))
                .isInstanceOfSatisfying(BusinessException.class, error -> org.assertj.core.api.Assertions.assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(queue);
    }
}
