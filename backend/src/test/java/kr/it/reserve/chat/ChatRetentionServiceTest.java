package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.chat.service.ChatRetentionService;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatRetentionServiceTest {
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ChatReportRepository reports = mock(ChatReportRepository.class);
    private final ChatReportEvidenceRepository evidence = mock(ChatReportEvidenceRepository.class);
    private final FileDeletionOutboxService deletions = mock(FileDeletionOutboxService.class);
    private final ChatReportAccessAuditRepository audits = mock(ChatReportAccessAuditRepository.class);
    private final ChatRetentionPolicy policy = new ChatRetentionPolicy(true, "2026-08-01T00:00:00Z", "1");
    private final ChatRetentionService service = new ChatRetentionService(rooms, messages, reports, evidence, deletions, audits, policy);
    private final LocalDateTime now = LocalDateTime.of(2026, 9, 27, 12, 0);
    private final ChatRoom room = ChatRoom.builder().id(10L).member(Member.builder().id(1L).build()).build();

    @Test void expiresOriginalButKeepsStableIdAndReportedPhoto() {
        var photo = message(91);
        var captured = ChatReportEvidence.capture(5L, photo, now);
        when(evidence.existsByImageKey(photo.getImageKey())).thenReturn(true);
        prepare(photo);
        service.purge(10L, 33L, now);
        assertThat(photo.getContent()).isEmpty();
        assertThat(photo.getImageKey()).isNull();
        assertThat(photo.getId()).isEqualTo(33L);
        assertThat(photo.isPurged()).isTrue();
        assertThat(captured.getContent()).isEqualTo("原文");
        assertThat(captured.getImageKey()).isEqualTo("users/1/chat/10/photo.bin");
        assertThat(room.getLastMessagePreview()).contains("보존 기간");
        verifyNoInteractions(deletions);
    }
    @Test void unreportedPhotoIsQueuedAndRepeatedPurgeIsIdempotent() {
        var photo = message(91);
        prepare(photo);
        service.purge(10L, 33L, now);
        service.purge(10L, 33L, now);
        verify(deletions, times(1)).enqueue("users/1/chat/10/photo.bin", "CHAT_RETENTION", 33L);
        assertThat(room.getRetractionRevision()).isEqualTo(1);
    }
    @Test void expiringMessageKeepsPhotoStillReferencedByAnotherMessage() {
        var photo = message(91);
        prepare(photo);
        when(messages.existsByImageKeyAndIdNot(photo.getImageKey(), photo.getId())).thenReturn(true);
        service.purge(10L, 33L, now);
        assertThat(photo.isPurged()).isTrue();
        verifyNoInteractions(deletions);
    }
    @Test void legacyReportHoldsOriginalAndBoundaryDoesNotExpireEarly() {
        var photo = message(90);
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(messages.findByIdAndRoomId(33L, 10L)).thenReturn(Optional.of(photo));
        service.purge(10L, 33L, now);
        assertThat(photo.isPurged()).isFalse();
        var older = message(91);
        when(messages.findByIdAndRoomId(33L, 10L)).thenReturn(Optional.of(older));
        when(reports.countOriginalRetentionHolds(10L, ChatRetentionPolicy.ACTIVE_STATUSES,
                ChatRetentionPolicy.ORIGINAL_HOLD_CATEGORIES, now)).thenReturn(1L);
        service.purge(10L, 33L, now);
        assertThat(older.isPurged()).isFalse();
        verifyNoInteractions(deletions);
    }
    @Test void outboxFailureDoesNotMaskOriginalBeforeQueueing() {
        var photo = message(91);
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(messages.findByIdAndRoomId(33L, 10L)).thenReturn(Optional.of(photo));
        doThrow(new IllegalStateException("queue unavailable")).when(deletions).enqueue(any(), any(), any());
        assertThatThrownBy(() -> service.purge(10L, 33L, now)).isInstanceOf(IllegalStateException.class);
        assertThat(photo.isPurged()).isFalse();
    }

    @Test void directPurgeCannotBypassMissingPublicationOrGrace() {
        var unpublished = new ChatRetentionService(rooms, messages, reports, evidence, deletions, audits,
                new ChatRetentionPolicy(true, "", "1"));
        unpublished.purge(10L, 33L, now);
        unpublished.purgeReport(10L, 5L, now);
        unpublished.purgeAccessAudit(8L, now);
        var grace = new ChatRetentionService(rooms, messages, reports, evidence, deletions, audits,
                new ChatRetentionPolicy(true, "2026-09-01T00:00:00Z", "1"));
        grace.purge(10L, 33L, now);
        grace.purgeReport(10L, 5L, now);
        grace.purgeAccessAudit(8L, now);
        verifyNoInteractions(rooms, messages, reports, evidence, deletions, audits);
    }

    @Test void expiredSnapshotKeepsReferencedPhotoAndDeletesOnlyExpiredAccessAudits() {
        var report = expiredReport();
        var snapshot = ChatReportEvidence.capture(5L, message(91), now.minusYears(2));
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(reports.findByIdForUpdate(5L)).thenReturn(Optional.of(report));
        when(evidence.findByReportIdOrderByMessageIdAsc(5L)).thenReturn(List.of(snapshot));
        when(messages.existsByImageKey(snapshot.getImageKey())).thenReturn(true);
        service.purgeReport(10L, 5L, now);
        verifyNoInteractions(deletions);
        verify(evidence).deleteByReportId(5L);
        verify(audits).deleteExpiredByReportId(5L, now.minusYears(1));
        verify(reports).delete(report);
        when(messages.existsByImageKey(snapshot.getImageKey())).thenReturn(false);
        when(evidence.existsByImageKeyAndReportIdNot(snapshot.getImageKey(), 5L)).thenReturn(true);
        service.purgeReport(10L, 5L, now);
        verifyNoInteractions(deletions);
        when(evidence.existsByImageKeyAndReportIdNot(snapshot.getImageKey(), 5L)).thenReturn(false);
        service.purgeReport(10L, 5L, now);
        verify(deletions).enqueue(snapshot.getImageKey(), "CHAT_REPORT_RETENTION", 5L);
    }

    @Test void snapshotOutboxFailureLeavesReportAndEvidenceIntact() {
        var report = expiredReport();
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(reports.findByIdForUpdate(5L)).thenReturn(Optional.of(report));
        when(evidence.findByReportIdOrderByMessageIdAsc(5L)).thenReturn(List.of(
                ChatReportEvidence.capture(5L, message(91), now.minusYears(2))));
        doThrow(new IllegalStateException("queue unavailable")).when(deletions).enqueue(any(), any(), any());
        assertThatThrownBy(() -> service.purgeReport(10L, 5L, now)).isInstanceOf(IllegalStateException.class);
        verify(evidence, never()).deleteByReportId(any());
        verify(reports, never()).delete(any(ChatReport.class));
        verifyNoInteractions(audits);
    }

    @Test void accessAuditCannotBypassDisputeHoldEvenAfterItsMinimumAge() {
        var audit = new ChatReportAccessAudit(5L, 7L, null, ChatReportAccessAudit.Action.CONTEXT);
        var report = expiredReport();
        report.changeRetention(ChatReport.RetentionCategory.GENERAL_REPORT, true, null, "진행 중", 7L, now);
        when(audits.findById(8L)).thenReturn(Optional.of(audit));
        when(reports.findRoomIdById(5L)).thenReturn(Optional.of(10L));
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(reports.findByIdForUpdate(5L)).thenReturn(Optional.of(report));
        service.purgeAccessAudit(8L, now.plusYears(3));
        verify(audits, never()).delete(any());
        verify(audits, never()).findByIdForUpdate(any());
    }

    private ChatReport expiredReport() {
        return ChatReport.builder().id(5L).room(room).status(ChatReport.Status.RESOLVED)
                .retentionCategory(ChatReport.RetentionCategory.GENERAL_REPORT).reviewedAt(now.minusYears(2)).build();
    }
    private void prepare(ChatMessage photo) {
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(messages.findByIdAndRoomId(33L, 10L)).thenReturn(Optional.of(photo));
        when(messages.findLatestByRoomIds(List.of(10L))).thenReturn(List.of(photo));
    }
    private ChatMessage message(int age) {
        return ChatMessage.builder().id(33L).room(room).senderMemberId(1L).senderRole(SenderRole.MEMBER)
                .content("原文").imageKey("users/1/chat/10/photo.bin").createdAt(now.minusDays(age)).build();
    }
}
