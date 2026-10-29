package kr.it.reserve.payment.service;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.dto.PaymentResponseDto;
import kr.it.reserve.payment.dto.PaymentVerifyDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 소유권·상태 조회와 잠금 반영 사이에서만 PG를 호출한다. */
@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.NEVER)
public class PaymentVerificationService {
    private final PaymentService payments;
    private final PortoneService portone;

    public PaymentResponseDto verifyByMember(PaymentVerifyDto request, Member requester) {
        return verify(request, requester.getId());
    }

    public PaymentResponseDto verifyRedirect(PaymentVerifyDto request) {
        return verify(request, null);
    }

    private PaymentResponseDto verify(PaymentVerifyDto request, Long memberId) {
        var snapshot = payments.prepareVerification(request.getMerchantUid(), memberId);
        if (snapshot.completed() != null) return snapshot.completed();
        var payment = portone.getPaymentInfo(snapshot.merchantUid());
        // 재조회 중 웹훅·환불이 먼저 반영됐을 수 있어 새 트랜잭션에서 다시 잠금·상태 검사한다.
        // 클라이언트가 보낸 거래번호를 PG 증거가 없는 원장 값으로 저장하지 않아요.
        return payments.completeReadyPaymentFromPg(snapshot.merchantUid(), payment, null);
    }
}
