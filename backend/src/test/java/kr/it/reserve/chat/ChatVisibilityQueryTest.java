package kr.it.reserve.chat;

import jakarta.persistence.EntityManager;
import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import java.time.LocalDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class ChatVisibilityQueryTest {
    @Autowired ChatRoomRepository rooms;
    @Autowired ChatMessageRepository messages;
    @Autowired ChatReportRepository reports;
    @Autowired ChatReportEvidenceRepository evidence;
    @Autowired MemberRepository members;
    @Autowired EntityManager entityManager;

    @Test void hidingDoesNotChangeOtherSideOrPageTotalsAndNewMessagesRestoreTheList() {
        Member member = members.save(Member.builder().name("손님").email("visibility@example.invalid").build());
        ChatRoom room = rooms.save(ChatRoom.builder().member(member).type(ChatRoom.RoomType.STORE).storeId(5L)
                .lastMessageAt(LocalDateTime.now()).build());
        room.setHidden(SenderRole.MEMBER, true, member.getId(), LocalDateTime.now());
        rooms.flush();
        var page = PageRequest.of(0, 20);
        assertThat(rooms.findForMember(member.getId(), page).getTotalElements()).isZero();
        assertThat(rooms.findHiddenForMember(member.getId(), page).getTotalElements()).isEqualTo(1);
        assertThat(rooms.findVisibleStoreInbox(ChatRoom.RoomType.STORE, List.of(5L), 99L, false, page).getTotalElements()).isEqualTo(1);
        room.setHidden(SenderRole.OWNER, true, 99L, LocalDateTime.now());
        rooms.flush();
        assertThat(rooms.findVisibleStoreInbox(ChatRoom.RoomType.STORE, List.of(5L), 99L, true, page).getTotalElements()).isEqualTo(1);
        assertThat(rooms.findVisibleStoreInbox(ChatRoom.RoomType.STORE, List.of(5L), 100L, false, page).getTotalElements()).isEqualTo(1);
        room.onMessageSent(SenderRole.OWNER, LocalDateTime.now(), "새 메시지");
        rooms.flush();
        assertThat(rooms.findForMember(member.getId(), page).getTotalElements()).isEqualTo(1);
        assertThat(rooms.findHiddenForMember(member.getId(), page).getTotalElements()).isZero();
    }
    @Test void reportSnapshotSurvivesOriginalExpiryAndLegacyHoldsAreExcludedFromBatch() {
        Member member = members.save(Member.builder().name("손님").email("evidence@example.invalid").build());
        ChatRoom room = rooms.save(ChatRoom.builder().member(member).build());
        ChatMessage original = messages.save(ChatMessage.builder().room(room).senderRole(SenderRole.MEMBER)
                .createdAt(LocalDateTime.now().minusDays(91)).content("보존 원문").build());
        messages.flush();
        assertThat(messages.findExpired(LocalDateTime.now().plusDays(1), PageRequest.of(0, 50))).extracting(ChatMessage::getId).contains(original.getId());
        ChatReport report = reports.save(ChatReport.builder().room(room).messageId(original.getId()).reporterMemberId(member.getId())
                .reporterRole(SenderRole.MEMBER).reason(ChatReport.Reason.SPAM).reportKey("legacy").build());
        reports.flush();
        assertThat(reports.countLegacyEvidenceHolds(room.getId())).isEqualTo(1);
        assertThat(messages.findExpired(LocalDateTime.now().plusDays(1), PageRequest.of(0, 50))).isEmpty();
        evidence.save(ChatReportEvidence.capture(report.getId(), original, LocalDateTime.now()));
        original.purge(LocalDateTime.now(), 1);
        messages.flush(); evidence.flush(); entityManager.clear();
        assertThat(messages.findById(original.getId()).orElseThrow().getContent()).isEmpty();
        assertThat(evidence.findByReportIdAndMessageId(report.getId(), original.getId()).orElseThrow().getContent()).isEqualTo("보존 원문");
    }
}
