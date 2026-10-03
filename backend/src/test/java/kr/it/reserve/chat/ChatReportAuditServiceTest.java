package kr.it.reserve.chat;

import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.repository.ChatReportAccessAuditRepository;
import kr.it.reserve.chat.service.ChatReportAuditService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class ChatReportAuditServiceTest {
    private final ChatReportAccessAuditRepository audits = mock(ChatReportAccessAuditRepository.class);
    private final ChatReportAuditService service = new ChatReportAuditService(audits);

    @ParameterizedTest
    @EnumSource(ChatReportAccessAudit.Action.class)
    void administratorAccessRecordsThePurposeAndTarget(ChatReportAccessAudit.Action action) {
        Member admin = Member.builder().id(90L).role(Role.ADMIN).build();
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.recordAccess(admin, 10L, 20L, action);

        ArgumentCaptor<ChatReportAccessAudit> saved = ArgumentCaptor.forClass(ChatReportAccessAudit.class);
        verify(audits).save(saved.capture());
        ChatReportAccessAudit audit = saved.getValue();
        assertThat(audit.getReportId()).isEqualTo(10L);
        assertThat(audit.getAdminMemberId()).isEqualTo(90L);
        assertThat(audit.getMessageId()).isEqualTo(20L);
        assertThat(audit.getAction()).isEqualTo(action);
        assertThat(audit.getPurpose()).isEqualTo("REPORT_REVIEW");
        assertThat(audit.getAccessedAt()).isBetween(started, LocalDateTime.now(Clock.systemDefaultZone()));
    }

    @Test
    void ordinaryMemberCannotCreateAnAdministratorAccessRecord() {
        Member member = Member.builder().id(7L).role(Role.USER).build();

        assertThatThrownBy(() -> service.recordAccess(member, 10L, 20L, ChatReportAccessAudit.Action.IMAGE))
                .isInstanceOf(ChatException.class).hasMessage("접근 권한이 없습니다.");

        verifyNoInteractions(audits);
    }
}
