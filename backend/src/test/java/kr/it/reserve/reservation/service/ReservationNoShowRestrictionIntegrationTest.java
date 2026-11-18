package kr.it.reserve.reservation.service;

import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.entity.ReservationNoShowRecord;
import kr.it.reserve.reservation.repository.ReservationNoShowRecordRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:no-show-restriction;MODE=MySQL;DB_CLOSE_DELAY=-1")
@Transactional
class ReservationNoShowRestrictionIntegrationTest {
    @Autowired ReservationNoShowRecordRepository records;
    @Autowired ReservationNoShowRestriction restrictions;
    @Autowired ReservationService reservations;
    @Autowired AuditLogRepository auditLogs;
    @Autowired ReservationRepository reservationRows;
    @Autowired StoreRepository stores;
    @Autowired MemberRepository members;

    @Test
    void countsOnlyThisMemberAndStoreAndKeepsSevenDayBoundaryEvenAsTheOldestRecordAges() {
        var third = LocalDateTime.of(2026, 10, 15, 11, 0);
        records.saveAll(List.of(record(1, 10, 20, third.minusDays(30)), record(2, 10, 20, third.minusDays(1)),
                record(3, 10, 20, third), record(4, 10, 21, third), record(5, 11, 20, third)));

        assertThatThrownBy(() -> restrictions.requireNewReservationAllowed(10L, 20L, third.plusDays(6)))
                .isInstanceOfSatisfying(ReservationException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(error.getMessage()).contains("2026-10-22 11:00:00");
                });
        assertThatCode(() -> restrictions.requireNewReservationAllowed(10L, 21L, third.plusDays(6))).doesNotThrowAnyException();
        assertThatCode(() -> restrictions.requireNewReservationAllowed(11L, 20L, third.plusDays(6))).doesNotThrowAnyException();
        assertThatCode(() -> restrictions.requireNewReservationAllowed(10L, 20L, third.plusDays(7))).doesNotThrowAnyException();
    }

    @Test
    void anAdminCorrectionRemovesTheEventImmediatelyAndCanBeRetried() {
        var now = ServiceTime.now();
        records.saveAll(List.of(record(6, 10, 20, now.minusDays(3)), record(7, 10, 20, now.minusDays(2)),
                record(8, 10, 20, now.minusDays(1))));
        var administrator = Member.builder().id(11L).role(Role.ADMIN).build();

        assertThatThrownBy(() -> restrictions.requireNewReservationAllowed(10L, 20L, now))
                .isInstanceOf(ReservationException.class);
        reservations.correctNoShowRestriction(8L, administrator);
        reservations.correctNoShowRestriction(8L, administrator);
        assertThatCode(() -> restrictions.requireNewReservationAllowed(10L, 20L, now)).doesNotThrowAnyException();
        assertThat(records.findByReservationIdForUpdate(8L)).get()
                .extracting(ReservationNoShowRecord::getCorrectedAt).isNotNull();
        assertThat(auditLogs.findAll()).filteredOn(log -> log.getEntityId().equals(8L))
                .singleElement().satisfies(log -> assertThat(log.getAction()).isEqualTo("NO_SHOW_CORRECTION"));
    }

    @Test
    void ordinaryMemberCannotCorrectANoShow() {
        var ordinary = Member.builder().id(10L).role(Role.USER).build();
        assertThatThrownBy(() -> reservations.correctNoShowRestriction(8L, ordinary))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void restoresThePreviousStatusAndCountsAReconfirmedBookingOnce() {
        var owner = member("undo-owner", Role.BUSINESS);
        var guest = member("undo-guest", Role.USER);
        var store = store(owner, "undo-store");
        var reservation = booking(store, guest, ServiceTime.now().minusDays(2), Reservation.ReservationStatus.CONFIRMED);
        reservations.markNoShow(reservation.getId(), owner);
        assertThat(reservation.getNoShowPreviousStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
        reservations.undoNoShow(reservation.getId(), owner);
        reservations.undoNoShow(reservation.getId(), owner);
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CONFIRMED);
        assertThat(records.findByReservationIdForUpdate(reservation.getId())).get()
                .extracting(ReservationNoShowRecord::getCorrectedAt).isNotNull();
        reservations.markNoShow(reservation.getId(), owner);
        assertThat(records.findByReservationIdForUpdate(reservation.getId())).get()
                .extracting(ReservationNoShowRecord::getCorrectedAt).isNull();
        assertThat(records.findAll()).filteredOn(row -> row.getReservationId().equals(reservation.getId())).hasSize(1);
    }

    @Test
    void ownerCanFindLegacyNoShowAndRestrictAndReleaseOnlyDuringAnActiveManualRestriction() {
        var owner = member("restriction-owner", Role.BUSINESS);
        var guest = member("restriction-guest", Role.USER);
        var alternateOwner = member("outside-owner", Role.BUSINESS);
        var store = store(owner, "restriction-store");
        var alternate = store(alternateOwner, "outside-store");
        var legacy = booking(store, guest, ServiceTime.now().minusDays(1), Reservation.ReservationStatus.NO_SHOW);
        var memberPage = restrictions.getNoShowMembers(owner, store.getId(), guest.getName(), "all", "count", 0, 1);
        assertThat(memberPage.getTotalElements()).isEqualTo(1);
        assertThat(memberPage.getContent()).singleElement().satisfies(row -> {
            assertThat(row.memberId()).isEqualTo(guest.getId());
            assertThat(row.retainedCount()).isEqualTo(1);
            assertThat(row.recentCount()).isZero();
            assertThat(row.restrictable()).isTrue();
        });
        assertThatThrownBy(() -> restrictions.getNoShowMembers(alternateOwner, store.getId(), "", "all", "recent", 0, 20))
                .isInstanceOf(ReservationException.class);
        assertThatThrownBy(() -> restrictions.restrict(alternateOwner, store.getId(), guest.getId(), 7, false, "테스트 사유"))
                .isInstanceOf(ReservationException.class);
        restrictions.restrict(owner, store.getId(), guest.getId(), 7, false, "테스트 사유");
        var now = ServiceTime.now();
        assertThatThrownBy(() -> restrictions.requireNewReservationAllowed(guest.getId(), store.getId(), now))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatCode(() -> restrictions.requireNewReservationAllowed(guest.getId(), alternate.getId(), now)).doesNotThrowAnyException();
        var row = restrictions.getNoShowMembers(owner, store.getId(), "", "restricted", "recent", 0, 20).getContent().getFirst();
        assertThat(row.manualUntil()).isNotNull();
        assertThat(row.permanent()).isFalse();
        assertThat(row.reason()).isEqualTo("테스트 사유");
        legacy.setUsageEndsAt(now.minusDays(31));
        legacy.setReservationDate(legacy.getUsageEndsAt().toLocalDate());
        reservationRows.flush();
        assertThat(restrictions.getNoShowMembers(owner, store.getId(), guest.getName(), "all", "recent", 0, 20)).isEmpty();
        var masked = restrictions.getNoShowMembers(owner, store.getId(), "", "restricted", "recent", 0, 20).getContent().getFirst();
        assertThat(masked.memberId()).isNull();
        assertThat(masked.name()).isNull();
        assertThat(masked.reason()).isNull();
        assertThat(masked.restrictionId()).isEqualTo(row.restrictionId());
        restrictions.release(owner, store.getId(), masked.restrictionId());
        assertThatCode(() -> restrictions.requireNewReservationAllowed(guest.getId(), store.getId(), now)).doesNotThrowAnyException();
    }

    @Test
    void allStoresPaginatesOwnedStoreAndMemberPairsAndKeepsTheirCountsSeparate() {
        var owner = member("all-stores-owner", Role.ADMIN);
        var guest = member("all-stores-guest", Role.USER);
        var first = store(owner, "first-store");
        var second = store(owner, "second-store");
        var deleted = store(owner, "deleted-store");
        var outside = store(member("all-stores-outside", Role.BUSINESS), "outside-store");
        var now = ServiceTime.now();
        var legacy = Reservation.ReservationStatus.NO_SHOW;
        booking(first, guest, now.minusDays(1), legacy);
        booking(second, guest, now.minusDays(1), legacy);
        booking(deleted, guest, now.minusDays(1), legacy);
        booking(outside, guest, now.minusDays(1), legacy);
        deleted.softDelete();
        records.saveAll(List.of(record(901, guest.getId(), first.getId(), now.minusDays(1)),
                record(902, guest.getId(), first.getId(), now.minusDays(2)), record(903, guest.getId(), first.getId(), now.minusDays(3))));

        var firstPage = restrictions.getNoShowMembers(owner, null, guest.getName(), "all", "count", 0, 1);
        assertThat(firstPage.getTotalElements()).isEqualTo(2);
        assertThat(firstPage.getContent()).singleElement().satisfies(row -> {
            assertThat(row.storeId()).isEqualTo(first.getId());
            assertThat(row.storeName()).isEqualTo(first.getName());
            assertThat(row.memberId()).isEqualTo(guest.getId());
            assertThat(row.recentCount()).isEqualTo(3);
            assertThat(row.automaticUntil()).isNotNull();
        });
        assertThat(restrictions.getNoShowMembers(owner, null, guest.getName(), "all", "count", 1, 1).getContent())
                .singleElement().satisfies(row -> {
                    assertThat(row.storeId()).isEqualTo(second.getId());
                    assertThat(row.retainedCount()).isEqualTo(1);
                    assertThat(row.automaticUntil()).isNull();
                });
        assertThatThrownBy(() -> restrictions.getNoShowMembers(guest, null, "", "all", "recent", 0, 20))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void permanentRestrictionSurvivesRetentionAndRequiresTheMatchingStoreToRelease() {
        var owner = member("permanent-owner", Role.BUSINESS);
        var guest = member("permanent-guest", Role.USER);
        var store = store(owner, "permanent-store");
        var other = store(owner, "permanent-other");
        var now = ServiceTime.now();
        var booking = booking(store, guest, now.minusDays(1), Reservation.ReservationStatus.NO_SHOW);
        assertThatThrownBy(() -> restrictions.restrict(owner, store.getId(), guest.getId(), null, false, "테스트 사유"))
                .isInstanceOfSatisfying(ReservationException.class, error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        restrictions.restrict(owner, store.getId(), guest.getId(), null, true, "테스트 사유");
        restrictions.restrict(owner, store.getId(), guest.getId(), null, true, "테스트 사유");
        assertThat(auditLogs.findAll()).filteredOn(log -> log.getAction().equals("BOOKING_RESTRICTED")).hasSize(1);
        assertThatThrownBy(() -> restrictions.requireNewReservationAllowed(guest.getId(), store.getId(), now.plusYears(10)))
                .isInstanceOfSatisfying(ReservationException.class, error -> {
                    assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(error.getMessage()).contains("영구적으로");
                });
        assertThatCode(() -> restrictions.requireNewReservationAllowed(guest.getId(), other.getId(), now)).doesNotThrowAnyException();

        booking.setUsageEndsAt(now.minusDays(40));
        booking.setReservationDate(booking.getUsageEndsAt().toLocalDate());
        reservationRows.flush();
        restrictions.removeExpiredRecords();
        assertThat(restrictions.getNoShowMembers(owner, null, "", "restricted", "recent", 0, 20).getContent())
                .singleElement().satisfies(row -> {
                    assertThat(row.storeId()).isEqualTo(store.getId());
                    assertThat(row.permanent()).isTrue();
                    assertThat(row.manualUntil()).isNull();
                    assertThat(row.memberId()).isNull();
                    assertThat(row.name()).isNull();
                    assertThat(row.reason()).isNull();
                    restrictions.release(owner, other.getId(), row.restrictionId());
                    assertThatThrownBy(() -> restrictions.requireNewReservationAllowed(guest.getId(), store.getId(), now))
                            .isInstanceOf(ReservationException.class);
                    restrictions.release(owner, row.storeId(), row.restrictionId());
                });
        assertThatCode(() -> restrictions.requireNewReservationAllowed(guest.getId(), store.getId(), now)).doesNotThrowAnyException();
    }

    private Member member(String label, Role role) {
        return members.save(Member.builder().name(label).email(label + "@example.test").role(role).build());
    }

    private Store store(Member owner, String name) {
        return stores.save(Store.builder().owner(owner).name(name).build());
    }

    private Reservation booking(Store store, Member member, LocalDateTime endsAt, Reservation.ReservationStatus status) {
        return reservationRows.saveAndFlush(Reservation.builder().store(store).member(member).status(status)
                .reservationDate(endsAt.toLocalDate()).reservationTime(endsAt.toLocalTime().minusHours(1))
                .usageEndsAt(endsAt).guestCount(1).build());
    }

    private static ReservationNoShowRecord record(long reservation, long member, long store, LocalDateTime at) {
        return new ReservationNoShowRecord(reservation, member, store, at);
    }
}
