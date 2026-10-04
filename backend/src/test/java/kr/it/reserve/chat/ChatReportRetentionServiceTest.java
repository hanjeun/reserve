package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.UpdateChatReportRetentionRequest;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.repository.ChatReportAccessAuditRepository;
import kr.it.reserve.chat.repository.ChatReportRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatReportRetentionService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class ChatReportRetentionServiceTest {
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final ChatReportRepository reports = mock(ChatReportRepository.class);
    private final ChatReportAccessAuditRepository audits = mock(ChatReportAccessAuditRepository.class);
    private final ChatReportRetentionService service = new ChatReportRetentionService(rooms, reports, audits);
    private final Member admin = Member.builder().id(7L).role(Role.ADMIN).build();

    @Test void ordinaryMemberCannotReadOrChangeRetentionMetadata() {
        var member = Member.builder().id(9L).role(Role.USER).build();
        assertThatThrownBy(() -> service.get(member, 5L)).isInstanceOf(ChatException.class);
        assertThatThrownBy(() -> service.update(member, 5L, request(ChatReport.RetentionCategory.GENERAL_REPORT)))
                .isInstanceOf(ChatException.class);
        verifyNoInteractions(rooms, reports, audits);
    }

    @Test void unclassifiedReleaseAndContractWithoutActualBasisAreRejected() {
        assertThatThrownBy(() -> service.update(admin, 5L, request(ChatReport.RetentionCategory.UNCLASSIFIED)))
                .isInstanceOf(ChatException.class);
        assertThatThrownBy(() -> service.update(admin, 5L, request(ChatReport.RetentionCategory.CONTRACT_PAYMENT)))
                .isInstanceOf(ChatException.class);
        verifyNoInteractions(rooms, reports, audits);
    }

    @Test void acceptedAdminClassificationUsesRoomThenReportLockAndRecordsAccessInSameTransaction() {
        var room = ChatRoom.builder().id(10L).build();
        var report = ChatReport.builder().id(5L).room(room).build();
        when(reports.findRoomIdById(5L)).thenReturn(Optional.of(10L));
        when(rooms.findByIdForUpdate(10L)).thenReturn(Optional.of(room));
        when(reports.findByIdForUpdate(5L)).thenReturn(Optional.of(report));
        var request = request(ChatReport.RetentionCategory.CONTRACT_PAYMENT);
        request.setRetentionBasisAt(OffsetDateTime.parse("2026-04-01T00:00:00+09:00"));
        var response = service.update(admin, 5L, request);
        var calls = inOrder(rooms, reports, audits);
        calls.verify(reports).findRoomIdById(5L);
        calls.verify(rooms).findByIdForUpdate(10L);
        calls.verify(reports).findByIdForUpdate(5L);
        calls.verify(audits).save(argThat(audit -> audit.getAction() == ChatReportAccessAudit.Action.RETENTION_CHANGE
                && audit.getAdminMemberId().equals(7L) && audit.getReportId().equals(5L)));
        assertThat(response.retentionBasisAt()).isEqualTo(OffsetDateTime.parse("2026-03-31T15:00:00Z"));
        assertThat(response.minimumRetentionUntil()).isEqualTo(response.retentionBasisAt().plusYears(5).plusDays(1));
        assertThat(response.changedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(response.note()).isEqualTo("기산 근거");
    }

    private UpdateChatReportRetentionRequest request(ChatReport.RetentionCategory category) {
        var request = new UpdateChatReportRetentionRequest();
        request.setCategory(category);
        request.setHold(false);
        request.setNote(" 기산 근거 ");
        return request;
    }
}
