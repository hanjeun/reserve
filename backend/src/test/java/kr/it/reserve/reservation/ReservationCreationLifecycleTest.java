package kr.it.reserve.reservation;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.holiday.HolidayService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReservationCreationLifecycleTest {

    @Test
    @DisplayName("탈퇴와 직렬화된 최신 회원 행이 없으면 예약 생성을 시작하지 않는다")
    void deletedMemberCannotCreateReservationFromStalePrincipal() {
        ReservationRepository reservationRepository = mock(ReservationRepository.class);
        StoreRepository storeRepository = mock(StoreRepository.class);
        MemberRepository memberRepository = mock(MemberRepository.class);
        ReservationService service = new ReservationService(
                reservationRepository,
                storeRepository,
                mock(HolidayService.class),
                mock(PaymentService.class),
                mock(EmailService.class),
                memberRepository,
                mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class));

        Member stalePrincipal = Member.builder().id(1L).email("withdrawn@example.com").build();
        ReservationCreateRequest request = new ReservationCreateRequest(
                10L,
                LocalDate.now().plusDays(1),
                LocalTime.NOON,
                1,
                null,
                false);
        when(memberRepository.findActiveByIdForUpdate(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createReservation(request, stalePrincipal))
                .isInstanceOf(ReservationException.class);
        verify(storeRepository, never()).findByIdForUpdate(10L);
        verify(reservationRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("영업 종료와 직렬화된 가게 행은 대기 중이던 예약도 거절한다")
    void closedStoreCannotAcceptQueuedReservation() {
        ReservationRepository reservationRepository = mock(ReservationRepository.class);
        StoreRepository storeRepository = mock(StoreRepository.class);
        MemberRepository memberRepository = mock(MemberRepository.class);
        ReservationService service = new ReservationService(
                reservationRepository,
                storeRepository,
                mock(HolidayService.class),
                mock(PaymentService.class),
                mock(EmailService.class),
                memberRepository,
                mock(AuditLogService.class),
                mock(QrCheckinTokenProvider.class));

        Member activeMember = Member.builder()
                .id(1L)
                .email("active@example.com")
                .termsAgreed(true)
                .build();
        Store closedStore = Store.builder().id(10L).name("종료 가게").build();
        closedStore.softDelete();
        ReservationCreateRequest request = new ReservationCreateRequest(
                10L,
                LocalDate.now().plusDays(1),
                LocalTime.NOON,
                1,
                null,
                false);
        when(memberRepository.findActiveByIdForUpdate(1L)).thenReturn(Optional.of(activeMember));
        when(storeRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(closedStore));

        assertThatThrownBy(() -> service.createReservation(request, activeMember))
                .isInstanceOf(ReservationException.class);
        verify(reservationRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
