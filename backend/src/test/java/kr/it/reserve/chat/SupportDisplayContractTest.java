package kr.it.reserve.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ConversationSummaryResponse;
import kr.it.reserve.chat.dto.ConversationThreadResponse;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.SliceImpl;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 지원 담당자 계정은 표시하지 않고, 이미 권한이 확인된 대화만 미리보기로 읽는다. */
@ExtendWith(MockitoExtension.class)
class SupportDisplayContractTest {
    @Mock ChatRoomRepository roomRepository;
    @Mock ChatMessageRepository messageRepository;
    @Mock MemberRepository memberRepository;
    @Mock StoreRepository storeRepository;
    @InjectMocks ChatService chatService;

    private final Member customer = Member.builder().id(7L).name("손님")
            .profileImage("https://images.example.com/customer.png").role(Role.USER).build();

    @Test
    void emptyConversationPageDoesNotCreateRoomOrQueryMessages() {
        when(roomRepository.findForMember(eq(7L), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of()));

        assertThat(chatService.listMyConversations(customer, 0)).isEmpty();
        verifyNoInteractions(messageRepository, memberRepository, storeRepository);
        verify(roomRepository, never()).save(any());
    }

    @Test
    void supportSummaryNeverShowsActualAdminAndRecoversMissingPreviewFromLastMessage() {
        ChatRoom room = supportRoom(21L);
        when(roomRepository.findForMember(7L, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(room)));
        when(messageRepository.findLatestByRoomIds(List.of(21L)))
                .thenReturn(List.of(message(88L, room, SenderRole.ADMIN, 1L, "  확인 후\n 안내드립니다.  ")));

        var response = chatService.listMyConversations(customer, 0).getContent().getFirst();

        assertThat(response.getCounterpartName()).isEqualTo("RESERVE 고객지원");
        assertThat(response.getCounterpartProfileImage()).isNull();
        assertThat(response.getLastMessagePreview()).isEqualTo("확인 후 안내드립니다.");
        assertThat(response.getUnread()).isEqualTo(3);
        assertThat(room.getLastMessagePreview()).isNull(); // 읽기 전용: DB backfill 아님
        assertThat(room.getAdminUnread()).isEqualTo(2);
        verifyNoInteractions(memberRepository, storeRepository);
        verify(roomRepository, never()).save(any());
    }

    @Test
    void existingPreviewNeedsNoMessageOrAdminProfileLookup() {
        ChatRoom room = supportRoom(21L);
        room.setLastMessagePreview("저장된 최근 대화");
        when(roomRepository.findForMember(7L, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(room)));

        var response = chatService.listMyConversations(customer, 0).getContent().getFirst();

        assertThat(response.getCounterpartName()).isEqualTo("RESERVE 고객지원");
        assertThat(response.getLastMessagePreview()).isEqualTo("저장된 최근 대화");
        verifyNoInteractions(messageRepository, memberRepository, storeRepository);
    }

    @Test
    void blankPersistedPreviewAlsoFallsBackWithoutMutatingRoom() {
        ChatRoom room = supportRoom(21L);
        room.setLastMessagePreview(" ");
        when(roomRepository.findForMember(7L, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(room)));
        when(messageRepository.findLatestByRoomIds(List.of(21L)))
                .thenReturn(List.of(message(88L, room, SenderRole.ADMIN, 1L, "실제 마지막 대화")));

        var response = chatService.listMyConversations(customer, 0).getContent().getFirst();

        assertThat(response.getLastMessagePreview()).isEqualTo("실제 마지막 대화");
        assertThat(room.getLastMessagePreview()).isEqualTo(" ");
    }

    @Test
    void onlyMissingPreviewsInThisPageAreQueriedAndUnrelatedResultsAreIgnored() {
        ChatRoom answered = supportRoom(21L);
        ChatRoom existing = storeRoom(31L);
        existing.setLastMessagePreview("이미 저장된 문의");
        ChatRoom empty = storeRoom(32L);
        ChatRoom unrelated = supportRoom(99L);
        when(roomRepository.findForMember(7L, PageRequest.of(2, 20)))
                .thenReturn(new PageImpl<>(List.of(answered, existing, empty), PageRequest.of(2, 20), 43));
        when(messageRepository.findLatestByRoomIds(List.of(21L, 32L)))
                .thenReturn(List.of(
                        message(88L, answered, SenderRole.ADMIN, 1L, "지원 답변"),
                        message(89L, unrelated, SenderRole.ADMIN, 2L, "다른 방")));

        var page = chatService.listMyConversations(customer, 2);

        assertThat(page.getNumber()).isEqualTo(2);
        assertThat(page.getTotalElements()).isEqualTo(43);
        assertThat(page.getContent()).extracting(ConversationSummaryResponse::getCounterpartName)
                .containsExactly("RESERVE 고객지원", "가게31", "가게32");
        assertThat(page.getContent()).extracting(ConversationSummaryResponse::getLastMessagePreview)
                .containsExactly("지원 답변", "이미 저장된 문의", null);
        verify(messageRepository).findLatestByRoomIds(List.of(21L, 32L));
        verify(storeRepository).findAllById(List.of(31L, 32L));
        verifyNoInteractions(memberRepository);
    }

