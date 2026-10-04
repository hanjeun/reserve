package kr.it.reserve.chat;

import jakarta.persistence.EntityManager;
import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class ChatVisibilityQueryTest {
    @Autowired ChatRoomRepository rooms;
    @Autowired ChatMessageRepository messages;
    @Autowired ChatReportRepository reports;
    @Autowired ChatReportEvidenceRepository evidence;
    @Autowired ChatReportAccessAuditRepository audits;
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
        var now = LocalDateTime.now();
        setSentAt(original, now.minusDays(91));
        assertThat(messages.findExpired(now.minusDays(90), ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES, now, PageRequest.of(0, 50)))
                .extracting(ChatMessageRepository.RetentionCandidate::getId).contains(original.getId());
        ChatReport report = reports.save(ChatReport.builder().room(room).messageId(original.getId()).reporterMemberId(member.getId())
                .reporterRole(SenderRole.MEMBER).reason(ChatReport.Reason.SPAM).reportKey("legacy").build());
        reports.flush();
        assertThat(reports.countLegacyEvidenceHolds(room.getId())).isEqualTo(1);
        assertThat(messages.findExpired(now.minusDays(90), ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES, now, PageRequest.of(0, 50))).isEmpty();
        evidence.save(ChatReportEvidence.capture(report.getId(), original, LocalDateTime.now()));
        original.purge(LocalDateTime.now(), 1);
        messages.flush(); evidence.flush(); entityManager.clear();
        assertThat(messages.findById(original.getId()).orElseThrow().getContent()).isEmpty();
        assertThat(evidence.findByReportIdAndMessageId(report.getId(), original.getId()).orElseThrow().getContent()).isEqualTo("보존 원문");
    }

    @Test void retentionQueriesHoldUnclassifiedRowsAndBulkExpiryKeepsRecentAccessAndOtherSnapshots() {
        var now = LocalDateTime.now();
        Member member = members.save(Member.builder().name("손님").email("retention-query@example.invalid").build());
        ChatRoom room = rooms.save(ChatRoom.builder().member(member).build());
        var original = messages.save(ChatMessage.builder().room(room).senderRole(SenderRole.MEMBER)
                .createdAt(now.minusDays(100)).content("증거").imageKey("users/1/chat/10/evidence.bin").build());
        messages.flush();
        setSentAt(original, now.minusDays(100));
        var general = reports.save(ChatReport.builder().room(room).reporterMemberId(member.getId())
                .reporterRole(SenderRole.MEMBER).reason(ChatReport.Reason.OTHER).reportKey("retention-general")
                .retentionCategory(ChatReport.RetentionCategory.GENERAL_REPORT).status(ChatReport.Status.RESOLVED)
                .reviewedAt(now.minusYears(2)).evidenceCapturedAt(now.minusYears(2)).build());
        var unclassified = reports.save(ChatReport.builder().room(room).reporterMemberId(member.getId())
                .reporterRole(SenderRole.MEMBER).reason(ChatReport.Reason.OTHER).reportKey("retention-unknown")
                .status(ChatReport.Status.RESOLVED).reviewedAt(now.minusYears(8)).evidenceCapturedAt(now).build());
        evidence.save(ChatReportEvidence.capture(general.getId(), original, now));
        evidence.save(ChatReportEvidence.capture(unclassified.getId(), original, now));
        var expired = audit(general.getId(), now.minusYears(2));
        var recent = audit(general.getId(), now.minusDays(2));
        audit(unclassified.getId(), now.minusYears(5));
        entityManager.flush();

        assertThat(reports.findRoomIdById(general.getId())).contains(room.getId());
        assertThat(messages.findExpired(now.minusDays(90), ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES, now, PageRequest.of(0, 1))).isEmpty();
        assertThat(reports.findRetentionCandidates(ChatRetentionPolicy.TERMINAL_STATUSES,
                ChatReport.RetentionCategory.GENERAL_REPORT, now.minusYears(1),
                ChatReport.RetentionCategory.CONSUMER_DISPUTE, now.minusYears(3),
                ChatReport.RetentionCategory.CONTRACT_PAYMENT, now.minusYears(5).minusDays(1), now, PageRequest.of(0, 1)))
                .extracting(ChatReportRepository.RetentionCandidate::getId).containsExactly(general.getId());
        assertThat(audits.findRetentionCandidates(now.minusYears(1), ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatReport.RetentionCategory.UNCLASSIFIED, PageRequest.of(0, 1)))
                .extracting(ChatReportAccessAuditRepository.RetentionCandidate::getId).containsExactly(expired.getId());
        assertThat(messages.existsByImageKey(original.getImageKey())).isTrue();
        assertThat(evidence.existsByImageKeyAndReportIdNot(original.getImageKey(), general.getId())).isTrue();

        evidence.deleteByReportId(general.getId());
        audits.deleteExpiredByReportId(general.getId(), now.minusYears(1));
        entityManager.flush();
        entityManager.clear();
        assertThat(evidence.findByReportIdOrderByMessageIdAsc(general.getId())).isEmpty();
        assertThat(evidence.findByReportIdOrderByMessageIdAsc(unclassified.getId())).hasSize(1);
        assertThat(audits.findById(expired.getId())).isEmpty();
        assertThat(audits.findById(recent.getId())).isPresent();
    }

    private ChatReportAccessAudit audit(Long reportId, LocalDateTime at) {
        var audit = new ChatReportAccessAudit(reportId, 7L, null, ChatReportAccessAudit.Action.CONTEXT);
        ReflectionTestUtils.setField(audit, "accessedAt", at);
        return audits.save(audit);
    }

    /** @CreatedDate가 생성 시각을 덮으므로 실제 과거 전송일을 DB fixture로 고정한다. */
    private void setSentAt(ChatMessage message, LocalDateTime at) {
        entityManager.createQuery("UPDATE ChatMessage m SET m.createdAt = :at WHERE m.id = :id")
                .setParameter("at", at).setParameter("id", message.getId()).executeUpdate();
        entityManager.refresh(message);
    }
}
