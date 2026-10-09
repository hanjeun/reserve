package kr.it.reserve.chat;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.entity.*;
import kr.it.reserve.chat.repository.*;
import kr.it.reserve.chat.service.ChatMessageVisibilityService;
import kr.it.reserve.chat.service.ChatRetractionService;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@Import({ChatService.class, ChatMessageVisibilityService.class, ChatRetractionService.class})
class ChatMessageVisibilityTest {
    @Autowired ChatService chats;
    @Autowired ChatMessageVisibilityService visibility;
    @Autowired ChatRetractionService retractions;
    @Autowired ChatRoomRepository rooms;
    @Autowired ChatMessageRepository messages;
    @Autowired ChatMessageHiddenRepository hidden;
    @Autowired MemberRepository members;

    @Test void privateDeletionSurvivesReloadButNeverChangesCounterpartOriginalOrEvidence() {
        var viewer = member("viewer", Role.USER);
        var admin = member("operator", Role.ADMIN);
        var room = room(viewer);
        var original = message(room, admin, "보존할 상대 메시지");
        room.onMessageSent(SenderRole.ADMIN, original.getCreatedAt(), original.getContent());

        var result = visibility.hide(viewer, room.getId(), original.getId());
        visibility.hide(viewer, room.getId(), original.getId());
        hidden.flush();

        assertThat(result.isHidden()).isTrue();
        assertThat(result.getContent()).isNull();
        assertThat(result.getImageUrl()).isNull();
        assertThat(hidden.count()).isEqualTo(1);
        var own = chats.getNewMessages(room.getId(), 0L, viewer.getId());
        var counterpart = chats.getNewMessages(room.getId(), 0L, admin.getId());
        assertThat(own).extracting(ChatMessageResponse::getId).containsExactly(original.getId());
        assertThat(own.getFirst().isHidden()).isTrue();
        assertThat(counterpart.getFirst().getContent()).isEqualTo("보존할 상대 메시지");
        assertThat(counterpart.getFirst().isHidden()).isFalse();
        assertThat(ChatMessageResponse.forReport(original).getContent()).isEqualTo("보존할 상대 메시지");
        assertThat(original.getImageKey()).isEqualTo("users/fixture/chat/photo.bin");
        assertThat(room.getRetractionRevision()).isZero();
        assertThat(room.getMemberUnread()).isEqualTo(1);
    }

