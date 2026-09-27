package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.CreateChatReportRequest;
import kr.it.reserve.chat.dto.ReviewChatReportRequest;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatReportRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatModerationService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatModerationServiceTest {

    @Mock ChatRoomRepository roomRepository;
    @Mock ChatMessageRepository messageRepository;
    @Mock ChatReportRepository reportRepository;
    @Mock StoreRepository storeRepository;
    @InjectMocks ChatModerationService service;

    @Test
    void memberCanBlockAStoreRoomAndOwnerCannotClearTheMemberFlag() {
        Member customer = member(7L);
        Member owner = businessMember(8L);
        ChatRoom room = room(customer);
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(storeRepository.findById(31L)).thenReturn(Optional.of(store(owner)));

        service.setBlocked(customer, 21L, "MEMBER", true);
        var ownerState = service.setBlocked(owner, 21L, "OWNER", false);

        assertThat(ownerState.isBlocked()).isTrue();
        assertThat(ownerState.isBlockedByMe()).isFalse();
        assertThat(room.isBlockedBy(SenderRole.MEMBER)).isTrue();
    }

    @Test
    void roleDemotedOwnerCannotBlockOrReportAStoreConversation() {
        Member formerOwner = member(8L);
        ChatRoom room = room(member(7L));
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> service.setBlocked(formerOwner, 21L, "OWNER", true))
                .isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN);
        assertThatThrownBy(() -> service.createReport(
                formerOwner, 21L, "OWNER", reportRequest(null, ChatReport.Reason.SPAM, null)))
                .isInstanceOf(ChatException.class)
                .extracting("status").isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN);
        verify(storeRepository, never()).findById(31L);
        verify(reportRepository, never()).save(any(ChatReport.class));
    }

    @Test
    void reportAcceptsOnlyAnOpponentsMessageAndDeduplicatesTheTarget() {
        Member customer = member(7L);
        ChatRoom room = room(customer);
        ChatMessage ownerMessage = ChatMessage.builder()
                .id(90L).room(room).senderRole(SenderRole.OWNER).senderMemberId(8L)
                .content("신고 대상").build();
        CreateChatReportRequest request = reportRequest(90L, ChatReport.Reason.SPAM, null);
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messageRepository.findByIdAndRoomId(90L, 21L)).thenReturn(Optional.of(ownerMessage));
        when(reportRepository.findByReportKey("21:7:MEMBER:90")).thenReturn(Optional.empty());
        when(reportRepository.save(any(ChatReport.class))).thenAnswer(call -> call.getArgument(0));

        var created = service.createReport(customer, 21L, "MEMBER", request);

        assertThat(created.getReason()).isEqualTo("SPAM");
        verify(reportRepository).save(any(ChatReport.class));

        ChatReport existing = ChatReport.builder()
                .id(5L).room(room).messageId(90L).reporterMemberId(7L)
                .reporterRole(SenderRole.MEMBER).reason(ChatReport.Reason.SPAM)
                .reportKey("21:7:MEMBER:90").build();
        when(reportRepository.findByReportKey("21:7:MEMBER:90")).thenReturn(Optional.of(existing));

        assertThat(service.createReport(customer, 21L, "MEMBER", request).getId()).isEqualTo(5L);
    }

    @Test
    void reportRejectsTheReportersOwnMessage() {
        Member customer = member(7L);
        ChatRoom room = room(customer);
        ChatMessage ownMessage = ChatMessage.builder()
                .id(90L).room(room).senderRole(SenderRole.MEMBER).senderMemberId(7L)
                .content("내 메시지").build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messageRepository.findByIdAndRoomId(90L, 21L)).thenReturn(Optional.of(ownMessage));

        assertThatThrownBy(() -> service.createReport(
                customer, 21L, "MEMBER", reportRequest(90L, ChatReport.Reason.SPAM, null)))
                .hasMessageContaining("상대방");
        verify(reportRepository, never()).save(any(ChatReport.class));
    }

    @Test
    void closingAReportRequiresAnAccountableReason() {
        ChatRoom room = room(member(7L));
        ChatReport report = ChatReport.builder()
                .id(5L).room(room).reporterMemberId(7L).reporterRole(SenderRole.MEMBER)
                .reason(ChatReport.Reason.OTHER).reportKey("key").build();
        ReviewChatReportRequest request = new ReviewChatReportRequest();
        request.setStatus(ChatReport.Status.RESOLVED);
        when(reportRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(report));

        assertThatThrownBy(() -> service.reviewReport(member(1L), 5L, request))
                .hasMessageContaining("완료 사유");
    }

    @Test
    void adminContextIsReadOnlyAndReturnsChronologicalRecentMessages() {
        ChatRoom room = room(member(7L));
        ChatMessage older = ChatMessage.builder()
                .id(89L).room(room).senderRole(SenderRole.OWNER).content("먼저 보낸 답").build();
        ChatMessage reported = ChatMessage.builder()
                .id(90L).room(room).senderRole(SenderRole.MEMBER).content("신고 대상").build();
        ChatReport report = ChatReport.builder()
                .id(5L).room(room).messageId(90L).reporterMemberId(8L)
                .reporterRole(SenderRole.OWNER).reason(ChatReport.Reason.FRAUD)
                .reportKey("key").build();
        when(reportRepository.findById(5L)).thenReturn(Optional.of(report));
        when(messageRepository.findByRoomIdOrderByIdDesc(21L, PageRequest.of(0, 50)))
                .thenReturn(new SliceImpl<>(List.of(reported, older)));
        when(messageRepository.findByIdAndRoomId(90L, 21L)).thenReturn(Optional.of(reported));

        var context = service.reportContext(5L);

        assertThat(context.getReportedMessage().getId()).isEqualTo(90L);
        assertThat(context.getRecentMessages()).extracting("id").containsExactly(89L, 90L);
        verify(roomRepository, never()).findByIdForUpdate(any());
    }

    private CreateChatReportRequest reportRequest(
            Long messageId, ChatReport.Reason reason, String details) {
        CreateChatReportRequest request = new CreateChatReportRequest();
        request.setMessageId(messageId);
        request.setReason(reason);
        request.setDetails(details);
        return request;
    }

    private ChatRoom room(Member customer) {
        return ChatRoom.builder()
                .id(21L).member(customer).type(ChatRoom.RoomType.STORE)
                .storeId(31L).storeNameSnapshot("가게31")
                .build();
    }

    private Member member(Long id) {
        return Member.builder().id(id).name("회원" + id).email("member" + id + "@example.com").build();
    }

    private Member businessMember(Long id) {
        return Member.builder().id(id).name("사업자" + id).email("business" + id + "@example.com")
                .role(Role.BUSINESS).build();
    }

    private Store store(Member owner) {
        return Store.builder().id(31L).owner(owner).name("가게31").status(StoreStatus.ACTIVE).build();
    }
}
