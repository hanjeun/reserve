package kr.it.reserve.advertisement.service;

import kr.it.reserve.advertisement.dto.AdPaymentPrepareResponse;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.entity.AdPaymentAttempt;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import static kr.it.reserve.advertisement.entity.AdPaymentAttempt.State;

/**
 * 금융 단계별 커밋 관문. 잠금 순서는 Store → Advertisement → AdPaymentAttempt이며 PG는 호출하지 않는다.
 * 발신 의도 저장이 실패하면 외부 호출도 시작할 수 없다. 실패/미상 기록은 이후 API 예외와 별도로 커밋된다.
 */
@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.REQUIRES_NEW)
public class AdPaymentLedgerService {
    private final AdPaymentAttemptRepository attempts;
    private final AdvertisementRepository ads;
    private final StoreRepository stores;

    public record Claim(String merchantUid, String token) {}
    public record RefundCommand(String merchantUid, String token, int amount, String key) {}

    /** 신규 광고와 최초 시도는 반드시 하나의 트랜잭션에서 생성한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void registerNew(Advertisement ad) { attempts.save(AdPaymentAttempt.create(ad, false)); }

    /** 기존 광고 쓰기 경로도 같은 잠금 순서를 쓰게 한다. 호출자 트랜잭션 안에서만 사용한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Advertisement lockAdvertisement(Long adId) { return lockAd(adId); }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requireResolvedForRemoval(Long adId) {
        if (!attempts.existsByAdId(adId) || attempts.findByAdIdOrderByIdAsc(adId).stream()
                .anyMatch(value -> AdPaymentAttempt.UNRESOLVED.contains(value.getState()))) {
            throw conflict("결제 확인이 끝난 뒤 광고를 숨길 수 있습니다.");
        }
    }

    private Advertisement lockAd(Long adId) {
        Long storeId = ads.findStoreId(adId).orElseThrow(AdvertisementException::notFound);
        stores.findByIdForUpdate(storeId).orElseThrow(AdvertisementException::notFound);
        return ads.findByIdForUpdate(adId).orElseThrow(AdvertisementException::notFound);
    }

    private Advertisement lockByUid(String uid) {
        Long adId = attempts.findAdId(uid).or(() -> ads.findIdByMerchantUid(uid))
                .orElseThrow(AdvertisementException::notFound);
        return lockAd(adId);
    }

    private AdPaymentAttempt current(Advertisement ad) {
        return attempts.findForUpdate(ad.getMerchantUid()).orElseGet(() ->
                attempts.save(AdPaymentAttempt.create(ad, true)));
    }

    private void requireOwner(Advertisement ad, Long ownerId) {
        if (ownerId != null && (ad.getStore().getOwner() == null
                || !ownerId.equals(ad.getStore().getOwner().getId()))) throw AdvertisementException.notFound();
    }

    public String currentUid(Long adId, Long ownerId) {
        Advertisement ad = lockAd(adId);
        requireOwner(ad, ownerId);
        return current(ad).getMerchantUid();
    }

    /** 과거 상태가 REFUNDED여도 증거로 복사하지 않는다. 최초 PG 대사를 기다리는 원장으로 가져온다. */
    public void importLegacy(Long adId) { current(lockAd(adId)); }

    public Claim claim(String uid, Long ownerId) {
        Advertisement ad = lockByUid(uid);
        requireOwner(ad, ownerId);
        current(ad);
        AdPaymentAttempt attempt = attempts.findForUpdate(uid).orElseThrow(AdvertisementException::notFound);
        String token = attempt.claim(LocalDateTime.now());
        return token == null ? null : new Claim(uid, token);
    }

