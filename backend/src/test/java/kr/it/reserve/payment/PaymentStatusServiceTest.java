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
