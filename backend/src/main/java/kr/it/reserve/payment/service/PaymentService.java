package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.config.updates.EntityUpdates;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.entity.PaymentReconciliationIssue;
import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationUpdates;
import kr.it.reserve.store.entity.Store;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class PaymentService {
    @Autowired(required = false)
    private ReservationUpdates reservationUpdates;

    private static final String PG_READY_STATUS = "READY";
    private static final String EXPIRY_CHECK_SOURCE = "EXPIRY";
    private static final String STALE_READY_CHECK_SOURCE = "STALE_READY";

    private final PaymentRepository paymentRepository;
    private final ReservationRepository reservationRepository;
    private final MemberRepository memberRepository;
    private final PortoneService portoneService;
    private final RefundLedgerService refundLedgerService;
    private final RefundAttemptRepository refundAttemptRepository;
    private final PaymentReconciliationIssueService reconciliationIssueService;
    private final PlatformTransactionManager transactionManager;
    private final EntityManager entityManager;

    private <T> T inTransaction(Supplier<T> operation) {
        return new TransactionTemplate(transactionManager).execute(ignored -> operation.get());
    }

    private <T> T readTransaction(Supplier<T> operation) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setReadOnly(true);
        return transaction.execute(ignored -> operation.get());
    }

    private Reservation lockFinancialReservation(Long reservationId) {
        return new FinancialReservationLocks(memberRepository, reservationRepository, entityManager).lock(reservationId, null).reservation();
    }

    /** scalar 주소 조회 뒤 회원 → 예약 → 결제를 잠근다. 잠금 전에 결제 엔티티를 로드하지 않는다. */
    private Optional<Payment> lockPayment(Long paymentId) {
        Long reservationId = paymentRepository.findReservationIdByPaymentId(paymentId).orElse(null);
        if (reservationId == null) return Optional.empty();
        lockFinancialReservation(reservationId);
        return paymentRepository.findByIdForUpdate(paymentId).map(this::refreshLockedPayment);
    }

    private Optional<Payment> lockPayment(String merchantUid) {
        Long reservationId = paymentRepository.findReservationIdByMerchantUid(merchantUid).orElse(null);
        if (reservationId == null) return Optional.empty();
        lockFinancialReservation(reservationId);
        return paymentRepository.findByMerchantUidForUpdate(merchantUid).map(this::refreshLockedPayment);
    }

    private Payment refreshLockedPayment(Payment payment) {
        entityManager.flush();
        entityManager.refresh(payment, LockModeType.PESSIMISTIC_WRITE);
        return payment;
    }

    private List<Payment> lockPaymentRows(Long reservationId) {
        List<Payment> payments = paymentRepository.findAllByReservationIdForUpdate(reservationId);
        entityManager.flush();
        for (Payment payment : payments) entityManager.refresh(payment, LockModeType.PESSIMISTIC_WRITE);
        return payments;
    }

    public PaymentPrepareDto preparePayment(PaymentRequestDto requestDto, Long memberId) {
        return new PaymentPreparation(paymentRepository, reservationRepository, memberRepository, portoneService, entityManager).preparePayment(requestDto, memberId);
    }

    /** 사용자 요청은 소유권을 먼저 확인한다. requesterId가 없는 내부 모바일 복귀도 상태 검사는 공유한다. */
    @Transactional(readOnly = true)
    public VerificationSnapshot prepareVerification(String merchantUid, Long requesterId) {
        Payment payment = paymentRepository.findByMerchantUid(merchantUid)
                .orElseThrow(PaymentException::notFound);

        if (requesterId != null && (payment.getMember() == null || !payment.getMember().getId().equals(requesterId))) {
            log.warn("Payment verify denied - not owner: merchantUid={}, requesterId={}",
                    merchantUid, requesterId);
            throw new PaymentException("본인의 결제만 검증할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        // 완료된 결제 검증은 같은 결과를 반환하고, 재실행할 수 없는 상태는 거부한다.
        if (payment.getStatus() == Payment.PaymentStatus.PAID) {
            log.info("Payment already verified, returning existing result: {}", payment.getMerchantUid());
            return new VerificationSnapshot(payment.getMerchantUid(), PaymentResponseDto.fromEntity(payment));
        }
        if (payment.getStatus() != Payment.PaymentStatus.READY) {
            throw new PaymentException("검증할 수 있는 결제 상태가 아니에요.", HttpStatus.BAD_REQUEST);
        }

        return new VerificationSnapshot(payment.getMerchantUid(), null);
    }

    public record VerificationSnapshot(String merchantUid, PaymentResponseDto completed) { }

    /**
     * 브라우저가 돌아오지 않아도 웹훅이 확인한 PAID 상태를 복구한다.
     * 결제 행을 잠근 뒤 상태를 다시 보므로 브라우저 검증과 동시에 와도 한 번만 완료된다.
     */
    public PaidRecoveryResult recoverPaidPaymentFromPg(
            String merchantUid,
            PortoneV2PaymentResponse portonePayment) {
        Payment payment = lockPayment(merchantUid).orElse(null);
        if (payment == null) {
            return PaidRecoveryResult.UNKNOWN_PAYMENT;
        }

        if (!portonePayment.isPaid()) {
            return PaidRecoveryResult.NOT_PAID;
        }

        if (payment.getStatus() == Payment.PaymentStatus.PAID) {
            ensureReservationPaidState(payment);
            return PaidRecoveryResult.ALREADY_PAID;
        }

        if (payment.getStatus() != Payment.PaymentStatus.READY) {
            recordIssue(
                    "PAID",
                    PaymentReconciliationIssue.IssueType.PAID_STATE_CONFLICT,
                    payment,
                    payment.getStatus().name());
            throw new PaymentException(
                    "결제 완료 상태를 자동 반영할 수 없어요. 관리자 확인이 필요해요.",
                    HttpStatus.CONFLICT);
        }

        completeLockedReadyPayment(payment, portonePayment, null);
        return PaidRecoveryResult.RECOVERED;
    }

    /** 만료 스냅샷 조회·PG 관측·잠금 반영을 구분한다. 예약 만료 처리기는 반영을 취소 TX에 합친다. */
    @Transactional(propagation = Propagation.NEVER)
    public ExpiryPaymentDecision reconcileBeforeReservationExpiry(Long reservationId) {
        ExpiryPaymentObservation observation = observeBeforeReservationExpiry(reservationId);
        return inTransaction(() -> applyExpiryPaymentObservation(reservationId, observation));
    }

    @Transactional(propagation = Propagation.NEVER)
    public ExpiryPaymentObservation observeBeforeReservationExpiry(Long reservationId) {
        PaymentLookup snapshot = readTransaction(() -> paymentRepository
                .findReadyByReservationId(reservationId).stream().findFirst()
                .map(payment -> new PaymentLookup(payment.getId(), payment.getMerchantUid(), true))
                .orElse(null));
        if (snapshot == null) return new ExpiryPaymentObservation(null, null, null, null);
        try {
            return new ExpiryPaymentObservation(snapshot.paymentId(), snapshot.merchantUid(),
                    portoneService.getPaymentInfo(snapshot.merchantUid()), null);
        } catch (RuntimeException e) {
            return new ExpiryPaymentObservation(snapshot.paymentId(), snapshot.merchantUid(), null,
                    e.getClass().getSimpleName());
        }
    }

    /** 직접 호출도 회원 ID 오름차순 → 예약 → 결제를 잠그고, 판정과 취소를 같은 TX에 둔다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public ExpiryPaymentDecision applyExpiryPaymentObservation(
            Long reservationId, ExpiryPaymentObservation observation) {
        Reservation reservation = lockFinancialReservation(reservationId);
        return applyLockedExpiryPaymentObservation(reservation, observation);
    }

    /** 만료 처리기가 이미 얻은 최신 예약을 재사용한다. cascade REFRESH로 새 결제를 옛 RR snapshot에서 다시 읽지 않는다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public ExpiryPaymentDecision applyLockedExpiryPaymentObservation(
            Reservation reservation, ExpiryPaymentObservation observation) {
        if (reservation == null || !entityManager.contains(reservation)
                || entityManager.getLockMode(reservation) != LockModeType.PESSIMISTIC_WRITE) {
            throw new IllegalStateException("Reservation expiry requires the financial reservation lock");
        }
        Long reservationId = reservation.getId();
        List<Payment> payments = lockPaymentRows(reservationId);
        Payment paid = payments.stream()
                .filter(payment -> payment.getStatus() == Payment.PaymentStatus.PAID)
                .findFirst().orElse(null);
        if (paid != null) {
            ensureReservationPaidState(paid);
            resolveIssues(paid);
            return ExpiryPaymentDecision.PAID_RECOVERED;
        }
        Payment payment = payments.stream()
                .filter(candidate -> candidate.getStatus() == Payment.PaymentStatus.READY)
                .findFirst().orElse(null);
        if (payment == null && payments.isEmpty()) return ExpiryPaymentDecision.NO_PAYMENT;
        if (payment == null) {
            Payment latest = payments.getFirst();
            if (latest.getStatus() == Payment.PaymentStatus.FAILED
                    || latest.getStatus() == Payment.PaymentStatus.CANCELLED) {
                resolveIssues(latest);
                return ExpiryPaymentDecision.NOT_PAID;
            }
            recordIssue(EXPIRY_CHECK_SOURCE, PaymentReconciliationIssue.IssueType.LOCAL_STATUS_UNCERTAIN,
                    latest, latest.getStatus().name());
            return ExpiryPaymentDecision.UNCERTAIN;
        }
        if (!Objects.equals(payment.getId(), observation.paymentId())
                || !Objects.equals(payment.getMerchantUid(), observation.merchantUid())) {
            // 관측 중 새 결제창이 준비됐으면 옛 PG 결과로 그 결제를 닫지 않는다.
            return ExpiryPaymentDecision.UNCERTAIN;
        }
        if (observation.errorCode() != null || observation.payment() == null) {
            recordIssue(EXPIRY_CHECK_SOURCE, PaymentReconciliationIssue.IssueType.EXPIRY_RECHECK_FAILED,
                    payment, observation.errorCode() == null ? "EMPTY_PG_RESPONSE" : observation.errorCode());
            log.warn("Payment expiry recheck deferred: paymentId={}", payment.getId());
            return ExpiryPaymentDecision.UNCERTAIN;
        }
        PortoneV2PaymentResponse pgPayment = observation.payment();
        if (pgPayment.isPaid()) {
            completeLockedReadyPayment(payment, pgPayment, null);
            return ExpiryPaymentDecision.PAID_RECOVERED;
        }
        String pgStatus = pgPayment.getStatus();
        if (PG_READY_STATUS.equals(pgStatus) || "FAILED".equals(pgStatus) || "CANCELLED".equals(pgStatus)) {
            payment.failPayment("Payment window expired before completion");
            resolveIssues(payment);
            return ExpiryPaymentDecision.NOT_PAID;
        }
        recordIssue(EXPIRY_CHECK_SOURCE, PaymentReconciliationIssue.IssueType.EXPIRY_STATUS_UNCERTAIN,
                payment, pgStatus == null ? "NULL" : pgStatus);
        return ExpiryPaymentDecision.UNCERTAIN;
    }

    public record ExpiryPaymentObservation(Long paymentId, String merchantUid,
                                           PortoneV2PaymentResponse payment, String errorCode) { }
    private record PaymentLookup(Long paymentId, String merchantUid, boolean ready) { }

    /** 관리자 대사는 PG 관측 뒤 결제를 새로 잠그고 상태·예약 종료 여부를 다시 확인한다. */
    @Transactional(propagation = Propagation.NEVER)
    public StaleReadyReconciliationResponse reconcileStaleReadyPayment(Long paymentId) {
        PaymentLookup snapshot = readTransaction(() -> {
            Payment payment = paymentRepository.findById(paymentId).orElseThrow(PaymentException::notFound);
            return new PaymentLookup(payment.getId(), payment.getMerchantUid(),
                    payment.getStatus() == Payment.PaymentStatus.READY);
        });
        if (!snapshot.ready()) return inTransaction(() -> applyStaleReadyObservation(paymentId, snapshot, null, null));

        PortoneV2PaymentResponse pgPayment = null;
        RuntimeException failure = null;
        try {
            pgPayment = portoneService.getPaymentInfo(snapshot.merchantUid());
        } catch (RuntimeException e) {
            failure = e;
        }
        PortoneV2PaymentResponse observedPayment = pgPayment;
        RuntimeException observedFailure = failure;
        return inTransaction(() -> applyStaleReadyObservation(
                paymentId, snapshot, observedPayment, observedFailure));
    }

    private StaleReadyReconciliationResponse applyStaleReadyObservation(Long paymentId, PaymentLookup snapshot,
            PortoneV2PaymentResponse pgPayment, RuntimeException failure) {
        Payment payment = lockPayment(paymentId).orElseThrow(PaymentException::notFound);
        if (payment.getStatus() != Payment.PaymentStatus.READY) {
            resolveIssues(payment);
            return staleReadyResult(payment, null, StaleReadyReconciliationResponse.Outcome.ALREADY_RESOLVED);
        }
        if (!Objects.equals(snapshot.merchantUid(), payment.getMerchantUid())) {
            return staleReadyResult(payment, null, StaleReadyReconciliationResponse.Outcome.RETRY_REQUIRED);
        }
        if (failure instanceof PaymentException pe && pe.getStatus() == HttpStatus.NOT_FOUND
                && isPaymentClosedFor(payment.getReservation())) {
            payment.failPayment("Closed reservation has no payment at PG");
            resolveIssues(payment);
            return staleReadyResult(payment, "NOT_FOUND", StaleReadyReconciliationResponse.Outcome.CLOSED_AS_NOT_PAID);
        }
        if (failure != null || pgPayment == null) {
            String detail = failure instanceof PaymentException pe ? pe.getStatus().name()
                    : failure == null ? "EMPTY_PG_RESPONSE" : failure.getClass().getSimpleName();
            recordIssue(STALE_READY_CHECK_SOURCE, PaymentReconciliationIssue.IssueType.STALE_READY_RECHECK_FAILED,
                    payment, detail);
            return staleReadyResult(payment, null, StaleReadyReconciliationResponse.Outcome.RETRY_REQUIRED);
        }
        String pgStatus = pgPayment.getStatus();
        if (pgPayment.isPaid()) return reconcileStalePaidPayment(payment, pgPayment);
        if ("FAILED".equals(pgStatus) || "CANCELLED".equals(pgStatus)
                || (PG_READY_STATUS.equals(pgStatus) && isPaymentClosedFor(payment.getReservation()))) {
            payment.failPayment("Stale payment reconciled from PG status: " + pgStatus);
            resolveIssues(payment);
            return staleReadyResult(payment, pgStatus, StaleReadyReconciliationResponse.Outcome.CLOSED_AS_NOT_PAID);
        }
        if (PG_READY_STATUS.equals(pgStatus)) {
            recordIssue(STALE_READY_CHECK_SOURCE, PaymentReconciliationIssue.IssueType.STALE_READY_STILL_PENDING,
                    payment, pgStatus);
            return staleReadyResult(payment, pgStatus, StaleReadyReconciliationResponse.Outcome.STILL_PENDING);
        }
        recordIssue(STALE_READY_CHECK_SOURCE, PaymentReconciliationIssue.IssueType.STALE_READY_STATUS_UNCERTAIN,
                payment, pgStatus == null ? "NULL" : pgStatus);
        return staleReadyResult(payment, pgStatus, StaleReadyReconciliationResponse.Outcome.MANUAL_REVIEW_REQUIRED);
    }

    private StaleReadyReconciliationResponse reconcileStalePaidPayment(
            Payment payment, PortoneV2PaymentResponse pgPayment) {
        String pgStatus = pgPayment.getStatus();
        if (isPaymentClosedFor(payment.getReservation())) {
            recordIssue(
                    STALE_READY_CHECK_SOURCE,
                    PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                    payment,
                    payment.getReservation().getStatus().name());
            return staleReadyResult(
                    payment,
                    pgStatus,
                    StaleReadyReconciliationResponse.Outcome.MANUAL_REVIEW_REQUIRED);
        }
        if (pgPayment.getAmount() != payment.getAmount()) {
            recordIssue(
                    STALE_READY_CHECK_SOURCE,
                    PaymentReconciliationIssue.IssueType.PAID_AMOUNT_MISMATCH,
                    payment,
                    "EXPECTED_" + payment.getAmount() + "_ACTUAL_" + pgPayment.getAmount());
            return staleReadyResult(
                    payment,
                    pgStatus,
                    StaleReadyReconciliationResponse.Outcome.MANUAL_REVIEW_REQUIRED);
        }

        completeLockedReadyPayment(payment, pgPayment, null);
        return staleReadyResult(
                payment,
                pgStatus,
                StaleReadyReconciliationResponse.Outcome.PAID_RECOVERED);
    }

    private StaleReadyReconciliationResponse staleReadyResult(
            Payment payment,
            String pgStatus,
            StaleReadyReconciliationResponse.Outcome outcome) {
        return new StaleReadyReconciliationResponse(
                payment.getId(),
                payment.getMerchantUid(),
                payment.getStatus().name(),
                pgStatus,
                outcome);
    }

    public PaymentResponseDto completeReadyPaymentFromPg(
            String merchantUid,
            PortoneV2PaymentResponse portonePayment,
            String fallbackImpUid) {
        Payment lockedPayment = lockPayment(merchantUid)
                .orElseThrow(PaymentException::notFound);

        if (lockedPayment.getStatus() == Payment.PaymentStatus.PAID) {
            ensureReservationPaidState(lockedPayment);
            return PaymentResponseDto.fromEntity(lockedPayment);
        }
        if (lockedPayment.getStatus() != Payment.PaymentStatus.READY) {
            throw new PaymentException("검증할 수 있는 결제 상태가 아니에요.", HttpStatus.BAD_REQUEST);
        }

        completeLockedReadyPayment(lockedPayment, portonePayment, fallbackImpUid);
        return PaymentResponseDto.fromEntity(lockedPayment);
    }

    private void completeLockedReadyPayment(
            Payment payment,
            PortoneV2PaymentResponse portonePayment,
            String fallbackImpUid) {
        if (isPaymentClosedFor(payment.getReservation())) {
            recordIssue(
                    "PAID",
                    PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                    payment,
                    payment.getReservation().getStatus().name());
            throw new PaymentException(
                    "취소되거나 종료된 예약의 결제가 확인됐어요. 관리자 확인이 필요해요.",
                    HttpStatus.CONFLICT);
        }

        if (portonePayment.getAmount() != payment.getAmount()) {
            recordIssue(
                    "PAID",
                    PaymentReconciliationIssue.IssueType.PAID_AMOUNT_MISMATCH,
                    payment,
                    "EXPECTED_" + payment.getAmount() + "_ACTUAL_" + portonePayment.getAmount());
            payment.failPayment("결제 금액 불일치");
            throw new PaymentException("결제 금액이 일치하지 않아요.", HttpStatus.BAD_REQUEST);
        }

        if (!portonePayment.isPaid()) {
            payment.failPayment("결제 상태 이상: " + portonePayment.getStatus());
            throw new PaymentException("결제가 완료되지 않았어요.", HttpStatus.BAD_REQUEST);
        }

        // V2에서 pgTxId = imp_uid에 해당하는 PG사 거래번호
        String pgTxId = portonePayment.getPgTxId() != null ? portonePayment.getPgTxId() : fallbackImpUid;
        payment.completePayment(pgTxId, portonePayment.getPayMethod(), portonePayment.getPgProvider());

        ensureReservationPaidState(payment);
        resolveIssues(payment);
        log.info("Payment verified: {}", payment.getMerchantUid());
    }

    private void ensureReservationPaidState(Payment payment) {
        Reservation reservation = payment.getReservation();
        if (isPaymentClosedFor(reservation)) {
            recordIssue(
                    "PAID",
                    PaymentReconciliationIssue.IssueType.LATE_PAID_RESERVATION,
                    payment,
                    reservation.getStatus().name());
            throw new PaymentException(
                    "취소되거나 종료된 예약의 결제가 확인됐어요. 관리자 확인이 필요해요.",
                    HttpStatus.CONFLICT);
        }
        reservation.markDepositPaid(payment.getAmount());

        // 결제 완료 후 자동 승인 처리
        // autoApprovalEnabled=true인 가게는 결제가 완료된 시점에 CONFIRMED로 전환
        Store store = reservation.getStore();
        if (Boolean.TRUE.equals(store.getAutoApprovalEnabled())
                && reservation.getStatus() == Reservation.ReservationStatus.PENDING) {
            reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);
            log.info("Auto-approve processed: reservationId={}", reservation.getId());
        }
        if (reservationUpdates != null) reservationUpdates.changed(reservation, EntityUpdates.Operation.UPDATED);
    }

    /** 결제를 더 받을 수 없는 예약인지 — 대기·확정 상태만 결제를 받는다. */
    private boolean isPaymentClosedFor(Reservation reservation) { return PaymentReservationPolicy.closedFor(reservation); }

    private void recordIssue(
            String category,
            PaymentReconciliationIssue.IssueType issueType,
            Payment payment,
            String detailCode) {
        String identity = paymentIssueIdentity(payment);
        try {
            reconciliationIssueService.recordIssue(
                    category + ":" + identity,
                    issueType,
                    payment != null ? payment.getId() : null,
                    payment != null && payment.getReservation() != null
                            ? payment.getReservation().getId()
                            : null,
                    payment != null ? payment.getMerchantUid() : null,
                    detailCode);
        } catch (RuntimeException e) {
            log.error("Payment reconciliation issue could not be persisted: paymentId={}, issueType={}, errorType={}",
                    payment != null ? payment.getId() : null,
                    issueType,
                    e.getClass().getSimpleName());
        }
    }

    private String paymentIssueIdentity(Payment payment) {
        if (payment == null) {
            return "UNKNOWN";
        }
        return payment.getId() != null ? payment.getId().toString() : payment.getMerchantUid();
    }

    private void resolveIssues(Payment payment) {
        try {
            reconciliationIssueService.resolveForPayment(payment.getId());
        } catch (RuntimeException e) {
            log.error("Payment reconciliation issue could not be resolved: paymentId={}, errorType={}",
                    payment.getId(), e.getClass().getSimpleName());
        }
    }

    public enum PaidRecoveryResult {
        RECOVERED,
        ALREADY_PAID,
        NOT_PAID,
        UNKNOWN_PAYMENT
    }

    public enum ExpiryPaymentDecision {
        PAID_RECOVERED,
        NOT_PAID,
        NO_PAYMENT,
        UNCERTAIN
    }

    /** 내부 환불도 준비 커밋 → 단일 발신 → 잠금 반영을 거친다. 외부 요청은 소유권 관문을 쓴다. */
    @Transactional(propagation = Propagation.NEVER)
    public PaymentResponseDto refundPayment(PaymentRefundDto refundDto) {
        Long attemptId = inTransaction(() -> prepareRefund(refundDto));
        return dispatchPreparedRefund(attemptId);
    }

    /** 결제 잠금 아래 원장 의도와 pending 상태를 함께 저장한다. 이 트랜잭션에서는 PG를 호출하지 않는다. */
    private Long prepareRefund(PaymentRefundDto refundDto) {
        Payment payment;
        if (refundDto.getPaymentId() != null) {
            payment = lockPayment(refundDto.getPaymentId()).orElseThrow(PaymentException::notFound);
        } else {
            lockFinancialReservation(refundDto.getReservationId());
            payment = paymentRepository.findPaidByReservationIdForUpdate(refundDto.getReservationId()).map(this::refreshLockedPayment).orElseThrow(PaymentException::notFound);
        }
        if (payment.getStatus() == Payment.PaymentStatus.REFUND_PENDING
                || refundAttemptRepository.findByPaymentIdForUpdate(payment.getId()).stream().anyMatch(RefundAttempt::isUnresolved)) {
            throw new PaymentException("직전 환불 요청의 처리 결과를 확인하는 중이에요. 잠시 후 다시 시도해주세요.",
                    HttpStatus.CONFLICT);
        }
        if (payment.getStatus() != Payment.PaymentStatus.PAID) {
            throw new PaymentException("환불 가능한 결제 상태가 아니에요.", HttpStatus.BAD_REQUEST);
        }
        Integer refundAmount = resolveRefundAmount(payment, refundDto.getRefundAmount());
        Long attemptId = refundLedgerService.prepare(payment.getId(), payment.getMerchantUid(),
                refundAmount, refundDto.getRefundReason());
        if (attemptId == null) {
            throw new PaymentException("환불 요청을 안전하게 기록하지 못했어요. 잠시 후 다시 시도해주세요.",
                    HttpStatus.SERVICE_UNAVAILABLE);
        }
        payment.markRefundPending(refundDto.getRefundReason());
        return attemptId;
    }

    /** 미발신 표식을 선점·커밋한 호출자만 최초 취소 요청을 보낸다. 이미 발신한 작업은 재발신하지 않는다. */
    @Transactional(propagation = Propagation.NEVER)
    public PaymentResponseDto dispatchPreparedRefund(Long attemptId) {
        RefundDispatchClaim claim = inTransaction(() -> claimPreparedRefund(attemptId));
        if (claim.command() == null) return claim.current();
        RefundCommand command = claim.command();
        PortoneV2CancelResponse response = null;
        RuntimeException failure = null;
        try {
            response = portoneService.cancelPayment(command.merchantUid(), command.amount(), command.reason(),
                    "reserve-refund-attempt-" + command.attemptId(), command.paidAmount() - command.priorRefundedAmount());
        } catch (RuntimeException e) {
            failure = e;
        }
        PortoneV2CancelResponse observedResponse = response;
        RuntimeException observedFailure = failure;
        RefundCompletion completion = inTransaction(() -> finishDispatchedRefund(command, observedResponse, observedFailure));
        if (completion.rejected()) {
            throw new PaymentException("환불이 거절됐어요. 고객센터로 문의해주세요.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
        return completion.payment();
    }

    private RefundDispatchClaim claimPreparedRefund(Long attemptId) {
        Long paymentId = refundAttemptRepository.findPaymentId(attemptId).orElseThrow(PaymentException::notFound);
        Payment payment = lockPayment(paymentId).orElseThrow(PaymentException::notFound);
        RefundAttempt attempt = refundAttemptRepository.findByIdForUpdate(attemptId).orElseThrow(PaymentException::notFound);
        if (!attempt.isReadyToDispatch()) {
            return new RefundDispatchClaim(null, PaymentResponseDto.fromEntity(payment));
        }
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING
                || !matchesRefundAttempt(payment, attempt)
                || !hasSingleUnresolvedRefund(paymentId)) {
            recordIssue("REFUND", PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                    payment, "PREPARED_REFUND_STATE_CONFLICT");
            return new RefundDispatchClaim(null, PaymentResponseDto.fromEntity(payment));
        }
        attempt.markDispatchStarted();
        return new RefundDispatchClaim(new RefundCommand(attemptId, paymentId, payment.getMerchantUid(),
                payment.getAmount(), payment.refundedSoFar(), attempt.getRequestedAmount(), attempt.getReason()), null);
    }

    private boolean hasSingleUnresolvedRefund(Long paymentId) {
        return refundAttemptRepository.findByPaymentIdForUpdate(paymentId).stream()
                .filter(RefundAttempt::isUnresolved).count() == 1;
    }

    private boolean matchesRefundAttempt(Payment payment, RefundAttempt attempt) {
        return Objects.equals(attempt.getPaymentId(), payment.getId())
                && Objects.equals(attempt.getMerchantUid(), payment.getMerchantUid())
                && attempt.getRequestedAmount() != null && attempt.getRequestedAmount() > 0
                && attempt.getRequestedAmount() <= payment.remainingRefundable();
    }

    private RefundCompletion finishDispatchedRefund(RefundCommand command,
            PortoneV2CancelResponse response, RuntimeException failure) {
        Payment payment = lockPayment(command.paymentId()).orElseThrow(PaymentException::notFound);
        RefundAttempt attempt = refundAttemptRepository.findByIdForUpdate(command.attemptId()).orElseThrow(PaymentException::notFound);
        if (!attempt.isUnresolved()) {
            // 웹훅·재조회가 먼저 확정한 결말을 늦게 온 초기 응답으로 덮지 않는다.
            return new RefundCompletion(PaymentResponseDto.fromEntity(payment), false);
        }
        if (payment.getStatus() != Payment.PaymentStatus.REFUND_PENDING
                || payment.refundedSoFar() != command.priorRefundedAmount()
                || !Objects.equals(payment.getAmount(), command.paidAmount())
                || !Objects.equals(payment.getMerchantUid(), command.merchantUid())
                || !Objects.equals(attempt.getRequestedAmount(), command.amount())
                || !matchesRefundAttempt(payment, attempt)
                || !hasSingleUnresolvedRefund(payment.getId())) {
            recordIssue("REFUND", PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                    payment, "LOCAL_PAYMENT_CHANGED_BEFORE_REFUND_RESPONSE");
            return new RefundCompletion(PaymentResponseDto.fromEntity(payment), false);
        }
        String cancellationId = response == null ? null : response.cancellationId();
        if (failure != null) {
            attempt.markPending(cancellationId, "PG cancellation call outcome unknown: " + failure.getClass().getSimpleName());
            recordIssue("REFUND", PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                    payment, "PG_CANCEL_CALL_OUTCOME_UNKNOWN");
            log.error("Refund call outcome unknown - automatic resend blocked: paymentId={}, errorType={}",
                    payment.getId(), failure.getClass().getSimpleName());
            return new RefundCompletion(PaymentResponseDto.fromEntity(payment), false);
        }
        PortoneV2CancelResponse.Status status = response == null
                ? PortoneV2CancelResponse.Status.UNKNOWN : response.resolveStatus();
        Integer cancelledAmount = response == null ? null : response.cancelledAmount();
        switch (status) {
            case SUCCEEDED -> {
                if (!command.amount().equals(cancelledAmount)) {
                    attempt.markPending(cancellationId, "PG succeeded amount does not match request");
                    recordIssue("REFUND", PaymentReconciliationIssue.IssueType.REFUND_STATE_UNCERTAIN,
                            payment, "PG_CANCEL_RESPONSE_AMOUNT_MISMATCH");
                } else {
                    // 결제·예약금·원장 결말을 같은 커밋에 반영한다. 실패하면 선행 pending이 남는다.
                    applyRefundSucceeded(payment, cancelledAmount, command.reason());
                    attempt.markSucceeded(cancellationId, cancelledAmount);
                    resolveIssues(payment);
                }
            }
            case REQUESTED, UNKNOWN -> attempt.markPending(cancellationId, "PG cancellation not final: " + status);
            case FAILED -> {
                payment.revertRefundPending("PG cancellation explicitly failed");
                attempt.markFailed(cancellationId, response.failureReason());
                return new RefundCompletion(PaymentResponseDto.fromEntity(payment), true);
            }
        }
        return new RefundCompletion(PaymentResponseDto.fromEntity(payment), false);
    }

    private record RefundCommand(Long attemptId, Long paymentId, String merchantUid, Integer paidAmount,
                                 int priorRefundedAmount, Integer amount, String reason) { }
    private record RefundDispatchClaim(RefundCommand command, PaymentResponseDto current) { }
    private record RefundCompletion(PaymentResponseDto payment, boolean rejected) { }

    private Integer resolveRefundAmount(Payment payment, Integer requestedAmount) {
        Integer refundAmount = requestedAmount != null ? requestedAmount : payment.getAmount();

        // 환불액은 결제액을 넘을 수 없다.
        if (refundAmount == null || refundAmount <= 0) {
            throw new PaymentException("환불 금액이 올바르지 않아요.", HttpStatus.BAD_REQUEST);
        }
        // 부분 환불을 포함한 남은 환불 가능액을 기준으로 상한을 확인한다.
        if (refundAmount > payment.remainingRefundable()) {
            log.warn("Refund amount exceeds refundable balance: paymentId={}, requested={}, paid={}, alreadyRefunded={}",
                    payment.getId(), refundAmount, payment.getAmount(), payment.refundedSoFar());
            throw new PaymentException("환불 금액이 남은 환불 가능 금액을 초과해요.", HttpStatus.BAD_REQUEST);
        }

        return refundAmount;
    }

    /**
     * 환불이 <b>확정</b>됐을 때만 실행되는 뒷정리. 웹훅·스케줄러도 같은 결말에 도달하면 여기를 부른다 —
     * 확정 처리를 세 곳에 복붙하면 반드시 어긋난다(설계 원칙: 관문 하나).
     */
    void applyRefundSucceeded(Payment payment, Integer refundAmount, String reason) {
        applyRefundSucceeded(payment, refundAmount, reason, true);
    }

    private void applyRefundSucceeded(
            Payment payment, Integer refundAmount, String reason, boolean updateReservationDeposit) {
        payment.refundPayment(refundAmount, reason);

        if (updateReservationDeposit && payment.getStatus() == Payment.PaymentStatus.REFUNDED) {
            Reservation reservation = payment.getReservation();
            reservation.setDepositPaid(false);
            reservation.setDepositAmount(0);
        }
        if (reservationUpdates != null) reservationUpdates.changed(payment.getReservation(), EntityUpdates.Operation.UPDATED);
        log.info("Refund confirmed: paymentId={}, merchantUid={}, amount={}, totalRefunded={}, status={}",
                payment.getId(), payment.getMerchantUid(), refundAmount,
                payment.refundedSoFar(), payment.getStatus());
    }

    /** PG 정책이 확인한 같은 시도만 결제·예약금·원장과 함께 확정한다. */
    @Transactional
    public boolean confirmPendingRefund(UnresolvedRefundView view, int expectedRefundedAmount,
                                         Integer refundAmount, String cancellationId) {
        return confirmRefundSettlement(view, expectedRefundedAmount, refundAmount, cancellationId, false);
    }

    /** 이전 로컬 커밋 유실로 PAID에 남은 종료 예약도 정확한 취소 ID가 묶인 원장으로만 복구한다. */
    @Transactional
    public boolean confirmLedgerBackedRefund(UnresolvedRefundView view, int expectedRefundedAmount,
                                             int refundAmount, String cancellationId) {
        return confirmRefundSettlement(view, expectedRefundedAmount, refundAmount, cancellationId, true);
    }

    private boolean confirmRefundSettlement(UnresolvedRefundView view, int expectedRefundedAmount,
                                              Integer refundAmount, String cancellationId, boolean allowPaidRecovery) {
        Payment payment = lockPayment(view.paymentId()).orElse(null);
        if (payment == null || refundAmount == null || refundAmount <= 0 || expectedRefundedAmount < 0
                || payment.getAmount() == null) return false;
        long expectedTotal = (long) expectedRefundedAmount + refundAmount;
        if (expectedTotal > payment.getAmount() || expectedTotal > Integer.MAX_VALUE) return false;
        RefundAttempt attempt = refundAttemptRepository.findByIdForUpdate(view.attemptId()).orElse(null);
        if (!matchesSettlementIdentity(payment, attempt, view, refundAmount, cancellationId)) return false;
        Payment.PaymentStatus finalStatus = expectedTotal == payment.getAmount()
                ? Payment.PaymentStatus.REFUNDED : Payment.PaymentStatus.PARTIAL_REFUNDED;
        boolean alreadyApplied = payment.getStatus() == finalStatus && payment.refundedSoFar() == expectedTotal;
        if (!attempt.isUnresolved()) {
            return attempt.getStatus() == RefundAttempt.Status.SUCCEEDED && alreadyApplied
                    && Objects.equals(attempt.getCancelledAmount(), refundAmount)
                    && Objects.equals(attempt.getCancellationId(), cancellationId);
        }
        if (attempt.isReadyToDispatch()
                || !hasSingleUnresolvedRefund(payment.getId())) return false;
        if (alreadyApplied) {
            // 과거 두 단계 커밋의 공백은 금액만으로 닫지 않고 저장한 개별 취소 ID와 PG의 일치도 요구한다.
            if (!hasRecordedCancellation(attempt, view, cancellationId)) return false;
        } else if (payment.getStatus() == Payment.PaymentStatus.REFUND_PENDING
                && payment.refundedSoFar() == expectedRefundedAmount) {
            applyRefundSucceeded(payment, refundAmount, attempt.getReason());
        } else if (allowPaidRecovery && payment.getStatus() == Payment.PaymentStatus.PAID
                && expectedRefundedAmount == 0 && payment.refundedSoFar() == 0
                && REFUND_RETRYABLE_RESERVATION_STATUSES.contains(payment.getReservation().getStatus())
                && hasRecordedCancellation(attempt, view, cancellationId)) {
            applyRefundSucceeded(payment, refundAmount, attempt.getReason());
        } else {
            return false;
        }
        attempt.markSucceeded(cancellationId, refundAmount);
        resolveIssues(payment);
        return true;
    }

    private boolean matchesSettlementIdentity(Payment payment, RefundAttempt attempt, UnresolvedRefundView view,
                                                Integer amount, String cancellationId) {
        return attempt != null
                && Objects.equals(attempt.getId(), view.attemptId())
                && Objects.equals(attempt.getPaymentId(), payment.getId())
                && Objects.equals(attempt.getMerchantUid(), payment.getMerchantUid())
                && Objects.equals(view.merchantUid(), payment.getMerchantUid())
                && Objects.equals(attempt.getRequestedAmount(), amount)
                && Objects.equals(view.requestedAmount(), amount)
                && (attempt.getCancellationId() == null || Objects.equals(attempt.getCancellationId(), cancellationId))
                && (view.cancellationId() == null || Objects.equals(view.cancellationId(), cancellationId));
    }

    private boolean hasRecordedCancellation(RefundAttempt attempt, UnresolvedRefundView view, String cancellationId) {
        return cancellationId != null && !cancellationId.isBlank()
                && Objects.equals(attempt.getCancellationId(), cancellationId)
                && Objects.equals(view.cancellationId(), cancellationId);
    }

    /** 최종 실패도 결제와 원장에 함께 반영해 두 커밋 사이의 공백을 만들지 않는다. */
    @Transactional
    public boolean revertPendingRefund(UnresolvedRefundView view, int expectedRefundedAmount,
                                        String cancellationId, String failReason) {
        Payment payment = lockPayment(view.paymentId()).orElse(null);
        if (payment == null || expectedRefundedAmount < 0 || payment.refundedSoFar() != expectedRefundedAmount) return false;
        RefundAttempt attempt = refundAttemptRepository.findByIdForUpdate(view.attemptId()).orElse(null);
        if (!matchesSettlementIdentity(payment, attempt, view, view.requestedAmount(), cancellationId)
                || !hasRecordedCancellation(attempt, view, cancellationId)) return false;
        Payment.PaymentStatus expectedStatus = expectedRefundedAmount > 0
                ? Payment.PaymentStatus.PARTIAL_REFUNDED : Payment.PaymentStatus.PAID;
        if (!attempt.isUnresolved()) {
            return attempt.getStatus() == RefundAttempt.Status.FAILED && payment.getStatus() == expectedStatus;
        }
        if (attempt.isReadyToDispatch()
                || !hasSingleUnresolvedRefund(payment.getId())) return false;
        if (payment.getStatus() == Payment.PaymentStatus.REFUND_PENDING) {
            payment.revertRefundPending(failReason);
        } else if (payment.getStatus() != expectedStatus) {
            return false;
        }
        attempt.markFailed(cancellationId, failReason);
        resolveIssues(payment);
        return true;
    }

    /**
     * 본인 또는 ADMIN의 환불 재시도를 처리한다. 최초 환불은 예약 취소·가게 거절 흐름에서 준비한다.
     * <p>종료된 예약의 마지막 FAILED 원장에 기록된 금액만 사용하고 요청자가 금액을 정하지 못하게 한다.
     * 재시도 시점에 정책을 다시 계산하면 날짜 경과나 가게 귀책 취소에 따른 원래 환불액이 달라질 수 있다.
     * 실패 원장이 없거나 결과가 미확정인 요청에는 새 환불을 만들지 않는다.
     */
    @Transactional(propagation = Propagation.NEVER)
    public PaymentResponseDto refundByMemberRequest(Long reservationId, String reason, Member requester) {
        Long attemptId = inTransaction(() -> prepareMemberRefund(reservationId, reason, requester));
        return dispatchPreparedRefund(attemptId);
    }

    private Long prepareMemberRefund(Long reservationId, String reason, Member requester) {
        if (reservationId == null) {
            throw new PaymentException("예약 정보가 필요해요.", HttpStatus.BAD_REQUEST);
        }

        FinancialReservationLocks.Locked locked = new FinancialReservationLocks(memberRepository, reservationRepository, entityManager)
                .lock(reservationId, requester.getId());
        Member currentRequester = locked.actor();
        Reservation reservation = locked.reservation();
        List<Payment> lockedPayments = lockPaymentRows(reservationId);

        boolean isOwner = reservation.getMember() != null
                && reservation.getMember().getId().equals(currentRequester.getId());
        boolean isAdmin = currentRequester.getRole() == Role.ADMIN;

        if (!isOwner && !isAdmin) {
            // 남의 예약이 "존재한다"는 사실까지 알려줄 필요는 없다 — 404 가 아니라 403 으로도
            // 충분히 새지만, 여기서는 권한 없음을 명확히 하는 쪽이 디버깅에 낫다.
            log.warn("Refund denied - not owner: reservationId={}, requesterId={}", reservationId, currentRequester.getId());
            throw new PaymentException("본인의 예약만 환불할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        // 예약 상태 전환과 결제 취소는 취소·거절 흐름이 한 번에 관리한다.
        // 이 엔드포인트는 그 흐름의 환불이 실패로 끝났을 때의 재시도만 허용한다.
        // 예약이 살아 있는데 환불만 나가면 "예약은 유지, 돈은 환불"이라는 불일치가 생긴다.
        if (!REFUND_RETRYABLE_RESERVATION_STATUSES.contains(reservation.getStatus())) {
            throw new PaymentException("환불은 예약을 취소한 후에 요청할 수 있어요.", HttpStatus.CONFLICT);
        }

        Payment payment = lockedPayments.stream().filter(value -> value.getStatus() == Payment.PaymentStatus.PAID)
                .findFirst().orElseThrow(() -> new PaymentException("다시 환불할 결제가 없어요.", HttpStatus.CONFLICT));

        // 금액은 원장의 마지막 실패 시도에서만 가져온다. 정책을 다시 태우지 않는다(위 주석 참고).
        RefundAttempt lastAttempt = lastRefundAttempt(payment.getId());
        if (lastAttempt == null || lastAttempt.getStatus() != RefundAttempt.Status.FAILED) {
            log.warn("Refund retry refused - no failed attempt to retry: reservationId={}, paymentId={}, lastStatus={}",
                    reservationId, payment.getId(), lastAttempt == null ? "NONE" : lastAttempt.getStatus());
            throw new PaymentException(
                    lastAttempt != null && lastAttempt.isUnresolved()
                            ? "직전 환불 요청의 처리 결과를 확인하는 중이에요. 잠시 후 다시 시도해주세요."
                            : "다시 시도할 환불 요청이 없어요. 고객센터로 문의해주세요.",
                    HttpStatus.CONFLICT);
        }

        Integer retryAmount = lastAttempt.getRequestedAmount();
        String retryReason = resolveRefundRetryReason(reason, lastAttempt);

        PaymentRefundDto safeDto = PaymentRefundDto.builder()
                .paymentId(payment.getId())
                .reservationId(reservationId)
                .refundAmount(retryAmount)
                .refundReason(retryReason)
                .build();

        log.info("Refund retry requested: reservationId={}, requesterId={}, admin={}, amount={}, previousAttemptId={}",
                reservationId, currentRequester.getId(), isAdmin, retryAmount, lastAttempt.getId());

        return prepareRefund(safeDto);
    }

    private String resolveRefundRetryReason(String reason, RefundAttempt lastAttempt) {
        if (reason != null && !reason.isBlank()) {
            return reason;
        }
        return lastAttempt.getReason() != null ? lastAttempt.getReason() : "환불 재시도";
    }

    /**
     * 환불 재시도를 받을 수 있는 예약 상태. 이용자·가게 취소({@code CANCELLED})와 가게 거절({@code REJECTED}).
     * 노쇼·이용완료는 환불 대상이 아니고, 대기·승인 상태는 아직 예약이 살아 있다.
     */
    private static final Set<Reservation.ReservationStatus> REFUND_RETRYABLE_RESERVATION_STATUSES =
            Collections.unmodifiableSet(EnumSet.of(
                    Reservation.ReservationStatus.CANCELLED,
                    Reservation.ReservationStatus.REJECTED));

    /** 결제의 가장 최근 환불 시도. 원장 조회가 생성 순 오름차순이라 마지막 행이 최신이다. */
    private RefundAttempt lastRefundAttempt(Long paymentId) {
        List<RefundAttempt> attempts = refundAttemptRepository.findByPaymentIdForUpdate(paymentId);
        return attempts.isEmpty() ? null : attempts.getLast();
    }

    /** 내부 단독 실행 경로. 예약 결정 TX 안에서는 prepare 메서드와 커밋 후 dispatcher를 쓴다. */
    @Transactional(propagation = Propagation.NEVER)
    public boolean refundByReservationCancel(Long reservationId) {
        Long attemptId = inTransaction(() -> prepareRefundByReservationCancel(reservationId));
        return attemptId != null && Payment.PaymentStatus.REFUNDED.name()
                .equals(dispatchPreparedRefund(attemptId).getStatus());
    }

    /** 환불 정책은 취소 결정 시점에 확정하고 미발신 의도를 같은 트랜잭션에 저장한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Long prepareRefundByReservationCancel(Long reservationId) {
        Reservation reservation = lockFinancialReservation(reservationId);
        requireRefundableReservationDecision(reservation);
        Payment payment = paymentRepository.findPaidByReservationIdForUpdate(reservationId).map(this::refreshLockedPayment).orElse(null);
        if (payment == null) return null;
        RefundCalculationResult calculation = computeRefundAmount(reservationId, payment.getAmount());
        if (calculation.getRefundAmount() <= 0) return null;
        return prepareRefund(PaymentRefundDto.builder().paymentId(payment.getId())
                .refundAmount(calculation.getRefundAmount())
                .refundReason("예약 취소에 따른 자동 환불 (" + calculation.getReason() + ")").build());
    }

    @Transactional(propagation = Propagation.NEVER)
    public boolean refundFullByStoreDecision(Long reservationId, String reason) {
        Long attemptId = inTransaction(() -> prepareFullRefundByStoreDecision(reservationId, reason));
        return attemptId != null && Payment.PaymentStatus.REFUNDED.name()
                .equals(dispatchPreparedRefund(attemptId).getStatus());
    }

    /** 가게 거절·취소·미승인 자동 취소는 이용자 위약금 정책을 적용하지 않는다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Long prepareFullRefundByStoreDecision(Long reservationId, String reason) {
        Reservation reservation = lockFinancialReservation(reservationId);
        requireRefundableReservationDecision(reservation);
        Payment payment = paymentRepository.findPaidByReservationIdForUpdate(reservationId).map(this::refreshLockedPayment).orElse(null);
        if (payment == null) return null;
        return prepareRefund(PaymentRefundDto.builder().paymentId(payment.getId()).refundAmount(payment.getAmount())
                .refundReason(reason != null && !reason.isBlank() ? reason : "가게 사정에 의한 취소 - 전액 환불").build());
    }

    private void requireRefundableReservationDecision(Reservation reservation) {
        if (!REFUND_RETRYABLE_RESERVATION_STATUSES.contains(reservation.getStatus())) {
            throw new PaymentException("환불은 예약을 취소한 후에 요청할 수 있어요.", HttpStatus.CONFLICT);
        }
    }

    /** 일반 상태 변경도 JOIN FETCH보다 동일 회원/예약 관문을 먼저 통과한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockReservationForStateChange(Long reservationId) {
        lockFinancialReservation(reservationId);
    }

    /** 취소·거절은 회원 ID 오름차순 → 예약 → 결제 순으로 잠그고 결정·환불 의도를 함께 커밋한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Reservation lockReservationPayments(Long reservationId) {
        Reservation reservation = lockFinancialReservation(reservationId);
        lockPaymentRows(reservationId);
        return reservation;
    }

    /** 환불 예상 금액은 본인 예약 또는 관리자만 조회한다. */
    @Transactional(readOnly = true)
    public RefundCalculationResult calculateRefundAmountForMember(Long reservationId, Member requester) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(ReservationException::notFound);

        boolean isOwner = reservation.getMember() != null
                && reservation.getMember().getId().equals(requester.getId());
        boolean isAdmin = requester.getRole() == Role.ADMIN;

        if (!isOwner && !isAdmin) {
            log.warn("Refund preview denied - not owner: reservationId={}, requesterId={}",
                    reservationId, requester.getId());
            throw new PaymentException("본인의 예약만 조회할 수 있어요.", HttpStatus.FORBIDDEN);
        }

        return computeRefundAmount(reservationId);
    }

    @Transactional(readOnly = true)
    public RefundCalculationResult calculateRefundAmount(Long reservationId) {
        return computeRefundAmount(reservationId);
    }

    private RefundCalculationResult computeRefundAmount(Long reservationId) {
        return computeRefundAmount(reservationId, null);
    }

    private RefundCalculationResult computeRefundAmount(Long reservationId, Integer lockedPaidAmount) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new PaymentException("예약 정보를 찾을 수 없어요.", HttpStatus.NOT_FOUND));

        Store store = reservation.getStore();
        // KST 기준 오늘이어야 한다 — 환불 구간을 가르는 숫자다.
        //   컨테이너가 UTC 라 인자 없는 LocalDate.now() 는 한국 시간 00:00~09:00 사이에 "어제"를 준다.
        //   그러면 daysUntil 이 1 커져서 **정책보다 한 구간 후한 환불**이 나갔다(부분 환불 → 전액 등).
        long daysUntil = ChronoUnit.DAYS.between(ServiceTime.today(), reservation.getReservationDate());

        // 미리보기와 실행은 같은 결제 기록을 기준으로 계산한다. 환불할 결제 기록이 없으면 예상 환불액은 0이다.
        int paidAmount = lockedPaidAmount != null ? lockedPaidAmount : paymentRepository.findPaidByReservationId(reservationId)
                .map(Payment::getAmount)
                .orElse(0);

        if (paidAmount <= 0) return new RefundCalculationResult(0, 0, "결제 내역 없음");

        int fullDays = store.getFullRefundDays() != null ? store.getFullRefundDays() : 3;
        int partialDays = store.getPartialRefundDays() != null ? store.getPartialRefundDays() : 1;
        int partialRate = store.getPartialRefundRate() != null ? store.getPartialRefundRate() : 50;

        // fullRefundDays가 0이면 모든 환불을 비활성화한다. partialRefundDays가 0이면 부분 환불만 비활성화한다.
        if (fullDays <= 0) {
            return new RefundCalculationResult(0, 0, "환불 불가");
        }

        if (daysUntil >= fullDays) {
            return new RefundCalculationResult(paidAmount, 100, "전액 환불 가능");
        }

        // partialDays 가 fullDays 이상이면 부분 환불 구간(partialDays <= d < fullDays)이 비어
        // 설정이 조용히 죽는다. 저장 시에도 막지만(StoreService), 이미 저장된 데이터가
        // 있을 수 있어 계산 시점에도 방어적으로 둔다.
        if (partialDays > 0 && partialDays < fullDays && daysUntil >= partialDays) {
            // int 곱셈은 결제액이 커지면 넘칠 수 있어 long 으로 계산한 뒤 결제액으로 한 번 더 자른다.
            long partial = (long) paidAmount * partialRate / 100L;
            return new RefundCalculationResult((int) Math.min(partial, paidAmount), partialRate, "부분 환불 가능");
        }

        return new RefundCalculationResult(0, 0, "환불 불가");
    }

    @Transactional(readOnly = true)
    public List<PaymentResponseDto> getPaymentsByMember(Long memberId) {
        return paymentRepository.findByMemberIdOrderByCreatedAtDesc(memberId)
                .stream()
                .map(PaymentResponseDto::fromEntity)
                .toList();
    }

    @lombok.Getter
    @lombok.AllArgsConstructor
    public static class RefundCalculationResult {
        private int refundAmount;
        private int refundRate;
        private String reason;
    }
}