    @Test
    void ownerInboxKeepsCustomerNameAndUsesSamePreviewFallback() {
        Member owner = Member.builder().id(9L).name("사장님").role(Role.BUSINESS).build();
        Store store = Store.builder().id(31L).owner(owner).name("가게31").build();
        ChatRoom room = storeRoom(31L);
        when(storeRepository.findByOwnerId(9L)).thenReturn(List.of(store));
        when(roomRepository.findStoreInbox(
                ChatRoom.RoomType.STORE, List.of(31L), PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(room)));
        when(messageRepository.findLatestByRoomIds(List.of(31L)))
                .thenReturn(List.of(message(93L, room, SenderRole.MEMBER, 7L, "예약 가능한가요?")));

        var response = chatService.listStoreInbox(owner, 0).getContent().getFirst();

        assertThat(response.getCounterpartName()).isEqualTo("손님");
        assertThat(response.getCounterpartProfileImage()).isEqualTo("https://images.example.com/customer.png");
        assertThat(response.getStoreName()).isEqualTo("가게31");
        assertThat(response.getViewerRole()).isEqualTo("OWNER");
        assertThat(response.getLastMessagePreview()).isEqualTo("예약 가능한가요?");
        var thread = ConversationThreadResponse.from(
                room, "손님", "OWNER", true, List.of(), false, null);
        assertThat(thread.getCounterpartProfileImage())
                .isEqualTo("https://images.example.com/customer.png");
        verifyNoInteractions(memberRepository);
    }

    @Test
    void adminInboxKeepsCustomerIdentityAndUsesTheSharedPreviewFallback() {
        ChatRoom room = supportRoom(21L);
        when(roomRepository.findAllForAdmin(
                ChatRoom.RoomType.SUPPORT, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of(room)));
        when(messageRepository.findLatestByRoomIds(List.of(21L)))
                .thenReturn(List.of(message(93L, room, SenderRole.MEMBER, 7L, "배송 문의가 있습니다")));

        var response = chatService.listRoomsForAdmin(0).getContent().getFirst();

        assertThat(response.getMemberName()).isEqualTo("손님");
        assertThat(response.getMemberProfileImage()).isEqualTo("https://images.example.com/customer.png");
        assertThat(response.getLastMessagePreview()).isEqualTo("배송 문의가 있습니다");
        assertThat(response.getAdminUnread()).isEqualTo(2);
    }

    @Test
    void supportThreadAlwaysKeepsBrandTitleAndPreservesReadCursor() {
        ChatRoom room = supportRoom(21L);
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(customer));
        when(roomRepository.findByMemberIdAndTypeForUpdate(7L, ChatRoom.RoomType.SUPPORT))
                .thenReturn(Optional.of(room));
        when(messageRepository.findByRoomIdOrderByIdDesc(21L, PageRequest.of(0, 50)))
                .thenReturn(new SliceImpl<>(List.of(
                        message(88L, room, SenderRole.ADMIN, 1L, "답변"),
                        message(87L, room, SenderRole.MEMBER, 7L, "문의")),
                        PageRequest.of(0, 50), true));

        ConversationThreadResponse response = chatService.openSupportConversation(customer);

