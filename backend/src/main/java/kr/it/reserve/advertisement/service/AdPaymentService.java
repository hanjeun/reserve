package kr.it.reserve.advertisement.service;

import kr.it.reserve.advertisement.dto.AdPaymentPrepareResponse;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.service.PortoneService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 외부 통신 조정자. 트랜잭션 안에서 호출하면 거부해 PG 대기 동안 DB 잠금을 잡는 회귀를 막는다. */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(propagation = Propagation.NEVER)
public class AdPaymentService {
    private final AdPaymentLedgerService ledger;
    private final AdPaymentAttemptRepository attempts;
    private final AdvertisementRepository ads;
    private final PortoneService portone;

    public AdPaymentPrepareResponse prepare(Long adId, Long ownerId) {
        String uid = ledger.currentUid(adId, ownerId);
        reconcile(uid, ownerId);
        return ledger.prepare(adId, ownerId, portone.getStoreId());
    }

    public AdvertisementResponse verify(String uid, Long ownerId) {
        validateUid(uid);
        reconcile(uid, ownerId);
        return ledger.verifiedResult(uid, ownerId);
    }

    public void cancel(Long adId, Long ownerId) {
        for (String uid : ledger.requestOwnerCancellation(adId, ownerId)) reconcile(uid, ownerId);
    }

    public void requestReviewedRefund(Long attemptId, Long actorId) {
        String uid = ledger.requestReviewedRefund(attemptId, actorId);
        reconcile(uid, null);
    }

    public boolean isKnown(String uid) {
        return uid != null && (attempts.findAdId(uid).isPresent() || ads.findIdByMerchantUid(uid).isPresent());
    }

    /** 웹훅/관리자/스케줄러의 공통 관문. false는 이미 처리 중이거나 조회 실패여서 재시도가 필요하다는 뜻이다. */
    public boolean reconcile(String uid, Long ownerId) {
        validateUid(uid);
        AdPaymentLedgerService.Claim claim = ledger.claim(uid, ownerId);
        if (claim == null) return false;
        PortoneV2PaymentResponse payment;
        try {
            payment = portone.getPaymentInfo(uid);
        } catch (RuntimeException e) {
            ledger.recordLookupFailure(claim, e instanceof PaymentException pe && pe.getStatus() == HttpStatus.NOT_FOUND);
            log.warn("Advertisement payment lookup deferred: errorType={}", e.getClass().getSimpleName());
            return false;
        }
        AdPaymentLedgerService.RefundCommand command = ledger.applyPayment(claim, payment);
        if (command != null) {
            PortoneV2CancelResponse outcome = null;
            try {
                outcome = portone.cancelPayment(command.merchantUid(), command.amount(), "광고 취소 요청", command.key());
            } catch (RuntimeException e) {
                log.warn("Advertisement refund outcome uncertain: errorType={}", e.getClass().getSimpleName());
            }
            // 이 저장이 실패해도 발신 전 원장과 lease가 남는다. 이후 GET 대사만 수행하고 무조건 재발신하지 않는다.
            ledger.applyRefund(command, outcome);
        }
        return true;
    }

    private void validateUid(String uid) {
        if (uid == null || !uid.matches("[A-Za-z0-9_-]{1,255}")) throw AdvertisementException.notFound();
    }
}