    /** 같은 READY는 재사용한다. 새 UID는 PG FAILED로 확정된 이전 시도만 교체할 수 있다. */
    public AdPaymentPrepareResponse prepare(Long adId, Long ownerId, String portoneStoreId) {
        Advertisement ad = lockAd(adId);
        requireOwner(ad, ownerId);
        AdPaymentAttempt attempt = current(ad);
        if (ad.isDeleted() || ad.getStore().isDeleted() || ad.getStore().isSuspended()
                || ad.getStartDate().isBefore(ServiceTime.today())
                || attempt.isCancelRequested()
                || (ad.getStatus() != AdStatus.PENDING_PAYMENT && ad.getStatus() != AdStatus.PAYMENT_FAILED)) {
            throw conflict("이 광고는 다시 결제할 수 없습니다. 광고 내역을 확인해주세요.");
        }
        if (attempt.getLeaseToken() != null) throw conflict("결제 상태를 확인 중입니다. 잠시 후 다시 확인해주세요.");
        boolean reusable = !attempt.isEverPaid() && ("READY".equals(attempt.getPgStatus())
                || "NOT_FOUND".equals(attempt.getPgStatus()));
        if (!reusable && attempt.getState() != State.FAILED) {
            throw conflict("기존 결제 결과가 확실하지 않습니다. 재결제하지 말고 내역을 확인해주세요.");
        }
        if (attempt.getState() == State.FAILED && "FAILED".equals(attempt.getPgStatus())) {
            boolean otherUnresolved = attempts.findByAdIdOrderByIdAsc(adId).stream()
                    .anyMatch(value -> !value.getId().equals(attempt.getId())
                            && (AdPaymentAttempt.UNRESOLVED.contains(value.getState()) || value.getState() == State.PAID));
            if (otherUnresolved) throw conflict("이전 결제 시도의 확인이 필요합니다.");
            ad.setMerchantUid("AD-" + UUID.randomUUID());
            attempts.save(AdPaymentAttempt.create(ad, false));
        }
        ad.setStatus(AdStatus.PENDING_PAYMENT);
        var owner = ad.getStore().getOwner();
        return AdPaymentPrepareResponse.builder().adId(adId).merchantUid(ad.getMerchantUid()).amount(ad.getAmount())
                .productName(ad.getStore().getName() + (ad.getAdType() == AdType.BADGE ? " 광고 배지" : " 배너 광고"))
                .buyerName(owner.getName() == null || owner.getName().isBlank() ? "고객" : owner.getName())
                .buyerEmail(owner.getEmail()).buyerTel("").storeId(portoneStoreId).build();
    }

    public List<String> requestOwnerCancellation(Long adId, Long ownerId) {
        Advertisement ad = lockAd(adId);
        requireOwner(ad, ownerId);
        if (!List.of(AdStatus.PENDING_PAYMENT, AdStatus.PAYMENT_FAILED, AdStatus.ACTIVE,
                AdStatus.CANCELLED, AdStatus.REFUND_PENDING, AdStatus.REFUNDED, AdStatus.REVIEW_REQUIRED).contains(ad.getStatus())) {
            throw conflict("취소할 수 없는 광고 상태입니다.");
        }
        current(ad);
        List<AdPaymentAttempt> all = attempts.findByAdIdOrderByIdAsc(adId);
        // 이미 과거에 숨김/취소한 광고의 PAID도 요청 이력 안에 포함시킨다. 금액은 원장에 고정돼 있다.
        all.forEach(value -> value.requestCancel(ownerId));
        if (ad.getStatus() != AdStatus.REFUNDED) ad.setStatus(AdStatus.CANCELLED);
        return all.stream().filter(value -> value.getState() != State.REFUNDED && value.getState() != State.FAILED)
                .map(AdPaymentAttempt::getMerchantUid).toList();
    }

    /** 관리자는 대사 중인 특정 시도의 전액 환불 의도만 등록한다. 결과 미상 건에는 두 번째 발신을 만들지 않는다. */
    public String requestReviewedRefund(Long attemptId, Long actorId) {
        Long adId = attempts.findAdIdByAttemptId(attemptId).orElseThrow(AdvertisementException::notFound);
        Advertisement ad = lockAd(adId);
        AdPaymentAttempt attempt = attempts.findByAdIdOrderByIdAsc(adId).stream()
                .filter(value -> value.getId().equals(attemptId)).findFirst().orElseThrow(AdvertisementException::notFound);
        if (attempt.getState() == State.REFUNDED) return attempt.getMerchantUid();
        if (attempt.getIssueCode() == null || !"PAID".equals(attempt.getPgStatus())) {
            throw conflict("PG PAID 상태와 대사 사유를 먼저 확인해주세요.");
        }
        attempt.requestCancel(actorId);
        if (ad.getMerchantUid().equals(attempt.getMerchantUid())) ad.setStatus(AdStatus.CANCELLED);
        return attempt.getMerchantUid();
    }

