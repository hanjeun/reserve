package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.*;
import kr.it.reserve.payment.repository.*;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TestSettlementService {
    private final PaymentRepository payments;
    private final TestSettlementPayoutRepository payouts;
    private final PaymentReconciliationIssueRepository issues;
    private final RefundAttemptRepository refunds;
    private final ReservationRepository reservations;
    private final MemberRepository members;
    private final StoreRepository stores;
    private final PortoneService portone;
    private final PlatformTransactionManager transactions;
    private final EntityManager entityManager;
    @Value("${reserve.settlement.test-enabled:false}") private boolean enabled;

    public record Row(Long paymentId, String reservationCode, LocalDate reservationDate, long paidAmount, long refundedAmount,
            long feeAmount, long expectedAmount, long simulatedAmount, long balance, boolean held) { }
    public record Page(List<Row> content, boolean hasNext, int page) { }
    public record Receipt(String environment, Long paymentId, long amount, long feeAmount, LocalDateTime createdAt) { }

    @Transactional(readOnly = true)
    public Page page(Long storeId, Member requester, int page) {
        available();
        owner(storeId, requester);
        var result = payments.findTestSettlementPage(storeId, PageRequest.of(page, 20));
        var ids = result.getContent().stream().map(Payment::getId).toList();
        if (ids.isEmpty()) return new Page(List.of(), result.hasNext(), page);
        Map<Long, Long> totals = payouts.totals(ids).stream().collect(Collectors.toMap(TestSettlementPayoutRepository.Total::getPaymentId, TestSettlementPayoutRepository.Total::getAmount));
        Set<Long> pending = new HashSet<>(issues.findOpenPaymentIds(ids));
        pending.addAll(refunds.findUnresolvedPaymentIds(ids, RefundAttempt.UNRESOLVED));
        return new Page(result.getContent().stream().map(value -> row(value, totals.getOrDefault(value.getId(), 0L), pending.contains(value.getId()))).toList(),
                result.hasNext(), page);
    }
    @Transactional(propagation = Propagation.NEVER)
    public Receipt simulate(Long storeId, Long paymentId, String requestId, Member requester) {
        available();
        if (requestId == null || !requestId.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
            throw invalid("요청 번호를 확인해주세요.");
        String key = "TEST:" + requester.getId() + ":" + requestId;
        TransactionTemplate read = new TransactionTemplate(transactions);
        read.setReadOnly(true);
        var prior = read.execute(ignored -> {
            owner(storeId, requester);
            var saved = payouts.findById(key).orElse(null);
            if (saved != null && (!saved.getPaymentId().equals(paymentId) || !saved.getStoreId().equals(storeId))) throw invalid("같은 요청 번호의 내용이 달라요.");
            return saved;
        });
        if (prior != null) return receipt(prior);
        String merchantUid = read.execute(ignored -> payments.findById(paymentId)
                .filter(value -> value.getReservation().getStore().getId().equals(storeId)).map(Payment::getMerchantUid)
                .orElseThrow(() -> invalid("결제 정보를 확인해주세요.")));
        PortoneV2PaymentResponse observed = portone.getPaymentInfo(merchantUid);
        return new TransactionTemplate(transactions).execute(ignored -> {
            Long reservationId = payments.findReservationIdByPaymentId(paymentId).orElseThrow(() -> invalid("결제를 찾을 수 없어요."));
            var locked = new FinancialReservationLocks(members, reservations, entityManager).lock(reservationId, requester.getId());
            if (locked.actor().getAuthVersion() != requester.getAuthVersion() || locked.actor().isSuspended()) throw invalid("다시 로그인해주세요.");
            owner(storeId, locked.actor());
            Payment payment = payments.findByIdForUpdate(paymentId).orElseThrow(() -> invalid("결제를 찾을 수 없어요."));
            entityManager.refresh(payment, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            if (!payment.getReservation().getStore().getId().equals(storeId)) throw invalid("가게가 일치하지 않아요.");
            var recorded = payouts.findByPaymentIdForUpdate(paymentId);
            var existing = recorded.stream().filter(value -> value.getRequestKey().equals(key)).findFirst().orElse(null);
            if (existing != null) {
                if (!existing.getPaymentId().equals(paymentId) || !existing.getStoreId().equals(storeId)) throw invalid("같은 요청 번호의 내용이 달라요.");
                return receipt(existing);
            }
            requireObservation(payment, observed);
            boolean pending = !issues.findOpenByPaymentIdForUpdate(paymentId).isEmpty()
                    || refunds.findByPaymentIdForUpdate(paymentId).stream().anyMatch(RefundAttempt::isUnresolved);
            Row current = row(payment, recorded.stream().mapToLong(TestSettlementPayout::getAmount).reduce(0L, Math::addExact), pending);
            if (current.held() || current.balance() <= 0) throw invalid("현재 가상 정산할 금액이 없거나 확인 중이에요.");
            return receipt(payouts.save(new TestSettlementPayout(key, paymentId, storeId, requester.getId(), current.balance(), LocalDateTime.now(Clock.systemUTC()))));
        });
    }
    private Row row(Payment payment, long simulated, boolean pending) {
        long expected = TestSettlementPolicy.entitlement(payment, ServiceTime.today());
        return new Row(payment.getId(), payment.getReservation().getReservationCode(), payment.getReservation().getReservationDate(),
                payment.getAmount(), payment.refundedSoFar(), 0, expected, simulated, Math.subtractExact(expected, simulated),
                TestSettlementPolicy.held(payment, pending));
    }
    private void requireObservation(Payment payment, PortoneV2PaymentResponse pg) {
        if (pg == null || !Objects.equals(pg.getPaymentId(), payment.getMerchantUid())
                || !Objects.equals(pg.getStoreId(), portone.getStoreId()) || !"KRW".equals(pg.getCurrency())
                || pg.getAmount() != payment.getAmount() || pg.getCancelledAmount() == null || pg.getCancelledAmount() != payment.refundedSoFar()
                || !("PAID".equals(pg.getStatus()) || "PARTIAL_CANCELLED".equals(pg.getStatus()))
                || pg.getChannel() == null || !"TEST".equals(pg.getChannel().getType())
                || !Objects.equals(pg.getChannel().getId(), payment.getVerifiedChannelId())
                || pg.getDisputes() == null || !pg.getDisputes().isEmpty() || pg.hasUnsettledCancellation())
            throw invalid("결제사 확인이 끝나지 않아 가상 정산을 보류해요.");
    }
    private void owner(Long storeId, Member member) {
        if (member == null || member.isDeleted() || member.isSuspended()
                || !(member.isAdmin() || "BUSINESS".equals(member.getRole().name()))) throw invalid("사업자 권한이 필요해요.");
        var store = stores.findById(storeId).orElseThrow(() -> invalid("가게를 찾을 수 없어요."));
        if (!member.isAdmin() && !store.getOwner().getId().equals(member.getId())) throw new PaymentException("본인 가게만 조회할 수 있어요.", HttpStatus.FORBIDDEN);
    }
    private Receipt receipt(TestSettlementPayout value) { return new Receipt("TEST", value.getPaymentId(), value.getAmount(), 0, value.getCreatedAt()); }
    public boolean isEnabled() { return enabled; }
    private void available() { if (!enabled) throw new PaymentException("가상 정산을 준비하고 있어요.", HttpStatus.NOT_FOUND); }
    private PaymentException invalid(String message) { return new PaymentException(message, HttpStatus.CONFLICT); }
}
