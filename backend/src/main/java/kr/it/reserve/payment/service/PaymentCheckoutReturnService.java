package kr.it.reserve.payment.service;

import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.PaymentCheckoutReturnResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.NEVER)
public class PaymentCheckoutReturnService {
    private final PaymentStatusService statuses;
    private final PaymentService payments;
    private final PortoneService portone;

    public PaymentCheckoutReturnResponse check(String merchantUid, Long memberId) {
        // 다른 회원의 주문으로 PG 조회를 유발하지 않아요.
        var before = statuses.getStatus("reservation", merchantUid, memberId);
        if (!"READY".equals(before.status()) && !"FAILED".equals(before.status())) {
            return new PaymentCheckoutReturnResponse(merchantUid, PaymentCheckoutReturnResponse.Outcome.STATUS, null);
        }
        PortoneV2PaymentResponse observed = null;
        boolean missing = false;
        try {
            observed = portone.getPaymentInfo(merchantUid);
        } catch (PaymentException failure) {
            missing = failure.getStatus() == HttpStatus.NOT_FOUND;
        }
        return payments.resolveCheckoutReturn(merchantUid, memberId, observed, missing);
    }
}
