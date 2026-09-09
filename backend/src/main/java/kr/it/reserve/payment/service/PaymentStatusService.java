package kr.it.reserve.payment.service;

import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.PaymentStatusResponse;
import kr.it.reserve.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PaymentStatusService {
    private final PaymentRepository paymentRepository;
    private final AdvertisementRepository advertisementRepository;
    private final AdPaymentAttemptRepository adPaymentAttempts;

    /** 본인 기록만 조회한다. 다른 사람의 주문과 없는 주문은 동일한 404로 응답한다. */
    @Transactional(readOnly = true)
    public PaymentStatusResponse getStatus(String type, String merchantUid, Long memberId) {
        if (merchantUid == null || merchantUid.isBlank() || merchantUid.length() > 255) {
            throw new PaymentException("주문번호를 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
        if ("reservation".equals(type)) {
            var payment = paymentRepository.findByMerchantUid(merchantUid)
                    .filter(value -> value.getMember() != null && value.getMember().getId().equals(memberId))
                    .orElseThrow(PaymentException::notFound);
            return new PaymentStatusResponse(type, payment.getMerchantUid(), payment.getStatus().name(),
                    payment.getAmount(), payment.getPayMethod());
        }
        if ("ad".equals(type)) {
            var attempt = adPaymentAttempts.findByMerchantUid(merchantUid).orElse(null);
            var ad = (attempt == null ? advertisementRepository.findByMerchantUid(merchantUid)
                    : advertisementRepository.findById(attempt.getAdId()))
                    .filter(value -> value.getStore().getOwner() != null
                            && value.getStore().getOwner().getId().equals(memberId))
                    .orElseThrow(PaymentException::notFound);
            String status = "REVIEW_REQUIRED";
            if (attempt != null) {
                status = switch (attempt.getState()) {
                    case READY -> "PENDING_PAYMENT";
                    case FAILED -> "PAYMENT_FAILED";
                    case REFUNDED -> "REFUNDED";
                    case REFUND_PENDING -> "REFUND_PENDING";
                    case REVIEW_REQUIRED -> "REVIEW_REQUIRED";
                    case PAID -> merchantUid.equals(ad.getMerchantUid()) ? ad.getStatus().name() : "REVIEW_REQUIRED";
                };
            }
            return new PaymentStatusResponse(type, merchantUid, status, attempt == null ? ad.getAmount() : attempt.getAmount(), null);
        }
        throw new PaymentException("결제 유형을 확인해주세요.", HttpStatus.BAD_REQUEST);
    }
}