    @Test void unauthorizedViewerAndWrongRoomCannotCreatePrivateDeletionRows() {
        var viewer = member("participant", Role.USER);
        var stranger = member("stranger", Role.USER);
        var room = room(viewer);
        var original = message(room, viewer, "본인 메시지");
        var otherRoom = room(viewer);
        assertThatThrownBy(() -> visibility.hide(stranger, room.getId(), original.getId()))
                .isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.FORBIDDEN);
        assertThatThrownBy(() -> visibility.hide(viewer, otherRoom.getId(), original.getId()))
                .isInstanceOf(ChatException.class).extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(hidden.count()).isZero();
        assertThat(original.getContent()).isEqualTo("본인 메시지");
    }

    @Test void privateCursorIsAccountAndRoomScopedAndDoesNotBorrowPublicRetractionRevision() {
        var viewer = member("cursor", Role.USER);
        var admin = member("cursor-admin", Role.ADMIN);
        var room = room(viewer);
        var otherRoom = room(viewer);
        var first = message(room, admin, "첫 번째");
        var unrelated = message(otherRoom, admin, "다른 방");
        visibility.hide(viewer, room.getId(), first.getId());
        visibility.hide(viewer, otherRoom.getId(), unrelated.getId());
        var own = retractions.changes(viewer, room.getId(), 0, 0);
        assertThat(own.hiddenMessageIds()).containsExactly(first.getId());
        assertThat(own.nextHiddenId()).isPositive();
        assertThat(own.nextRevision()).isZero();
        assertThat(retractions.changes(viewer, room.getId(), 0, own.nextHiddenId()).hiddenMessageIds()).isEmpty();
        assertThat(retractions.changes(admin, room.getId(), 0, 0).hiddenMessageIds()).isEmpty();
        assertThatThrownBy(() -> retractions.changes(viewer, room.getId(), 0, -1)).isInstanceOf(ChatException.class);
    }

    @Test void historyKeepsHiddenIdsForPaginationAndRetractionCannotRestoreTheirContents() {
        var viewer = member("history", Role.USER);
        var admin = member("history-admin", Role.ADMIN);
        var room = room(viewer);
        var first = message(room, admin, "지운 사진");
        var second = message(room, admin, "남은 사진");
        visibility.hide(viewer, room.getId(), first.getId());
        first.retract(LocalDateTime.now(), room.nextRetractionRevision());
        messages.flush();
        var history = chats.getOlderMessages(room.getId(), second.getId() + 1, 50, viewer.getId());
        assertThat(history.getMessages()).extracting(ChatMessageResponse::getId).containsExactly(first.getId(), second.getId());
        assertThat(history.getNextBeforeId()).isEqualTo(first.getId());
        var change = retractions.changes(viewer, room.getId(), 0, 0).messages().getFirst();
        assertThat(change.isHidden()).isTrue();
        assertThat(change.getContent()).isNull();
        assertThat(change.getImageUrl()).isNull();
    }

    @Test void listPreviewUsesLastVisibleMessageOnlyForTheDeletingAccount() {
        var viewer = member("preview", Role.USER);
        var admin = member("preview-admin", Role.ADMIN);
        var room = room(viewer);
        var first = message(room, admin, "표시할 이전 메시지");
        var last = message(room, admin, "삭제할 최신 메시지");
        room.onMessageSent(SenderRole.ADMIN, last.getCreatedAt(), last.getContent());
        visibility.hide(viewer, room.getId(), last.getId());
        assertThat(chats.listMyConversations(viewer, 0).getContent().getFirst().getLastMessagePreview())
                .isEqualTo(first.getContent());
        assertThat(chats.listRoomsForAdmin(0, admin.getId()).getContent().getFirst().getLastMessagePreview())
                .isEqualTo(last.getContent());
        visibility.hide(viewer, room.getId(), first.getId());
        assertThat(chats.listMyConversations(viewer, 0).getContent().getFirst().getLastMessagePreview())
                .isEqualTo("메시지를 나에게만 삭제했어요.");
    }

    @Test void withdrawingAccountRemovesOnlyItsVisibilityPreferences() {
        var viewer = member("withdraw", Role.USER);
        var admin = member("withdraw-admin", Role.ADMIN);
        var room = room(viewer);
        var original = message(room, viewer, "거래 원본");
        visibility.hide(viewer, room.getId(), original.getId());
        visibility.hide(admin, room.getId(), original.getId());
        visibility.withdraw(new MemberWithdrawn(viewer.getId()));
        assertThat(hidden.findHiddenMessageIds(viewer.getId(), List.of(original.getId()))).isEmpty();
        assertThat(hidden.findHiddenMessageIds(admin.getId(), List.of(original.getId()))).containsExactly(original.getId());
        assertThat(messages.findById(original.getId()).orElseThrow().getContent()).isEqualTo("거래 원본");
    }

    private Member member(String label, Role role) {
        return members.save(Member.builder().name(label).email(label + "@example.invalid").role(role).build());
    }
    private ChatRoom room(Member viewer) { return rooms.save(ChatRoom.builder().member(viewer).build()); }
    private ChatMessage message(ChatRoom room, Member sender, String content) {
        return messages.saveAndFlush(ChatMessage.builder().room(room).senderMemberId(sender.getId())
                .senderRole(sender.getRole() == Role.ADMIN ? SenderRole.ADMIN : SenderRole.MEMBER)
                .content(content).imageKey("users/fixture/chat/photo.bin").imageWidth(100).imageHeight(80).build());
    }
}