        assertThat(response.getTitle()).isEqualTo("RESERVE 고객지원");
        assertThat(response.getCounterpartName()).isEqualTo("RESERVE 고객지원");
        assertThat(response.getCounterpartProfileImage()).isNull();
        assertThat(response.getViewerRole()).isEqualTo("MEMBER");
        assertThat(response.getMessages()).extracting(ChatMessageResponse::getId)
                .containsExactly(87L, 88L);
        assertThat(response.getMessages()).extracting(ChatMessageResponse::getSenderName)
                .containsExactly(null, "RESERVE 고객지원");
        assertThat(response.getNextBeforeId()).isEqualTo(87L);
        assertThat(response.isHasOlderMessages()).isTrue();
        assertThat(room.getMemberUnread()).isZero();
        assertThat(room.getAdminUnread()).isEqualTo(2);
        verify(memberRepository, never()).findAllById(any());
        verify(roomRepository, never()).save(any());
    }

    @Test
    void pollKeepsOrderAndBrandEvenForLegacyAdminReplyWithoutSenderId() {
        ChatRoom room = supportRoom(21L);
        when(messageRepository.findByRoomIdAndIdGreaterThanOrderByIdAsc(21L, 50L))
                .thenReturn(List.of(
                        message(51L, room, SenderRole.MEMBER, 7L, "질문"),
                        message(52L, room, SenderRole.ADMIN, 1L, "답변1"),
                        message(53L, room, SenderRole.ADMIN, null, "답변2")));

        var messages = chatService.getNewMessages(21L, 50L);

        assertThat(messages).extracting(ChatMessageResponse::getId).containsExactly(51L, 52L, 53L);
        assertThat(messages).extracting(ChatMessageResponse::getSenderName)
                .containsExactly(null, "RESERVE 고객지원", "RESERVE 고객지원");
        assertThat(messages).extracting(ChatMessageResponse::getSenderProfileImage)
                .containsOnlyNulls();
        assertThat(room.getMemberUnread()).isEqualTo(3);
        assertThat(room.getAdminUnread()).isEqualTo(2);
        verifyNoInteractions(roomRepository, memberRepository, storeRepository);
    }

    @Test
    void adminRetryKeepsBrandWithoutAProfileReadOrExtraMessageWrite() {
        Member admin = Member.builder().id(1L).name("한재은")
                .profileImage("https://images.example.com/private.png").role(Role.ADMIN).build();
        ChatRoom room = supportRoom(21L);
        ChatMessage existing = ChatMessage.builder().id(88L).room(room)
                .senderRole(SenderRole.ADMIN).senderMemberId(1L)
                .clientMessageId("client-1").content("답변").build();
        when(roomRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(room));
        when(messageRepository.findByRoomIdAndSenderMemberIdAndClientMessageId(21L, 1L, "client-1"))
                .thenReturn(Optional.of(existing));

        var response = chatService.sendAsAdmin(admin, 21L, "답변", "client-1");

        assertThat(response.getSenderName()).isEqualTo("RESERVE 고객지원");
        assertThat(response.getSenderProfileImage()).isNull();
        assertThat(room.getMemberUnread()).isEqualTo(3);
        verify(messageRepository, never()).save(any());
        verify(memberRepository, never()).findAllById(any());
    }

    @Test
    void dtoBoundaryAndJsonNeverExposeAdminPersonalIdentity() throws Exception {
        ChatRoom room = supportRoom(21L);
        var reply = ChatMessageResponse.from(message(
                88L, room, SenderRole.ADMIN, 912345L, "답변"));
        var memberSummary = ConversationSummaryResponse.forMember(room);
        var thread = ConversationThreadResponse.from(room,
                "한재은", "MEMBER", true, List.of(reply), false, 88L);
        var storeAdmin = ChatMessageResponse.from(message(
                89L, storeRoom(31L), SenderRole.ADMIN, 912345L, "잘못된 역할"));
        var mapper = new ObjectMapper();

        assertThat(reply.getSenderName()).isEqualTo("RESERVE 고객지원");
        assertThat(reply.getSenderProfileImage()).isNull();
        assertThat(thread.getTitle()).isEqualTo("RESERVE 고객지원");
        assertThat(storeAdmin.getSenderName()).isNull();
        for (var dto : List.of(reply, memberSummary, thread)) {
            var json = mapper.readTree(mapper.writeValueAsString(dto));
            assertThat(json.has("senderMemberId")).isFalse();
            assertThat(json.has("memberId")).isFalse();
            assertThat(json.has("adminId")).isFalse();
            assertThat(json.toString()).doesNotContain(
                    "한재은", "private.png", "912345", "private-admin-email", "private-password");
        }
    }

    @Test
    void previewFallbackUsesPersistedWhitespaceAndLengthRule() {
        String longContent = "a".repeat(152);
        assertThat(ChatRoom.previewContent("  확인\n 후\t 안내  "))
                .isEqualTo("확인 후 안내");
        assertThat(ChatRoom.previewContent(longContent))
                .hasSize(151)
                .endsWith("…");
    }

    @Test
    void retractionCapabilityUsesViewerIdentityWithoutExposingSenderId() throws Exception {
        ChatMessage reply = message(88L, supportRoom(21L), SenderRole.ADMIN, 912345L, "답변");
        var mine = ChatMessageResponse.from(reply, 912345L);
        assertThat(mine.isCanRetract()).isTrue();
        assertThat(ChatMessageResponse.from(reply, 1L).isCanRetract()).isFalse();
        assertThat(ChatMessageResponse.from(reply).isCanRetract()).isFalse();
        assertThat(ChatMessageResponse.forReport(reply).isCanRetract()).isFalse();
        var json = new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(mine));
        assertThat(json.get("canRetract").asBoolean()).isTrue();
        assertThat(json.has("senderMemberId")).isFalse();
        assertThat(json.toString()).doesNotContain("912345");
        reply.retract(java.time.LocalDateTime.now(), 1L);
        assertThat(ChatMessageResponse.from(reply, 912345L).isCanRetract()).isFalse();
    }

    private ChatRoom supportRoom(Long id) {
        return ChatRoom.builder().id(id).member(customer).type(ChatRoom.RoomType.SUPPORT)
                .memberUnread(3).adminUnread(2).build();
    }

    private ChatRoom storeRoom(Long id) {
        return ChatRoom.builder().id(id).member(customer).type(ChatRoom.RoomType.STORE)
                .storeId(id).storeNameSnapshot("가게" + id).build();
    }

    private ChatMessage message(Long id, ChatRoom room, SenderRole role, Long senderId, String content) {
        return ChatMessage.builder().id(id).room(room).senderRole(role).senderMemberId(senderId)
                .content(content).build();
    }
}
