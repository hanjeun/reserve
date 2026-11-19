package kr.it.reserve.moderation.service;

import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.moderation.entity.ServiceReport;
import kr.it.reserve.moderation.entity.ServiceReport.Status;
import kr.it.reserve.moderation.entity.ServiceReport.TargetType;
import kr.it.reserve.moderation.entity.ServiceReportEntry;
import kr.it.reserve.moderation.entity.ServiceReportEntry.Kind;
import kr.it.reserve.moderation.repository.AdminReportQueueRepository;
import kr.it.reserve.moderation.repository.ServiceReportEntryRepository;
import kr.it.reserve.moderation.repository.ServiceReportRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.retention.ReservationPrivacyPolicy;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.review.service.ReviewService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ServiceReportService {
    private static final Set<Reason> REVIEW_REASONS = Set.of(Reason.ABUSE, Reason.RATING_MANIPULATION, Reason.RIGHTS, Reason.SPAM, Reason.OTHER);
    private static final Set<Reason> RESERVATION_REASONS = Set.of(Reason.NO_SHOW, Reason.CANCELLATION, Reason.REFUND, Reason.BOOKING_ABUSE, Reason.OTHER);

    private final ServiceReportRepository reports;
    private final ServiceReportEntryRepository entries;
    private final ReviewRepository reviews;
    private final ReservationRepository reservations;
    private final StoreRepository stores;
    private final PaymentRepository payments;
    private final ReviewService reviewService;
    private final AdminReportQueueRepository queue;

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Receipt submit(Member reporter, TargetType type, Long targetId, Reason reason, String details) {
        if (!(type == TargetType.REVIEW ? REVIEW_REASONS : RESERVATION_REASONS).contains(reason)) {
            throw error(HttpStatus.BAD_REQUEST, "신고 유형에 맞는 사유를 선택해주세요.");
        }
        var now = LocalDateTime.now(Clock.systemDefaultZone());
        var target = type == TargetType.REVIEW ? reviewTarget(reporter, targetId) : reservationTarget(reporter, targetId, ServiceTime.now());
        reports.insertTarget(type.name(), targetId, target.storeId(), target.subjectId(), reason.name(), now);
        var report = reports.findByTargetTypeAndTargetId(type, targetId).orElseThrow();
        if (!entries.existsByReportIdAndActorIdAndKind(report.getId(), reporter.getId(), Kind.REPORT)) {
            entries.save(new ServiceReportEntry(report.getId(), reporter.getId(), Kind.REPORT, reason.name(), details.strip(), target.evidence(), now));
            report.recordActivity(now);
        }
        return Receipt.from(report);
    }

    public Page<Receipt> mine(Member member, int page, int size) {
        return reports.casesFor(member.getId(), PageRequests.bounded(page, size)).map(Receipt::from);
    }

    public Page<AdminReportQueueRepository.QueueRow> queue(Member admin, String type, String status, int page, int size) {
        requireAdmin(admin);
        return queue.list(type, status, PageRequests.bounded(page, size));
    }

    @Transactional
    public Receipt appeal(Member member, Long id, String details, long revision) {
        ServiceReport report = lock(id);
        if (!isParty(member, report)) throw error(HttpStatus.NOT_FOUND, "신고 내역을 찾을 수 없어요.");
        requireRevision(report, revision);
        if (report.getStatus() != Status.RESOLVED && report.getStatus() != Status.DISMISSED) {
            throw error(HttpStatus.CONFLICT, "처리가 끝난 신고에 이의를 신청할 수 있어요.");
        }
        var now = LocalDateTime.now(Clock.systemDefaultZone());
        entries.save(new ServiceReportEntry(id, member.getId(), Kind.APPEAL, null, details.strip(), null, now));
        report.appeal(now);
        reports.flush();
        return Receipt.from(report);
    }

    public CaseDetail detail(Member admin, Long id, int page, int size) {
        requireAdmin(admin);
        ServiceReport report = reports.findById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "신고 내역을 찾을 수 없어요."));
        var history = entries.findByReportIdOrderByIdDesc(id, PageRequests.bounded(page, size)).map(Entry::from);
        var review = report.getTargetType() == TargetType.REVIEW ? reviews.findById(report.getTargetId()).orElse(null) : null;
        Long reservationId = report.getTargetType() == TargetType.RESERVATION ? report.getTargetId()
                : review == null || review.getReservation() == null ? null : review.getReservation().getId();
        ReservationFacts facts = reservationId == null ? null : reservations.findById(reservationId)
                .map(row -> new ReservationFacts(row.getReservationCode(), row.getStatus().name(), row.getCheckedInAt(),
                        payments.findByReservation_IdOrderByIdDesc(reservationId, PageRequests.bounded(0, 10))
                                .stream().map(payment -> payment.getStatus().name()).toList())).orElse(null);
        return new CaseDetail(Receipt.from(report), history, facts, review != null && !review.isDeleted(),
                review != null && review.isModerationHidden());
    }

    @Transactional
    public Receipt decide(Member admin, Long id, Decision decision, String note, long revision) {
        requireAdmin(admin);
        ServiceReport report = lock(id);
        requireRevision(report, revision);
        if (report.getStatus() != Status.OPEN && report.getStatus() != Status.APPEALED) {
            throw error(HttpStatus.CONFLICT, "이미 처리된 신고예요.");
        }
        if (decision == Decision.HIDE_REVIEW || decision == Decision.RESTORE_REVIEW) {
            if (report.getTargetType() != TargetType.REVIEW) throw error(HttpStatus.BAD_REQUEST, "리뷰 신고에만 적용할 수 있어요.");
            reviewService.moderateVisibility(report.getTargetId(), decision == Decision.HIDE_REVIEW);
        }
        var now = LocalDateTime.now(Clock.systemDefaultZone());
        report.decide(decision == Decision.DISMISS ? Status.DISMISSED : Status.RESOLVED, admin.getId(), note.strip(), now);
        entries.save(new ServiceReportEntry(id, admin.getId(), Kind.DECISION, decision.name(), note.strip(), null, now));
        reports.flush();
        return Receipt.from(report);
    }

    private Target reviewTarget(Member reporter, Long targetId) {
        var review = reviews.findById(targetId).filter(row -> !row.isDeleted() && !row.isModerationHidden())
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "리뷰를 찾을 수 없어요."));
        if (!review.isPublished()) throw error(HttpStatus.NOT_FOUND, "리뷰를 찾을 수 없어요.");
        if (reporter.isDeleted() || reporter.isSuspended() || !reporter.isTermsAgreed()
                || reporter.getId().equals(review.getMember().getId())) {
            throw error(HttpStatus.FORBIDDEN, "이 리뷰를 신고할 수 없어요.");
        }
        return new Target(review.getStore().getId(), review.getMember().getId(),
                review.getRating() + "점\n" + review.getTitle() + "\n" + review.getContent());
    }

    private Target reservationTarget(Member reporter, Long targetId, LocalDateTime now) {
        var reservation = reservations.findById(targetId).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "예약을 찾을 수 없어요."));
        boolean ownBooking = reservation.getMember().getId().equals(reporter.getId());
        if (!ownBooking && !(owns(reporter, reservation.getStore()) && !ReservationPrivacyPolicy.hidden(reservation, now))) {
            throw error(HttpStatus.NOT_FOUND, "신고할 수 있는 예약을 찾을 수 없어요.");
        }
        return new Target(reservation.getStore().getId(), reservation.getMember().getId(), reservation.getStatus().name());
    }

    private boolean isParty(Member member, ServiceReport report) {
        return report.getSubjectMemberId().equals(member.getId())
                || entries.existsByReportIdAndActorIdAndKind(report.getId(), member.getId(), Kind.REPORT)
                || report.getTargetType() == TargetType.RESERVATION
                && stores.existsByIdAndOwnerIdAndDeletedAtIsNull(report.getStoreId(), member.getId());
    }

    private boolean owns(Member member, Store store) {
        return !store.isDeleted() && store.getOwner() != null && member.getId().equals(store.getOwner().getId());
    }

    private ServiceReport lock(Long id) {
        return reports.lockById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "신고 내역을 찾을 수 없어요."));
    }

    private void requireRevision(ServiceReport report, long revision) {
        if (report.getRevision() != revision) throw error(HttpStatus.CONFLICT, "신고에 변경이 있어요. 최신 내역을 확인해주세요.");
    }

    private void requireAdmin(Member member) {
        if (!member.isAdmin()) throw error(HttpStatus.FORBIDDEN, "관리자만 신고를 처리할 수 있어요.");
    }

    private BusinessException error(HttpStatus status, String message) { return new BusinessException(message, status); }

    public enum Reason { ABUSE, RATING_MANIPULATION, RIGHTS, SPAM, NO_SHOW, CANCELLATION, REFUND, BOOKING_ABUSE, OTHER }
    public enum Decision { DISMISS, RESOLVE, HIDE_REVIEW, RESTORE_REVIEW }

    private record Target(Long storeId, Long subjectId, String evidence) { }
    public record Receipt(Long id, TargetType targetType, Long targetId, Status status, LocalDateTime createdAt, String decisionNote,
            LocalDateTime reviewedAt, long revision) {
        static Receipt from(ServiceReport report) { return new Receipt(report.getId(), report.getTargetType(), report.getTargetId(),
                report.getStatus(), report.getCreatedAt(), report.getDecisionNote(), report.getReviewedAt(), report.getRevision()); }
    }
    public record Entry(Long id, Long actorId, Kind kind, String reason, String details, String evidence, LocalDateTime createdAt) {
        static Entry from(ServiceReportEntry entry) { return new Entry(entry.getId(), entry.getActorId(), entry.getKind(), entry.getReason(),
                entry.getDetails(), entry.getEvidence(), entry.getCreatedAt()); }
    }
    public record ReservationFacts(String code, String status, LocalDateTime checkedInAt, List<String> paymentStatuses) { }
    public record CaseDetail(Receipt report, Page<Entry> history, ReservationFacts reservation, boolean reviewExists, boolean reviewHidden) { }
}
