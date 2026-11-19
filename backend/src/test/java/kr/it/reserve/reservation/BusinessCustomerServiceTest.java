package kr.it.reserve.reservation;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.reservation.repository.BusinessCustomerRepository;
import kr.it.reserve.reservation.service.BusinessCustomerService;
import kr.it.reserve.reservation.service.ReservationNoShowRestriction;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BusinessCustomerServiceTest {
    private final BusinessCustomerRepository customers = mock(BusinessCustomerRepository.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private final BusinessCustomerService service = new BusinessCustomerService(customers, stores, mock(ReservationNoShowRestriction.class));
    private final Member owner = Member.builder().id(7L).role(Role.BUSINESS).build();

    @Test
    void customerReviewsKeepTheirFieldsAndPageAfterTheOwnerAndPrivacyScopeChecks() {
        when(stores.existsByIdAndOwnerIdAndDeletedAtIsNull(11L, 7L)).thenReturn(true);
        when(customers.hasVisibleCustomer(eq(7L), eq(11L), eq(23L), any())).thenReturn(1);
        var row = mock(BusinessCustomerRepository.ReviewRow.class);
        LocalDateTime created = LocalDateTime.of(2026, 11, 1, 12, 0);
        when(row.getId()).thenReturn(31L);
        when(row.getTitle()).thenReturn("합성 제목");
        when(row.getContent()).thenReturn("합성 후기");
        when(row.getRating()).thenReturn(4);
        when(row.getCreatedAt()).thenReturn(created);
        when(row.getOwnerReply()).thenReturn("합성 답변");
        when(customers.reviews(eq(11L), eq(23L), any())).thenReturn(new PageImpl<>(List.of(row), PageRequest.of(1, 1), 3));

        var page = service.reviews(owner, 11L, 23L, 1, 1);

        assertThat(page.getContent()).containsExactly(new BusinessCustomerService.CustomerReview(31L, "합성 제목", "합성 후기", 4, created, "합성 답변"));
        assertThat(page.getNumber()).isEqualTo(1);
        assertThat(page.getSize()).isEqualTo(1);
        assertThat(page.getTotalElements()).isEqualTo(3);
        var bounds = ArgumentCaptor.forClass(Pageable.class);
        var order = inOrder(stores, customers);
        order.verify(stores).existsByIdAndOwnerIdAndDeletedAtIsNull(11L, 7L);
        order.verify(customers).hasVisibleCustomer(eq(7L), eq(11L), eq(23L), any());
        order.verify(customers).reviews(eq(11L), eq(23L), bounds.capture());
        assertThat(bounds.getValue().getPageNumber()).isEqualTo(1);
        assertThat(bounds.getValue().getPageSize()).isEqualTo(1);
    }

    @Test
    void anOrdinaryMemberCannotReadBusinessCustomerReviews() {
        var visitor = Member.builder().id(7L).role(Role.USER).build();
        assertThatThrownBy(() -> service.reviews(visitor, 11L, 23L, 0, 20))
                .isInstanceOfSatisfying(ReservationException.class, failure -> assertThat(failure.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(customers, stores);
    }

    @Test
    void anotherOwnersStoreCannotExposeCustomerReviews() {
        assertThatThrownBy(() -> service.reviews(owner, 11L, 23L, 0, 20))
                .isInstanceOfSatisfying(ReservationException.class, failure -> assertThat(failure.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(customers);
    }

    @Test
    void aCustomerOutsideTheVisibleReservationScopeCannotExposeReviews() {
        when(stores.existsByIdAndOwnerIdAndDeletedAtIsNull(11L, 7L)).thenReturn(true);
        assertThatThrownBy(() -> service.reviews(owner, 11L, 23L, 0, 20))
                .isInstanceOfSatisfying(ReservationException.class, failure -> assertThat(failure.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        verify(customers).hasVisibleCustomer(eq(7L), eq(11L), eq(23L), any());
        verify(customers, never()).reviews(any(), any(), any());
    }
}
