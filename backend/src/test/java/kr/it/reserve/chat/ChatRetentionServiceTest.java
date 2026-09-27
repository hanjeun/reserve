package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.chat.service.ChatRetentionService;
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
    private final ChatRetentionService service = new ChatRetentionService(rooms, messages, reports, evidence, deletions);
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
    @Test void legacyReportHoldsOriginalAndBoundaryDoesNotExpireEarly() {
        var photo = message(90);
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(messages.findByIdAndRoomId(33L, 10L)).thenReturn(Optional.of(photo));
        service.purge(10L, 33L, now);
        assertThat(photo.isPurged()).isFalse();
        var older = message(91);
        when(messages.findByIdAndRoomId(33L, 10L)).thenReturn(Optional.of(older));
        when(reports.countLegacyEvidenceHolds(10L)).thenReturn(1L);
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
