package kr.it.reserve.chat.controller;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatReportContextResponse;
import kr.it.reserve.chat.dto.ChatReportResponse;
import kr.it.reserve.chat.dto.ChatRoomResponse;
import kr.it.reserve.chat.dto.CreateChatReportRequest;
import kr.it.reserve.chat.dto.ReviewChatReportRequest;
import kr.it.reserve.chat.dto.SendMessageRequest;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.service.ChatImageService;
import kr.it.reserve.chat.service.ChatModerationService;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.notification.service.ReservationNotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class ChatControllerResponseContractTest {

    private static final String EXPECTED_LOGIN_REQUIRED = "로그인이 필요해요.";
    private static final String EXPECTED_QUERY_SUCCESS = "조회 성공";
    private static final String EXPECTED_SEND_SUCCESS = "전송 완료";
    private static final String CONTENT = "계약 확인 메시지";
    private static final String CLIENT_MESSAGE_ID = "contract-send-55";
    private static final String CLIENT_IP = "192.0.2.41";
    private static final Long ACTOR_ID = 73L;
    private static final Long ROOM_ID = 21L;
    private static final Long STORE_ID = 41L;
    private static final Long REPORT_ID = 31L;
    private static final Long MESSAGE_ID = 55L;
    private static final Long AFTER_ID = 54L;
    private static final int PAGE = 2;

    private final Fixture fixture = new Fixture();

    @BeforeEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void releaseAuthentication() {
        SecurityContextHolder.clearContext();
    }

    // 직접 호출로 SecurityUtil·응답·위임을 검사하며 @PreAuthorize 실행은 확인하지 않는다.
    @ParameterizedTest(name = "{0}")
    @MethodSource("authenticatedResponses")
    void authenticatedMemberKeepsResponseAndServiceArguments(
            String endpoint, Consumer<Fixture> contract) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(fixture.member, null, List.of()));

        contract.accept(fixture);

        verifyNoMoreInteractions(fixture.chatService, fixture.moderationService,
                fixture.imageService, fixture.rateLimiter);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("loginRequiredEndpoints")
    void missingAuthenticationUsesExistingMessageWithoutBusinessCalls(
            String endpoint, Consumer<Fixture> invoke) {
        assertThatThrownBy(() -> invoke.accept(fixture))
                .isExactlyInstanceOf(MemberException.class)
                .hasMessage(EXPECTED_LOGIN_REQUIRED);

        verifyNoInteractions(fixture.chatService, fixture.moderationService, fixture.imageService, fixture.rateLimiter);
    }

    @Test
    void memberLimitStopsTextAndImageBeforeEitherSavesAMessage() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(fixture.member, null, List.of()));
        var images = new ChatImageController(fixture.imageService, fixture.rateLimiter);

        assertThat(fixture.chat.send(fixture.sendRequest, fixture.httpRequest).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(images.send(ROOM_ID, null, null, fixture.httpRequest).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(fixture.rateLimiter, org.mockito.Mockito.times(2))
                .tryConsume(ACTOR_ID.toString(), RateLimiter.Policy.CHAT_MEMBER_SEND);
        verifyNoMoreInteractions(fixture.rateLimiter);
        verifyNoInteractions(fixture.chatService, fixture.imageService);
    }

    private static Stream<Arguments> authenticatedResponses() {
        return Stream.concat(adminResponses(), chatResponses());
    }

    private static Stream<Arguments> adminResponses() {
        return Stream.of(
                success("AdminChat.rooms", f -> {
                    when(f.chatService.listRoomsForAdmin(PAGE, ACTOR_ID)).thenReturn(f.rooms);
                    assertSuccess(f.admin.rooms(PAGE), f.rooms, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).listRoomsForAdmin(PAGE, ACTOR_ID);
                }),
                success("AdminChat.messages", f -> {
                    when(f.chatService.getRoomAsAdmin(ROOM_ID, ACTOR_ID)).thenReturn(f.messages);
                    assertSuccess(f.admin.messages(ROOM_ID), f.messages, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).getRoomAsAdmin(ROOM_ID, ACTOR_ID);
                }),
                success("AdminChat.openRoom", f -> {
                    when(f.chatService.readRoomAsAdmin(ROOM_ID, ACTOR_ID)).thenReturn(f.messages);
                    assertSuccess(f.admin.openRoom(ROOM_ID), f.messages, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).readRoomAsAdmin(ROOM_ID, ACTOR_ID);
                }),
                success("AdminChat.poll", f -> {
                    when(f.chatService.getNewMessagesAsAdmin(ROOM_ID, AFTER_ID, ACTOR_ID))
                            .thenReturn(f.messages);
                    assertSuccess(f.admin.poll(ROOM_ID, AFTER_ID), f.messages, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).getNewMessagesAsAdmin(ROOM_ID, AFTER_ID, ACTOR_ID);
                }),
                success("AdminChat.reply", f -> {
                    f.allowMemberSend();
                    when(f.chatService.sendAsAdmin(f.member, ROOM_ID, CONTENT, CLIENT_MESSAGE_ID))
                            .thenReturn(f.message);
                    assertSuccess(f.admin.reply(ROOM_ID, f.sendRequest), f.message, EXPECTED_SEND_SUCCESS);
                    verify(f.chatService).sendAsAdmin(
                            same(f.member), eq(ROOM_ID), eq(CONTENT), eq(CLIENT_MESSAGE_ID));
                    f.verifyMemberSend();
                }),
                success("AdminChat.waitingCount", f -> {
                    when(f.chatService.adminWaitingRoomCount()).thenReturn(11L);
                    assertSuccess(f.admin.waitingCount(), 11L, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).adminWaitingRoomCount();
                }),
                success("AdminChat.reportContext", f -> {
                    when(f.moderationService.reportContext(f.member, REPORT_ID)).thenReturn(f.reportContext);
                    assertSuccess(f.admin.reportContext(REPORT_ID), f.reportContext, "채팅 신고 문맥 조회 성공");
                    verify(f.moderationService).reportContext(same(f.member), eq(REPORT_ID));
                }),
                success("AdminChat.reviewReport", f -> {
                    when(f.moderationService.reviewReport(f.member, REPORT_ID, f.reviewRequest))
                            .thenReturn(f.report);
                    assertSuccess(f.admin.reviewReport(REPORT_ID, f.reviewRequest), f.report, "채팅 신고 처리 완료");
                    verify(f.moderationService).reviewReport(
                            same(f.member), eq(REPORT_ID), same(f.reviewRequest));
                }),
                success("AdminChat.reportImage", f -> {
                    when(f.imageService.readForReport(f.member, REPORT_ID, MESSAGE_ID)).thenReturn(f.image);
                    ResponseEntity<byte[]> response = f.admin.reportImage(REPORT_ID, MESSAGE_ID);
                    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                    assertThat(response.getBody()).containsExactly(f.image.bytes());
                    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
                    assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
                    verify(f.imageService).readForReport(same(f.member), eq(REPORT_ID), eq(MESSAGE_ID));
                })
        );
    }

    private static Stream<Arguments> chatResponses() {
        return Stream.of(
                success("ChatApi.pollConversation", f -> {
                    when(f.chatService.getNewMessages(ROOM_ID, AFTER_ID, ACTOR_ID)).thenReturn(f.messages);
                    assertSuccess(f.chat.pollConversation(ROOM_ID, AFTER_ID), f.messages, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).assertParticipant(eq(ROOM_ID), same(f.member));
                    verify(f.chatService).getNewMessages(ROOM_ID, AFTER_ID, ACTOR_ID);
                }),
                success("ChatApi.totalUnread", f -> {
                    when(f.chatService.totalUnreadCount(f.member)).thenReturn(13L);
                    when(f.reservationNotifications.unread(f.member)).thenReturn(2L);
                    var response = f.chat.totalUnread();
                    assertSuccess(response, 15L, EXPECTED_QUERY_SUCCESS);
                    assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
                    verify(f.chatService).totalUnreadCount(same(f.member));
                }),
                success("ChatApi.poll", f -> {
                    when(f.chatService.getNewMessages(ROOM_ID, AFTER_ID, ACTOR_ID)).thenReturn(f.messages);
                    assertSuccess(f.chat.poll(ROOM_ID, AFTER_ID), f.messages, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).assertOwnedBy(eq(ROOM_ID), same(f.member));
                    verify(f.chatService).getNewMessages(ROOM_ID, AFTER_ID, ACTOR_ID);
                }),
                success("ChatApi.unread", f -> {
                    when(f.chatService.myUnreadCount(f.member)).thenReturn(17L);
                    assertSuccess(f.chat.unread(), 17L, EXPECTED_QUERY_SUCCESS);
                    verify(f.chatService).myUnreadCount(same(f.member));
                }),
                success("ChatApi.sendSupport", f -> {
                    f.allowSend();
                    when(f.chatService.sendAsMember(f.member, CONTENT, CLIENT_MESSAGE_ID)).thenReturn(f.message);
                    assertSuccess(f.chat.sendSupport(f.sendRequest, f.httpRequest), f.message, EXPECTED_SEND_SUCCESS);
                    verify(f.chatService).sendAsMember(same(f.member), eq(CONTENT), eq(CLIENT_MESSAGE_ID));
                    verify(f.rateLimiter).tryConsume(CLIENT_IP, RateLimiter.Policy.CHAT_SEND);
                    f.verifyMemberSend();
                }),
                success("ChatApi.sendStoreMessage", f -> {
                    f.allowSend();
                    when(f.chatService.sendAsMemberToStore(f.member, STORE_ID, CONTENT, CLIENT_MESSAGE_ID))
                            .thenReturn(f.message);
                    assertSuccess(f.chat.sendStoreMessage(STORE_ID, f.sendRequest, f.httpRequest),
                            f.message, EXPECTED_SEND_SUCCESS);
                    verify(f.chatService).sendAsMemberToStore(
                            same(f.member), eq(STORE_ID), eq(CONTENT), eq(CLIENT_MESSAGE_ID));
                    verify(f.rateLimiter).tryConsume(CLIENT_IP, RateLimiter.Policy.CHAT_SEND);
                    f.verifyMemberSend();
                }),
                success("ChatApi.replyStoreMessage", f -> {
                    f.allowSend();
                    when(f.chatService.sendAsOwner(f.member, ROOM_ID, CONTENT, CLIENT_MESSAGE_ID))
                            .thenReturn(f.message);
                    assertSuccess(f.chat.replyStoreMessage(ROOM_ID, f.sendRequest, f.httpRequest),
                            f.message, EXPECTED_SEND_SUCCESS);
                    verify(f.chatService).sendAsOwner(
                            same(f.member), eq(ROOM_ID), eq(CONTENT), eq(CLIENT_MESSAGE_ID));
                    verify(f.rateLimiter).tryConsume(CLIENT_IP, RateLimiter.Policy.CHAT_SEND);
                    f.verifyMemberSend();
                }),
                success("ChatApi.send", f -> {
                    f.allowSend();
                    when(f.chatService.sendAsMember(f.member, CONTENT, CLIENT_MESSAGE_ID)).thenReturn(f.message);
                    assertSuccess(f.chat.send(f.sendRequest, f.httpRequest), f.message, EXPECTED_SEND_SUCCESS);
                    verify(f.chatService).sendAsMember(same(f.member), eq(CONTENT), eq(CLIENT_MESSAGE_ID));
                    verify(f.rateLimiter).tryConsume(CLIENT_IP, RateLimiter.Policy.CHAT_SEND);
                    f.verifyMemberSend();
                }),
                success("ChatApi.setVisibility hidden", f -> {
                    assertSuccess(f.chat.setVisibility(ROOM_ID, "OWNER", true), null, "내 목록에서 숨겼어요.");
                    verify(f.moderationService).setHidden(same(f.member), eq(ROOM_ID), eq("OWNER"), eq(true));
                }),
                success("ChatApi.setVisibility restored", f -> {
                    assertSuccess(f.chat.setVisibility(ROOM_ID, "MEMBER", false), null, "대화를 복원했어요.");
                    verify(f.moderationService).setHidden(same(f.member), eq(ROOM_ID), eq("MEMBER"), eq(false));
                })
        );
    }

    private static Stream<Arguments> loginRequiredEndpoints() {
        return Stream.of(
                login("AdminChat.messages", f -> f.admin.messages(ROOM_ID)),
                login("AdminChat.openRoom", f -> f.admin.openRoom(ROOM_ID)),
                login("AdminChat.poll", f -> f.admin.poll(ROOM_ID, AFTER_ID)),
                login("AdminChat.reply", f -> f.admin.reply(ROOM_ID, f.sendRequest)),
                login("AdminChat.reportContext", f -> f.admin.reportContext(REPORT_ID)),
                login("AdminChat.reviewReport", f -> f.admin.reviewReport(REPORT_ID, f.reviewRequest)),
                login("AdminChat.reportImage", f -> f.admin.reportImage(REPORT_ID, MESSAGE_ID)),
                login("ChatApi.conversations", f -> f.chat.conversations(PAGE, true)),
                login("ChatApi.support", f -> f.chat.support()),
                login("ChatApi.openSupport", f -> f.chat.openSupport()),
                login("ChatApi.sendSupport", f -> f.chat.sendSupport(f.sendRequest, f.httpRequest)),
                login("ChatApi.storeConversation", f -> f.chat.storeConversation(STORE_ID)),
                login("ChatApi.openStoreConversation", f -> f.chat.openStoreConversation(STORE_ID)),
                login("ChatApi.sendStoreMessage",
                        f -> f.chat.sendStoreMessage(STORE_ID, f.sendRequest, f.httpRequest)),
                login("ChatApi.storeInbox", f -> f.chat.storeInbox(PAGE, true)),
                login("ChatApi.openStoreInbox", f -> f.chat.openStoreInbox(ROOM_ID)),
                login("ChatApi.markStoreInboxOpened", f -> f.chat.markStoreInboxOpened(ROOM_ID)),
                login("ChatApi.replyStoreMessage",
                        f -> f.chat.replyStoreMessage(ROOM_ID, f.sendRequest, f.httpRequest)),
                login("ChatApi.pollConversation", f -> f.chat.pollConversation(ROOM_ID, AFTER_ID)),
                login("ChatApi.conversationHistory", f -> f.chat.conversationHistory(ROOM_ID, MESSAGE_ID, 37)),
                login("ChatApi.markConversationRead", f -> f.chat.markConversationRead(ROOM_ID, "OWNER", null)),
                login("ChatApi.setConversationBlocked",
                        f -> f.chat.setConversationBlocked(ROOM_ID, "MEMBER", true)),
                login("ChatApi.setVisibility", f -> f.chat.setVisibility(ROOM_ID, "OWNER", true)),
                login("ChatApi.reportConversation",
                        f -> f.chat.reportConversation(ROOM_ID, "MEMBER", f.createReportRequest)),
                login("ChatApi.totalUnread", f -> f.chat.totalUnread()),
                login("ChatApi.openMy", f -> f.chat.openMy()),
                login("ChatApi.send", f -> f.chat.send(f.sendRequest, f.httpRequest)),
                login("ChatApi.poll", f -> f.chat.poll(ROOM_ID, AFTER_ID)),
                login("ChatApi.unread", f -> f.chat.unread())
        );
    }

    private static Arguments success(String endpoint, Consumer<Fixture> contract) {
        return Arguments.of(endpoint, contract);
    }

    private static Arguments login(String endpoint, Consumer<Fixture> invoke) {
        return Arguments.of(endpoint, invoke);
    }

    private static <T> void assertSuccess(ResponseEntity<ApiResponse<T>> response, T data, String message) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        ApiResponse<T> body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.isSuccess()).isTrue();
        assertThat(body.getMessage()).isEqualTo(message);
        assertThat(body.getData()).isEqualTo(data);
    }

    private static final class Fixture {
        private final ChatService chatService = mock(ChatService.class);
        private final ChatModerationService moderationService = mock(ChatModerationService.class);
        private final ChatImageService imageService = mock(ChatImageService.class);
        private final RateLimiter rateLimiter = mock(RateLimiter.class);
        private final ReservationNotificationService reservationNotifications = mock(ReservationNotificationService.class);
        private final AdminChatController admin = new AdminChatController(chatService, moderationService, imageService, rateLimiter);
        private final ChatApiController chat = new ChatApiController(chatService, moderationService, rateLimiter, reservationNotifications);
        private final Member member = Member.builder().id(ACTOR_ID).name("계약 검사")
                .email("chat-contract@example.test").build();
        private final SendMessageRequest sendRequest = new SendMessageRequest();
        private final ReviewChatReportRequest reviewRequest = new ReviewChatReportRequest();
        private final CreateChatReportRequest createReportRequest = new CreateChatReportRequest();
        private final MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        private final ChatMessageResponse message = ChatMessageResponse.builder()
                .id(MESSAGE_ID).content(CONTENT).clientMessageId(CLIENT_MESSAGE_ID).build();
        private final List<ChatMessageResponse> messages = List.of(message);
        private final Page<ChatRoomResponse> rooms = new PageImpl<>(
                List.of(ChatRoomResponse.builder().id(ROOM_ID).build()), PageRequest.of(PAGE, 20), 45);
        private final ChatReportResponse report = ChatReportResponse.builder()
                .id(REPORT_ID).roomId(ROOM_ID).messageId(MESSAGE_ID).build();
        private final ChatReportContextResponse reportContext = ChatReportContextResponse.builder()
                .report(report).reportedMessage(message).recentMessages(messages).build();
        private final ChatImageService.ImageContent image =
                new ChatImageService.ImageContent(new byte[]{1, 2, 3}, "image/png");

        private Fixture() {
            sendRequest.setContent(CONTENT);
            sendRequest.setClientMessageId(CLIENT_MESSAGE_ID);
            reviewRequest.setStatus(ChatReport.Status.RESOLVED);
            reviewRequest.setResolutionNote("계약 확인 완료");
            createReportRequest.setMessageId(MESSAGE_ID);
            createReportRequest.setReason(ChatReport.Reason.SPAM);
            createReportRequest.setDetails("계약 확인 신고");
            httpRequest.setRemoteAddr(CLIENT_IP);
        }

        private void allowSend() {
            allowMemberSend();
            when(rateLimiter.tryConsume(CLIENT_IP, RateLimiter.Policy.CHAT_SEND)).thenReturn(true);
        }

        private void allowMemberSend() {
            when(rateLimiter.tryConsume(ACTOR_ID.toString(), RateLimiter.Policy.CHAT_MEMBER_SEND)).thenReturn(true);
        }

        private void verifyMemberSend() {
            verify(rateLimiter).tryConsume(ACTOR_ID.toString(), RateLimiter.Policy.CHAT_MEMBER_SEND);
        }
    }
}
