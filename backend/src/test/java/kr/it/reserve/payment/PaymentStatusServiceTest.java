package kr.it.reserve.payment;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.service.PaymentStatusService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.reservation.entity.Reservation;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentStatusServiceTest {
    @Mock private PaymentRepository paymentRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository adPaymentAttempts;
    @InjectMocks private PaymentStatusService service;

    @ParameterizedTest
    @EnumSource(Payment.PaymentStatus.class)
    void readsActualReservationStatusWithoutMutatingPayment(Payment.PaymentStatus status) {
        var owner = Member.builder().id(1L).build();
        var payment = Payment.builder().member(owner).merchantUid("PAY-TEST").status(status).amount(1000).build();
        when(paymentRepository.findByMerchantUid("PAY-TEST")).thenReturn(Optional.of(payment));
        var response = service.getStatus("reservation", "PAY-TEST", 1L);
        assertEquals(status.name(), response.status());
        assertEquals(1000, response.amount());
        assertEquals(status, payment.getStatus());
        verify(paymentRepository).findByMerchantUid("PAY-TEST");
        verifyNoMoreInteractions(paymentRepository, advertisementRepository);
    }

    @ParameterizedTest
    @EnumSource(AdStatus.class)
    void legacyAdStatusIsNotFinancialProof(AdStatus status) {
        var owner = Member.builder().id(1L).build();
        var ad = Advertisement.builder().store(Store.builder().owner(owner).build())
                .merchantUid("AD-TEST").status(status).amount(1000).build();
        when(advertisementRepository.findByMerchantUid("AD-TEST")).thenReturn(Optional.of(ad));
        var response = service.getStatus("ad", "AD-TEST", 1L);
        assertEquals("REVIEW_REQUIRED", response.status());
        assertEquals(status, ad.getStatus());
        verify(advertisementRepository).findByMerchantUid("AD-TEST");
        verifyNoMoreInteractions(paymentRepository, advertisementRepository);
    }

    @ParameterizedTest
    @EnumSource(AdStatus.class)
    void paidAdAttemptDoesNotTurnExposureStateIntoPaymentFailure(AdStatus status) {
        var owner = Member.builder().id(1L).build();
        var ad = Advertisement.builder().id(2L).store(Store.builder().id(3L).owner(owner).build())
                .merchantUid("AD-TEST").status(status).amount(1000).build();
        var attempt = kr.it.reserve.advertisement.entity.AdPaymentAttempt.create(ad, false);
        attempt.reviewed(kr.it.reserve.advertisement.entity.AdPaymentAttempt.State.PAID, null);
        when(adPaymentAttempts.findByMerchantUid("AD-TEST")).thenReturn(Optional.of(attempt));
        when(advertisementRepository.findById(2L)).thenReturn(Optional.of(ad));
        var response = service.getStatus("ad", "AD-TEST", 1L);
        var expected = switch (status) {
            case ACTIVE, EXPIRED, SUSPENDED -> status.name();
            default -> "REVIEW_REQUIRED";
        };
        assertEquals(expected, response.status());
        assertNull(response.reservation());
        assertEquals(kr.it.reserve.advertisement.entity.AdPaymentAttempt.State.PAID, attempt.getState());
        assertEquals(status, ad.getStatus());
    }

    @Test
    void doesNotDiscloseAnotherMembersPaymentEvenToAnAdminId() {
        when(paymentRepository.findByMerchantUid("PAY-OTHER")).thenReturn(Optional.of(Payment.builder()
                .member(Member.builder().id(2L).build()).status(Payment.PaymentStatus.PAID).build()));
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(PaymentException.class, () -> service.getStatus("reservation", "PAY-OTHER", 1L)).getStatus());
    }

    @Test
    void doesNotDiscloseAnotherOwnersAd() {
        when(advertisementRepository.findByMerchantUid("AD-OTHER")).thenReturn(Optional.of(Advertisement.builder()
                .store(Store.builder().owner(Member.builder().id(2L).build()).build()).status(AdStatus.ACTIVE).build()));
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(PaymentException.class, () -> service.getStatus("ad", "AD-OTHER", 1L)).getStatus());
    }

    @Test
    void readsReservationSummaryAndRefundFromOwnedRecords() {
        var owner = Member.builder().id(1L).name("합성 예약자").build();
        var reservation = Reservation.builder().member(owner).store(Store.builder().name("합성 가게").build())
                .reservationCode("R-FIXTURE").reservationDate(LocalDate.of(2026, 11, 1))
                .reservationTime(LocalTime.of(17, 0)).guestCount(2).build();
        var payment = Payment.builder().member(owner).reservation(reservation).merchantUid("PAY-TEST")
                .status(Payment.PaymentStatus.PARTIAL_REFUNDED).amount(10000).refundAmount(4000).payMethod("PaymentMethodEasyPay").pgProvider("NAVERPAY").build();
        when(paymentRepository.findByMerchantUid("PAY-TEST")).thenReturn(Optional.of(payment));
        var response = service.getStatus("reservation", "PAY-TEST", 1L);
        assertEquals(4000, response.refundedAmount());
        assertEquals("PaymentMethodEasyPay", response.payMethod());
        assertEquals("NAVERPAY", response.payProvider());
        assertEquals("합성 가게", response.reservation().storeName());
        assertEquals("R-FIXTURE", response.reservation().reservationCode());
        assertEquals(LocalDate.of(2026, 11, 1), response.reservation().reservationDate());
        assertEquals(LocalTime.of(17, 0), response.reservation().reservationTime());
        assertEquals(2, response.reservation().guestCount());
        assertEquals("합성 예약자", response.reservation().memberName());
        assertEquals(Payment.PaymentStatus.PARTIAL_REFUNDED, payment.getStatus());
        assertEquals(4000, payment.getRefundAmount());
        verifyNoInteractions(advertisementRepository, adPaymentAttempts);
    }

    @Test
    void refusesSummaryWhenLinkedReservationBelongsToAnotherMember() {
        var payment = Payment.builder().member(Member.builder().id(1L).build()).merchantUid("PAY-TEST")
                .reservation(Reservation.builder().member(Member.builder().id(2L).name("공개하면 안 되는 이름").build()).build())
                .status(Payment.PaymentStatus.PAID).amount(1000).build();
        when(paymentRepository.findByMerchantUid("PAY-TEST")).thenReturn(Optional.of(payment));
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(PaymentException.class, () -> service.getStatus("reservation", "PAY-TEST", 1L)).getStatus());
    }

    @Test
    void missingRecordsAndInvalidInputAreExplicitErrors() {
        when(paymentRepository.findByMerchantUid("MISSING")).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(PaymentException.class, () -> service.getStatus("reservation", "MISSING", 1L)).getStatus());
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(PaymentException.class, () -> service.getStatus("unknown", "PAY-TEST", 1L)).getStatus());
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(PaymentException.class, () -> service.getStatus("ad", " ", 1L)).getStatus());
    }
}
