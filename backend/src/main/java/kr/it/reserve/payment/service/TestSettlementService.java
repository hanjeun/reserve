package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.global.persistence.CurrentLockedState;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.entity.*;
import kr.it.reserve.payment.repository.*;
import kr.it.reserve.reservation.repository.ReservationNoShowRecordRepository;
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
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TestSettlementService {
    private static final int PAGE_SIZE = 20;
    private static final int REPORT_BATCH_SIZE = 200;
    private static final Pattern CSV_FORMULA = Pattern.compile("^[\\s\\p{Cc}]*[=+@-]", Pattern.UNICODE_CHARACTER_CLASS);
    private final PaymentRepository payments;
    private final TestSettlementPayoutRepository payouts;
    private final PaymentReconciliationIssueRepository issues;
    private final RefundAttemptRepository refunds;
    private final ReservationRepository reservations;
    private final ReservationNoShowRecordRepository noShows;
    private final MemberRepository members;
    private final StoreRepository stores;
    private final PortoneService portone;
    private final PlatformTransactionManager transactions;
    private final EntityManager entityManager;
    @Value("${reserve.settlement.test-enabled:false}") private boolean enabled;

    public record Row(Long paymentId, String reservationCode, LocalDate reservationDate, LocalDate noShowConfirmedDate,
            LocalDate lastSimulatedDate, long noShowAmount, long paidAmount, long refundedAmount, long feeAmount,
            long expectedAmount, long simulatedAmount, long balance, boolean held, TestSettlementPolicy.State state) {
        long payableAmount() { return state == TestSettlementPolicy.State.READY && !held ? Math.max(0, balance) : 0; }
        long adjustmentAmount() { return balance < 0 ? Math.negateExact(balance) : 0; }
        boolean reportable() { return noShowAmount > 0 || simulatedAmount > 0; }
    }
    public record Page(List<Row> content, boolean hasNext, int page, int size, long totalElements, int totalPages) { }
    public record Receipt(String environment, Long paymentId, long amount, long feeAmount, LocalDateTime createdAt) { }
    public record MonthlySummary(String month, long noShowAmount, long deductionAmount, long payableAmount,
            long simulatedAmount, long adjustmentAmount, long reportCount) { }

    @Transactional(readOnly = true)
    public Page page(Long storeId, Member requester, int page, YearMonth month) {
        available();
        owner(storeId, requester);
        var result = month == null ? payments.findTestSettlementPage(storeId, PageRequest.of(page, PAGE_SIZE))
                : payments.findTestSettlementMonthPage(storeId, month.atDay(1), month.atEndOfMonth(), PageRequest.of(page, PAGE_SIZE));
        return new Page(rows(result.getContent(), ServiceTime.now()), result.hasNext(), page, result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public MonthlySummary monthly(Long storeId, Member requester, YearMonth month) {
        available();
        owner(storeId, requester);
        var total = new MonthlyTotals();
        visitMonth(storeId, month, total::add);
        return new MonthlySummary(month.toString(), total.noShowAmount, total.deductionAmount, total.payableAmount,
                total.simulatedAmount, total.adjustmentAmount, total.reportCount);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public String monthlyCsv(Long storeId, Member requester, YearMonth month) {
        available();
        owner(storeId, requester);
        var csv = new StringBuilder("\uFEFF환경,예약번호,예약일,노쇼 확정일,노쇼 확정액(원),확정 환불(원),수수료(원),"
                + "모의 지급 예정액(원),모의 지급액(원),최근 모의 지급일,조정 필요액(원),상태\r\n");
        visitMonth(storeId, month, row -> {
            if (!row.reportable()) return;
            csv.append("TEST,").append(csvText(row.reservationCode())).append(',').append(row.reservationDate()).append(',')
                    .append(Objects.toString(row.noShowConfirmedDate(), "")).append(',').append(row.noShowAmount()).append(',')
                    .append(row.refundedAmount()).append(',').append(row.feeAmount()).append(',').append(row.payableAmount()).append(',')
                    .append(row.simulatedAmount()).append(',').append(Objects.toString(row.lastSimulatedDate(), "")).append(',')
                    .append(row.adjustmentAmount()).append(',').append(row.state()).append("\r\n");
        });
        return csv.toString();
    }

    private void visitMonth(Long storeId, YearMonth month, Consumer<Row> visitor) {
        LocalDate start = month.atDay(1);
        LocalDate end = month.atEndOfMonth();
        LocalDateTime now = ServiceTime.now();
        var limit = PageRequest.of(0, REPORT_BATCH_SIZE);
        Long beforeId = null;
        List<Payment> batch;
        do {
            batch = payments.findTestSettlementMonthBatch(storeId, start, end, beforeId, limit);
            rows(batch, now).forEach(visitor);
            if (!batch.isEmpty()) beforeId = batch.getLast().getId();
        } while (batch.size() == REPORT_BATCH_SIZE);
    }

    private List<Row> rows(List<Payment> batch, LocalDateTime now) {
        if (batch.isEmpty()) return List.of();
        var ids = batch.stream().map(Payment::getId).toList();
        var totals = payouts.totals(ids).stream().collect(Collectors.toMap(TestSettlementPayoutRepository.Total::getPaymentId, Function.identity()));
        var confirmedDates = new HashMap<Long, LocalDate>();
        var reservationIds = batch.stream().map(payment -> payment.getReservation().getId()).distinct().toList();
        noShows.findByReservationIdIn(reservationIds).forEach(record ->
                confirmedDates.put(record.getReservationId(), record.getConfirmedAt().toLocalDate()));
        Set<Long> pending = new HashSet<>(issues.findOpenPaymentIds(ids));
        pending.addAll(refunds.findUnresolvedPaymentIds(ids, RefundAttempt.UNRESOLVED));
        return batch.stream().map(payment -> {
            var total = totals.get(payment.getId());
            LocalDateTime paidAt = total == null ? null : total.getLastPaidAt();
            LocalDate simulatedDate = paidAt == null ? null : paidAt.atOffset(ZoneOffset.UTC).atZoneSameInstant(ServiceTime.ZONE).toLocalDate();
            return row(payment, total == null ? 0 : total.getAmount(), pending.contains(payment.getId()), now,
                    confirmedDates.get(payment.getReservation().getId()), simulatedDate);
        }).toList();
    }

    private static String csvText(String value) {
        if (value == null) return "";
        String escaped = value.replace("\"", "\"\"");
        return "\"" + (CSV_FORMULA.matcher(value).find() ? "'" : "") + escaped + "\"";
    }

    private static final class MonthlyTotals {
        private long noShowAmount;
        private long deductionAmount;
        private long payableAmount;
        private long simulatedAmount;
        private long adjustmentAmount;
        private long reportCount;

        private void add(Row row) {
            if (!row.reportable()) return;
            noShowAmount = Math.addExact(noShowAmount, row.noShowAmount());
            deductionAmount = Math.addExact(deductionAmount, Math.addExact(row.refundedAmount(), row.feeAmount()));
            payableAmount = Math.addExact(payableAmount, row.payableAmount());
            simulatedAmount = Math.addExact(simulatedAmount, row.simulatedAmount());
            adjustmentAmount = Math.addExact(adjustmentAmount, row.adjustmentAmount());
            reportCount++;
        }
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
        String merchantUid = read.execute(ignored -> {
            Payment payment = payments.findById(paymentId)
                    .filter(value -> value.getReservation().getStore().getId().equals(storeId))
                    .orElseThrow(() -> invalid("결제 정보를 확인해주세요."));
            boolean pending = !issues.findOpenPaymentIds(List.of(paymentId)).isEmpty()
                    || !refunds.findUnresolvedPaymentIds(List.of(paymentId), RefundAttempt.UNRESOLVED).isEmpty();
            Row current = row(payment, payouts.total(paymentId), pending);
            if (current.held() || current.balance() <= 0) throw invalid("현재 가상 정산할 금액이 없거나 확인 중이에요.");
            return payment.getMerchantUid();
        });
        PortoneV2PaymentResponse observed = portone.getPaymentInfo(merchantUid);
        return new TransactionTemplate(transactions).execute(ignored -> {
            Long reservationId = payments.findReservationIdByPaymentId(paymentId).orElseThrow(() -> invalid("결제를 찾을 수 없어요."));
            var locked = new FinancialReservationLocks(members, reservations, entityManager).lock(reservationId, requester.getId());
            if (locked.actor().getAuthVersion() != requester.getAuthVersion() || locked.actor().isSuspended()) throw invalid("다시 로그인해주세요.");
            owner(storeId, locked.actor());
            Payment payment = payments.findByIdForUpdate(paymentId).orElseThrow(() -> invalid("결제를 찾을 수 없어요."));
            CurrentLockedState.refresh(entityManager, payment);
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
        return row(payment, simulated, pending, ServiceTime.now(), null, null);
    }

    private Row row(Payment payment, long simulated, boolean pending, LocalDateTime now,
            LocalDate noShowConfirmedDate, LocalDate lastSimulatedDate) {
        long expected = TestSettlementPolicy.entitlement(payment, now);
        long balance = Math.subtractExact(expected, simulated);
        return new Row(payment.getId(), payment.getReservation().getReservationCode(), payment.getReservation().getReservationDate(),
                noShowConfirmedDate, lastSimulatedDate, TestSettlementPolicy.confirmedNoShowAmount(payment), payment.getAmount(),
                payment.refundedSoFar(), 0, expected, simulated, balance,
                TestSettlementPolicy.held(payment, pending), TestSettlementPolicy.state(payment, now, pending, balance));
    }
    private void requireObservation(Payment payment, PortoneV2PaymentResponse pg) {
        if (pg == null || !Objects.equals(pg.getPaymentId(), payment.getMerchantUid())
                || !Objects.equals(pg.getStoreId(), portone.getStoreId()) || !"KRW".equals(pg.getCurrency())
                || pg.getAmount() != payment.getAmount() || pg.getCancelledAmount() == null || pg.getCancelledAmount() != payment.refundedSoFar()
                || !("PAID".equals(pg.getStatus()) || "PARTIAL_CANCELLED".equals(pg.getStatus()))
                || pg.getChannel() == null || !"TEST".equals(pg.getChannel().getType())
                || !Objects.equals(pg.getChannel().getId(), payment.getVerifiedChannelId())
                || !Objects.equals(pg.getStoreId(), payment.getVerifiedStoreId())
                || pg.getDisputes() == null || !pg.getDisputes().isEmpty() || pg.hasUnsettledCancellation())
            throw invalid("결제사 확인이 끝나지 않아 가상 정산을 보류해요.");
    }
    private void owner(Long storeId, Member member) {
        if (member == null || member.isDeleted() || member.isSuspended()
                || !(member.isAdmin() || "BUSINESS".equals(member.getRole().name()))) throw invalid("사업자 권한이 필요해요.");
        var store = stores.findById(storeId).orElseThrow(() -> invalid("가게를 찾을 수 없어요."));
        if (!store.getOwner().getId().equals(member.getId())) throw new PaymentException("본인 가게만 조회할 수 있어요.", HttpStatus.FORBIDDEN);
    }
    private Receipt receipt(TestSettlementPayout value) { return new Receipt("TEST", value.getPaymentId(), value.getAmount(), 0, value.getCreatedAt()); }
    public boolean isEnabled() { return enabled; }
    private void available() { if (!enabled) throw new PaymentException("가상 정산을 준비하고 있어요.", HttpStatus.NOT_FOUND); }
    private PaymentException invalid(String message) { return new PaymentException(message, HttpStatus.CONFLICT); }
}
