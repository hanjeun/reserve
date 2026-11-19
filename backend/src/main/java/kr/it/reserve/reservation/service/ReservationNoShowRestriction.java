package kr.it.reserve.reservation.service;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.dto.NoShowMemberResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.entity.ReservationNoShowRecord;
import kr.it.reserve.reservation.entity.StoreBookingRestriction;
import kr.it.reserve.reservation.repository.ReservationNoShowRecordRepository;
import kr.it.reserve.reservation.repository.StoreBookingRestrictionRepository;
import kr.it.reserve.reservation.retention.ReservationPrivacyPolicy;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ReservationNoShowRestriction {
    private static final int THRESHOLD = 3;
    private static final int WINDOW_DAYS = 30;
    private static final int RESTRICTION_DAYS = 7;
    private static final DateTimeFormatter END_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ReservationNoShowRecordRepository records;
    private final StoreBookingRestrictionRepository manualRestrictions;
    private final MemberRepository members;
    private final StoreRepository stores;
    private final AuditLogService audit;

    private record StoreMember(Long storeId, Long memberId) { }

    void record(Reservation reservation, LocalDateTime now) {
        var confirmedAt = now.truncatedTo(ChronoUnit.SECONDS);
        var existing = records.findByReservationIdForUpdate(reservation.getId());
        if (existing.isPresent()) existing.get().reconfirm(confirmedAt);
        else records.save(new ReservationNoShowRecord(reservation.getId(), reservation.getMember().getId(),
                reservation.getStore().getId(), confirmedAt));
    }

    void retract(Long reservationId, LocalDateTime now) {
        records.findByReservationIdForUpdate(reservationId).ifPresent(row -> row.correct(now));
    }

    void requireNewReservationAllowed(Long memberId, Long storeId, LocalDateTime now) {
        var manual = manualRestrictions.findByStoreIdAndMemberId(storeId, memberId)
                .filter(row -> row.getEndsAt().isAfter(now));
        if (manual.isPresent()) {
            var endsAt = manual.get().getEndsAt();
            String period = StoreBookingRestriction.PERMANENT_UNTIL.equals(endsAt) ? "영구적으로"
                    : END_FORMAT.format(endsAt) + " (한국 시간)까지";
            throw new ReservationException("가게에서 " + period
                    + " 새 예약을 제한했어요. 정정이 필요하면 고객지원에 문의해주세요.", HttpStatus.FORBIDDEN);
        }
        var confirmations = records.findConfirmations(memberId, storeId, earliestRelevantTime(now), now);
        var until = automaticUntil(confirmations, now);
        if (until != null) {
            throw new ReservationException("반복 노쇼로 " + END_FORMAT.format(until)
                    + " (한국 시간)까지 이 가게의 새 예약이 제한돼요. 정정이 필요하면 고객지원에 문의해주세요.",
                    HttpStatus.FORBIDDEN);
        }
    }

    private static LocalDateTime automaticUntil(List<LocalDateTime> confirmations, LocalDateTime now) {
        for (int index = 0; index + THRESHOLD <= confirmations.size(); index++) {
            var confirmedAt = confirmations.get(index);
            var until = confirmedAt.plusDays(RESTRICTION_DAYS);
            if (!until.isAfter(now)) break;
            var earliest = confirmations.get(index + THRESHOLD - 1);
            if (!earliest.isBefore(confirmedAt.minusDays(WINDOW_DAYS))) {
                return until;
            }
        }
        return null;
    }

    @Transactional(readOnly = true)
    public Page<NoShowMemberResponse> getNoShowMembers(Member owner, Long storeId, String search, String filter,
            String sort, int page, int size) {
        if (storeId == null) requireOwnerRole(owner);
        else requireOwnedStore(owner, storeId);
        var now = ServiceTime.now();
        var from = earliestRelevantTime(now);
        var visibilityCutoff = now.minusDays(ReservationPrivacyPolicy.STORE_DAYS);
        String value = search == null ? "" : search.strip();
        Long memberNumber = value.matches("[0-9]{1,18}") ? Long.valueOf(value) : null;
        String keyword = value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        String restrictionFilter = "restricted".equals(filter) || "available".equals(filter) ? filter : "all";
        var membersPage = records.findOwnerNoShowMembers(owner.getId(), storeId, keyword, memberNumber, restrictionFilter, "count".equals(sort),
                from, now, from.toLocalDate(), now.toLocalDate(), now.minusDays(WINDOW_DAYS),
                visibilityCutoff, visibilityCutoff.toLocalDate(), PageRequests.bounded(page, size));
        var pageRows = membersPage.getContent();
        var storeIds = pageRows.stream().map(ReservationNoShowRecordRepository.OwnerNoShowMember::getStoreId).distinct().toList();
        var memberIds = pageRows.stream().map(ReservationNoShowRecordRepository.OwnerNoShowMember::getScopedMemberId).distinct().toList();
        var times = pageRows.isEmpty() ? Map.<StoreMember, List<LocalDateTime>>of()
                : records.findActiveForMembers(storeIds, memberIds, from, now).stream().collect(Collectors.groupingBy(
                row -> new StoreMember(row.getStoreId(), row.getMemberId()),
                Collectors.mapping(ReservationNoShowRecord::getConfirmedAt, Collectors.toList())));
        return membersPage.map(row -> {
            var key = new StoreMember(row.getStoreId(), row.getScopedMemberId());
            boolean permanent = StoreBookingRestriction.PERMANENT_UNTIL.equals(row.getManualUntil());
            return new NoShowMemberResponse(row.getStoreId(), row.getStoreName(), row.getMemberId(), row.getName(),
                    row.getRetainedCount(), row.getRecentCount(), row.getLatestNoShowDate(), instant(row.getLatestConfirmedAt()),
                    instant(automaticUntil(times.getOrDefault(key, List.of()), now)),
                    permanent ? null : instant(row.getManualUntil()), permanent, row.getRestrictionId(), row.getReason(), row.getRestrictable() == 1);
        });
    }

    CustomerRestriction customerRestriction(Long storeId, Long memberId, LocalDateTime now) {
        var manual = manualRestrictions.findByStoreIdAndMemberId(storeId, memberId).filter(row -> row.getEndsAt().isAfter(now));
        var automatic = automaticUntil(records.findConfirmations(memberId, storeId, earliestRelevantTime(now), now), now);
        var cutoff = now.minusDays(ReservationPrivacyPolicy.STORE_DAYS);
        boolean canRestrict = records.hasRestrictableNoShow(storeId, memberId, now.toLocalDate(), cutoff, cutoff.toLocalDate());
        var end = manual.map(StoreBookingRestriction::getEndsAt).orElse(null);
        boolean permanent = StoreBookingRestriction.PERMANENT_UNTIL.equals(end);
        return new CustomerRestriction(manual.map(StoreBookingRestriction::getId).orElse(null),
                permanent ? null : instant(end), permanent, instant(automatic), canRestrict);
    }

    public record CustomerRestriction(Long restrictionId, Instant manualUntil, boolean permanent, Instant automaticUntil, boolean restrictable) { }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void restrict(Member owner, Long storeId, Long memberId, Integer days, boolean permanent, String reason) {
        boolean validPeriod = permanent ? days == null : Integer.valueOf(7).equals(days) || Integer.valueOf(30).equals(days);
        if (!validPeriod || reason == null || reason.isBlank() || reason.strip().length() > 200) {
            throw new ReservationException("제한 기간과 사유를 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
        lockMemberAndStore(owner, storeId, memberId);
        var now = ServiceTime.now();
        var existing = manualRestrictions.findByStoreIdAndMemberId(storeId, memberId);
        if (existing.filter(row -> row.getEndsAt().isAfter(now)).isPresent()) return;
        var visibilityCutoff = now.minusDays(ReservationPrivacyPolicy.STORE_DAYS);
        if (!records.hasRestrictableNoShow(storeId, memberId, now.toLocalDate(), visibilityCutoff, visibilityCutoff.toLocalDate())) {
            throw new ReservationException("확인할 수 있는 노쇼 예약이 있는 회원만 제한할 수 있어요.", HttpStatus.CONFLICT);
        }
        var until = permanent ? StoreBookingRestriction.PERMANENT_UNTIL : now.plusDays(days).truncatedTo(ChronoUnit.SECONDS);
        if (existing.isPresent()) {
            manualRestrictions.delete(existing.get());
            manualRestrictions.flush();
        }
        manualRestrictions.save(new StoreBookingRestriction(storeId, memberId, until, reason.strip()));
        audit.recordStoreReservationRestriction(memberId, storeId, until);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void release(Member owner, Long storeId, Long restrictionId) {
        requireOwnedStore(owner, storeId);
        var memberId = manualRestrictions.findMemberIdForStore(restrictionId, storeId).orElse(null);
        if (memberId == null) return;
        lockMemberAndStore(owner, storeId, memberId);
        manualRestrictions.findByStoreIdAndMemberId(storeId, memberId).filter(row -> row.getId().equals(restrictionId))
                .ifPresent(row -> {
                    manualRestrictions.delete(row);
                    audit.recordStoreReservationRestriction(memberId, storeId, null);
                });
    }

    private void lockMemberAndStore(Member owner, Long storeId, Long memberId) {
        requireOwnedStore(owner, storeId);
        // 새 예약이 지나는 회원 → 가게 잠금 순서와 일치시킨다.
        members.findActiveByIdForUpdate(memberId)
                .orElseThrow(() -> new ReservationException("회원 정보를 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        requireOwner(owner, stores.findByIdForUpdate(storeId).orElse(null));
    }

    private static void requireOwner(Member owner, Store store) {
        if (store == null || store.isDeleted() || !owner.getId().equals(store.getOwner().getId())) throw ownerError();
    }

    private void requireOwnedStore(Member owner, Long storeId) {
        requireOwnerRole(owner);
        if (!stores.existsByIdAndOwnerIdAndDeletedAtIsNull(storeId, owner.getId())) throw ownerError();
    }

    private static void requireOwnerRole(Member owner) {
        if (!(owner.isBusiness() || owner.isAdmin())) throw ownerError();
    }

    private static ReservationException ownerError() {
        return new ReservationException("본인 가게의 노쇼만 관리할 수 있어요.", HttpStatus.FORBIDDEN);
    }

    private static Instant instant(LocalDateTime value) {
        return value == null ? null : value.atZone(ServiceTime.ZONE).toInstant();
    }

    Set<Long> correctableIds(List<Reservation> reservations, LocalDateTime now) {
        var ids = reservations.stream().filter(r -> r.getStatus() == Reservation.ReservationStatus.NO_SHOW)
                .map(Reservation::getId).toList();
        return ids.isEmpty() ? Set.of() : records.findCorrectableIds(ids, earliestRelevantTime(now));
    }

    boolean correct(Long reservationId, LocalDateTime now) {
        var record = records.findByReservationIdForUpdate(reservationId)
                .filter(row -> !row.getConfirmedAt().isBefore(earliestRelevantTime(now)))
                .orElseThrow(() -> new ReservationException("정정할 예약 제한 기록을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        return record.correct(now);
    }

    @Scheduled(cron = "0 20 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void removeExpiredRecords() {
        var now = ServiceTime.now();
        records.deleteBefore(earliestRelevantTime(now));
        manualRestrictions.deleteExpired(now);
    }

    private static LocalDateTime earliestRelevantTime(LocalDateTime now) {
        return now.minusDays(WINDOW_DAYS + RESTRICTION_DAYS);
    }
}
