package kr.it.reserve.global.support;

import java.util.Optional;

public interface PaymentReceiptRequests {
    Optional<Long> requesterFor(long inquiryId, String merchantUid);
}
