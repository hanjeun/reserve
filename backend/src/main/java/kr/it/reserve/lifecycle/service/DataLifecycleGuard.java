package kr.it.reserve.lifecycle.service;

import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.dto.MemberWithdrawalReadiness;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 폐업·탈퇴가 지나야 하는 단일 관문.
 * 호출부마다 상태 집합을 복사하지 않고 이 서비스가 예약·광고·환불·대사·웹훅을 함께 본다.
 */
@Service
@RequiredArgsConstructor
public class DataLifecycleGuard {

    private static final List<AdStatus> CLOSURE_BLOCKING_AD_STATUSES = List.of(
            AdStatus.PENDING_PAYMENT,
            AdStatus.PAYMENT_FAILED,
            AdStatus.ACTIVE);

    private final StoreRepository storeRepository;
    private final ReservationRepository reservationRepository;
    private final AdvertisementRepository advertisementRepository;
    private final RefundAttemptRepository refundAttemptRepository;
    private final PaymentReconciliationIssueRepository issueRepository;
    private final PaymentWebhookInboxRepository webhookInboxRepository;

    @Transactional(readOnly = true)
    public StoreClosureReadiness inspectStore(Long storeId) {
        return new StoreClosureReadiness(
                reservationRepository.countLifecycleBlockingByStoreId(storeId),
                advertisementRepository.countByStoreIdAndStatusInAndDeletedAtIsNull(
                        storeId, CLOSURE_BLOCKING_AD_STATUSES),
                refundAttemptRepository.countUnresolvedByStoreId(storeId, RefundAttempt.UNRESOLVED),
                issueRepository.countOpenByStoreId(
                        storeId, PaymentReconciliationIssue.IssueStatus.OPEN),
                webhookInboxRepository.countUnfinishedByStoreId(
                        storeId, PaymentWebhookInbox.UNFINISHED));
    }

    @Transactional(readOnly = true)
    public MemberWithdrawalReadiness inspectMember(Long memberId) {
        return new MemberWithdrawalReadiness(
                storeRepository.countByOwnerIdAndDeletedAtIsNull(memberId),
                reservationRepository.countLifecycleBlockingByMemberId(memberId),
                refundAttemptRepository.countUnresolvedByMemberId(memberId, RefundAttempt.UNRESOLVED),
                issueRepository.countOpenByMemberId(
                        memberId, PaymentReconciliationIssue.IssueStatus.OPEN),
                webhookInboxRepository.countUnfinishedByMemberId(
                        memberId, PaymentWebhookInbox.UNFINISHED));
    }

    public void requireStoreClosureAllowed(Long storeId) {
        StoreClosureReadiness readiness = inspectStore(storeId);
        if (!readiness.canClose()) {
            throw new StoreException(
                    "가게 영업을 종료하기 전에 미결 항목을 처리해주세요. " +
                    "예약 " + readiness.unresolvedReservations() + "건, 광고 " + readiness.activeAdvertisements() +
                    "건, 환불 " + readiness.unresolvedRefunds() + "건, 결제 확인 " +
                    readiness.openPaymentIssues() + "건, 웹훅 " + readiness.unfinishedWebhooks() + "건",
                    HttpStatus.CONFLICT);
        }
    }

    public void requireMemberWithdrawalAllowed(Long memberId) {
        MemberWithdrawalReadiness readiness = inspectMember(memberId);
        if (!readiness.canWithdraw()) {
            throw new MemberException(
                    "회원 탈퇴 전에 미결 항목을 처리해주세요. " +
                    "운영 중 가게 " + readiness.openStores() + "곳, 예약 " +
                    readiness.unresolvedReservations() + "건, 환불 " + readiness.unresolvedRefunds() +
                    "건, 결제 확인 " + readiness.openPaymentIssues() + "건, 웹훅 " +
                    readiness.unfinishedWebhooks() + "건",
                    HttpStatus.CONFLICT);
        }
    }
}