    public RefundCommand applyPayment(Claim claim, PortoneV2PaymentResponse pg) {
        Advertisement ad = lockByUid(claim.merchantUid());
        AdPaymentAttempt attempt = attempts.findForUpdate(claim.merchantUid()).orElseThrow();
        if (!attempt.ownsLease(claim.token())) return null;
        if (pg == null || !claim.merchantUid().equals(pg.getPaymentId()) || !"KRW".equals(pg.getCurrency())
                || pg.getAmount() != attempt.getAmount()) {
            attempt.requireReview("PAYMENT_ID_CURRENCY_AMOUNT_MISMATCH");
            if (ad.getMerchantUid().equals(attempt.getMerchantUid())) ad.setStatus(AdStatus.REVIEW_REQUIRED);
            attempt.release();
            return null;
        }
        String status = pg.getStatus();
        attempt.observed(status == null ? "UNKNOWN" : status, pg.getCancelledAmount(), LocalDateTime.now());
        boolean currentAttempt = ad.getMerchantUid().equals(attempt.getMerchantUid());
        if ("CANCELLED".equals(status) && Objects.equals(pg.getCancelledAmount(), attempt.getAmount().longValue())) {
            attempt.reviewed(State.REFUNDED, null);
            if (currentAttempt) ad.setStatus(AdStatus.REFUNDED);
        } else if ("PAID".equals(status) && Objects.equals(pg.getCancelledAmount(), 0L)) {
            if (attempt.getRefundConfirmedAt() != null || "REFUNDED".equals(attempt.getLegacyStatus())) {
                attempt.requireReview("PAID_AFTER_CONFIRMED_REFUND");
                if (currentAttempt) ad.setStatus(AdStatus.REVIEW_REQUIRED);
            } else if (pg.hasUnsettledCancellation()) {
                attempt.requireReview("PG_CANCELLATION_UNSETTLED");
                if (currentAttempt) ad.setStatus(AdStatus.REFUND_PENDING);
            } else if (attempt.isCancelRequested()) {
                if (currentAttempt) ad.setStatus(AdStatus.REFUND_PENDING);
                if (attempt.dispatchRefund(LocalDateTime.now())) {
                    return new RefundCommand(attempt.getMerchantUid(), claim.token(), attempt.getAmount(), attempt.getRefundKey());
                }
                // PAID 상태만으로 비동기 환불 실패를 판정하지 않는다. 재발신 없이 계속 대사한다.
                attempt.requireReview("REFUND_OUTCOME_PENDING");
            } else if (!currentAttempt || ad.isDeleted() || ad.getStore().isDeleted() || ad.getStore().isSuspended()
                    || (!List.of(AdStatus.PENDING_PAYMENT, AdStatus.ACTIVE, AdStatus.EXPIRED, AdStatus.SUSPENDED).contains(ad.getStatus()))
                    || (ad.getStatus() == AdStatus.PENDING_PAYMENT && ad.getStartDate().isBefore(ServiceTime.today()))) {
                attempt.requireReview("PAID_WITHOUT_DELIVERABLE_AD");
                if (currentAttempt && ad.getStatus() != AdStatus.SUSPENDED) ad.setStatus(AdStatus.REVIEW_REQUIRED);
            } else {
                attempt.reviewed(State.PAID, null);
                if (ad.getStatus() == AdStatus.PENDING_PAYMENT) ad.setStatus(AdStatus.ACTIVE);
            }
        } else if ("FAILED".equals(status) && !attempt.isEverPaid() && attempt.getRefundDispatchedAt() == null) {
            attempt.reviewed(State.FAILED, null);
            if (currentAttempt) ad.setStatus(attempt.isCancelRequested() ? AdStatus.CANCELLED : AdStatus.PAYMENT_FAILED);
        } else if ("READY".equals(status) && !attempt.isEverPaid() && attempt.getRefundDispatchedAt() == null) {
            boolean stopped = attempt.isCancelRequested() || ad.getStatus() != AdStatus.PENDING_PAYMENT
                    || ad.isDeleted() || ad.getStore().isDeleted() || ad.getStore().isSuspended();
            attempt.reviewed(State.READY, stopped ? "CANCELLED_BUT_PAYMENT_UNDECIDED" : null);
        } else {
            attempt.requireReview("PG_STATE_OR_CANCELLED_AMOUNT_UNCERTAIN");
        }
        attempt.release();
        return null;
    }

