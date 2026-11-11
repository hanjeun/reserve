package kr.it.reserve.notification;

import jakarta.persistence.EntityManager;
import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.notification.entity.ReservationNotification.Kind;
import kr.it.reserve.notification.service.ReservationNotificationDispatcher;
import kr.it.reserve.notification.service.ReservationNotificationService;
import kr.it.reserve.notification.service.ReservationNotificationService.Item;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationUpdates;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:reservation-notification;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "reserve.scheduling.enabled=false"
})
@AutoConfigureMockMvc
@RecordApplicationEvents
@Transactional
class ReservationNotificationIntegrationTest {
    private static final String INBOX = "/api/chat/notifications";
    @Autowired EntityManager entityManager;
    @Autowired ReservationUpdates reservationUpdates;
    @Autowired ReservationNotificationService notifications;
    @Autowired ReservationNotificationDispatcher dispatcher;
    @Autowired MockMvc mvc;
    @Autowired ApplicationEvents events;

    @Test
    void deliversOnlyOnceToEachRecipientAndExposesPrivateDetailsThroughChat() throws Exception {
        Member customer = member("customer", Role.USER);
        Member owner = member("owner", Role.BUSINESS);
        Member outsider = member("outsider", Role.ADMIN);
        Reservation reservation = reservation(customer, owner);
        LocalDateTime endedAt = ServiceTime.now().minusDays(31);
        reservation.setReservationDate(endedAt.toLocalDate());
        reservation.setUsageEndsAt(endedAt);
        reservation.setSpecialRequest("알림 검사 요청");

        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);
        reservationUpdates.approved(reservation);
        reservation.setReservationTime(LocalTime.of(13, 0));
        reservationUpdates.rescheduled(reservation);
        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
        reservationUpdates.cancelled(reservation);
        assertThat(notifications.unread(customer)).isZero();

        dispatcher.dispatch();
        dispatcher.dispatch();
        var customerItems = notifications.inbox(customer, null).items();
        var ownerItems = notifications.inbox(owner, null).items();
        assertThat(customerItems).extracting(Item::kind).containsExactly(Kind.CANCELLED, Kind.CHANGED, Kind.APPROVED);
        assertThat(ownerItems).extracting(Item::kind).containsExactly(Kind.CANCELLED, Kind.CHANGED);
        assertThat(customerItems.getLast().reservationTime()).isEqualTo(LocalTime.NOON);
        assertThat(ownerItems.getFirst().reservationTime()).isEqualTo(LocalTime.of(13, 0));
        assertThat(notifications.inbox(outsider, null).items()).isEmpty();
        assertThat(events.stream(EntityUpdates.Change.class)
                .filter(change -> change.domain() == EntityUpdates.Domain.SYSTEM_NOTIFICATION).toList())
                .hasSize(5).allSatisfy(change -> {
                    assertThat(change.members()).hasSize(1).doesNotContain(outsider.getId());
                    assertThat(change.publiclyVisible() || change.administrators()).isFalse();
                    assertThat(change.entityId()).isZero();
                });

        long customerItem = customerItems.getFirst().id();
        long ownerItem = ownerItems.getFirst().id();
        String detail = INBOX + "/" + ownerItem + "/reservation";
        mvc.perform(get("/api/chat/unread").param("split", "true").with(signedIn(customer)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.messages").value(0))
                .andExpect(jsonPath("$.data.notifications").value(3));
        mvc.perform(get(INBOX)).andExpect(status().isUnauthorized());
        mvc.perform(get(INBOX).with(signedIn(customer)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.items[0].kind").value("CANCELLED"))
                .andExpect(jsonPath("$.data.items[0].specialRequest").doesNotExist());
        mvc.perform(get(detail).with(signedIn(outsider))).andExpect(status().isNotFound());
        mvc.perform(get(detail).with(signedIn(owner))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.personalInfoHidden").value(true))
                .andExpect(jsonPath("$.data.memberEmail").doesNotExist())
                .andExpect(jsonPath("$.data.specialRequest").doesNotExist());
        mvc.perform(get(INBOX + "/" + customerItem + "/reservation").with(signedIn(customer)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.personalInfoHidden").value(false))
                .andExpect(jsonPath("$.data.specialRequest").value("알림 검사 요청"));

        String read = "{\"ids\":[" + customerItem + "," + ownerItem + "]}";
        mvc.perform(post(INBOX + "/read").param("split", "true").with(signedIn(customer)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(read))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.changed").value(1))
                .andExpect(jsonPath("$.data.unread").value(2));
        mvc.perform(post(INBOX + "/read").with(signedIn(customer)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(read))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").value(0));
        assertThat(notifications.read(customer, List.of(customerItem))).isZero();
        assertThat(notifications.unread(customer)).isEqualTo(2);
        assertThat(notifications.unread(owner)).isEqualTo(2);

        reservation.getStore().setOwner(outsider);
        entityManager.flush();
        assertThat(notifications.read(owner, List.of(ownerItem))).isZero();
        assertThat(notifications.unread(owner)).isZero();
        mvc.perform(get(detail).with(signedIn(owner))).andExpect(status().isNotFound());
        mvc.perform(get(detail).with(signedIn(outsider))).andExpect(status().isNotFound());
    }

    @Test
    void cursorKeepsEveryDeliveredNotificationReachable() {
        Member customer = member("cursor", Role.USER);
        Reservation reservation = reservation(customer, member("cursor-owner", Role.BUSINESS));
        for (int index = 0; index <= ReservationNotificationService.PAGE_SIZE; index++) {
            reservationUpdates.approved(reservation);
        }
        dispatcher.dispatch();

        var latest = notifications.inbox(customer, null);
        var older = notifications.inbox(customer, latest.nextBefore());
        assertThat(latest.items()).hasSize(ReservationNotificationService.PAGE_SIZE);
        assertThat(older.items()).hasSize(1).allSatisfy(item -> assertThat(item.id()).isLessThan(latest.nextBefore()));
        assertThat(older.nextBefore()).isNull();
    }

    @Test
    void rollbackDiscardsPendingDeliveryAlongWithReservationChange() {
        Member customer = member("rollback", Role.USER);
        Reservation reservation = reservation(customer, member("rollback-owner", Role.BUSINESS));
        Long customerId = customer.getId();
        reservationUpdates.cancelled(reservation);
        TestTransaction.flagForRollback();
        TestTransaction.end();

        dispatcher.dispatch();
        assertThat(notifications.due(LocalDateTime.now().plusDays(1))).isEmpty();
        assertThat(entityManager.find(Member.class, customerId)).isNull();
    }

    private Member member(String label, Role role) {
        var member = Member.builder().name("알림 검사").email(label + "@example.test").role(role).termsAgreed(true).build();
        entityManager.persist(member);
        return member;
    }

    private Reservation reservation(Member customer, Member owner) {
        var store = Store.builder().name("알림 검사 가게").owner(owner).build();
        entityManager.persist(store);
        var reservation = Reservation.builder().member(customer).store(store).reservationDate(LocalDate.of(2030, 1, 1))
                .reservationTime(LocalTime.NOON).guestCount(1).status(Reservation.ReservationStatus.PENDING).build();
        entityManager.persist(reservation);
        return reservation;
    }

    private static RequestPostProcessor signedIn(Member member) {
        var authority = new SimpleGrantedAuthority("ROLE_" + member.getRole().name());
        return authentication(UsernamePasswordAuthenticationToken.authenticated(member, null, List.of(authority)));
    }
}