    public void recordLookupFailure(Claim claim, boolean notFound) {
        lockByUid(claim.merchantUid());
        AdPaymentAttempt attempt = attempts.findForUpdate(claim.merchantUid()).orElseThrow();
        if (!attempt.ownsLease(claim.token())) return;
        attempt.observed(notFound ? "NOT_FOUND" : "UNAVAILABLE", null, LocalDateTime.now());
        attempt.requireReview(notFound ? "PG_NOT_FOUND_NOT_TERMINAL" : "PG_LOOKUP_FAILED");
        attempt.release();
    }

    public void applyRefund(RefundCommand command, PortoneV2CancelResponse result) {
        Advertisement ad = lockByUid(command.merchantUid());
        AdPaymentAttempt attempt = attempts.findForUpdate(command.merchantUid()).orElseThrow();
        if (!attempt.ownsLease(command.token())) return;
        if (result != null) attempt.cancellationObserved(result.cancellationId());
        // 개별 취소 응답만으로 전체 상태를 단정하지 않는다. 총 취소액까지 GET으로 다시 대사한다.
        String outcome = result == null ? "UNKNOWN" : result.resolveStatus().name();
        attempt.requireReview("REFUND_" + outcome + "_RECHECK_REQUIRED");
        if (ad.getMerchantUid().equals(attempt.getMerchantUid())) ad.setStatus(AdStatus.REFUND_PENDING);
        attempt.release();
    }

    @Transactional(readOnly = true)
    public AdvertisementResponse verifiedResult(String uid, Long ownerId) {
        AdPaymentAttempt attempt = attempts.findByMerchantUid(uid).orElseThrow(AdvertisementException::notFound);
        Advertisement ad = ads.findById(attempt.getAdId()).orElseThrow(AdvertisementException::notFound);
        requireOwner(ad, ownerId);
        if (attempt.getState() != State.PAID || !uid.equals(ad.getMerchantUid())
                || (ad.getStatus() != AdStatus.ACTIVE && ad.getStatus() != AdStatus.EXPIRED)) {
            throw conflict("결제 결과 확인이 필요합니다. 이미 결제했다면 다시 결제하지 말고 광고 내역을 확인해주세요.");
        }
        return AdvertisementResponse.fromEntity(ad);
    }

    public void expire(Long adId) {
        Advertisement ad = lockAd(adId);
        if (ad.getStatus() == AdStatus.ACTIVE && ad.getEndDate().isBefore(ServiceTime.today())) {
            ad.setStatus(AdStatus.EXPIRED);
        } else if ((ad.getStatus() == AdStatus.PENDING_PAYMENT || ad.getStatus() == AdStatus.PAYMENT_FAILED)
                && ad.getStartDate().isBefore(ServiceTime.today())) {
            current(ad).requireReview("EXPIRED_PAYMENT_RECHECK_REQUIRED");
            ad.setStatus(AdStatus.CANCELLED);
        }
    }

    private AdvertisementException conflict(String message) {
        return new AdvertisementException(message, HttpStatus.CONFLICT);
    }
}
