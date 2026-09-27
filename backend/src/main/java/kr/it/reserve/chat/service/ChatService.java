package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatImagePayload;
import kr.it.reserve.chat.dto.ChatHistoryResponse;
import kr.it.reserve.chat.dto.ChatRoomResponse;
import kr.it.reserve.chat.dto.ConversationSummaryResponse;
import kr.it.reserve.chat.dto.ConversationThreadResponse;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 고객지원과 가게 문의를 분리된 권한 축으로 다루는 통합 인앱 채팅.
 *
 * <p><b>★ 실시간을 WebSocket 이 아니라 폴링으로 하는 이유</b>
 * <ul>
 *   <li><b>블루/그린 배포마다 모든 연결이 끊긴다.</b> 재연결·유실 복구를 직접 짜야 한다</li>
 *   <li>서버 메모리 여유가 실측 600MB 뿐이다(2026-08-19). 연결 상태를 들고 있을 여유가 적다</li>
 *   <li>예약 플랫폼 문의는 <b>실시간성이 낮다.</b> 3~5초 폴링이면 체감이 거의 같다</li>
 * </ul>
 * 그래서 {@link #getNewMessages}(증분 조회)를 두고, 화면은 <b>대화가 보일 때만</b> 짧게 폴링한다.
 * 닫혀 있을 때도 돌리면 모든 접속자가 5초마다 서버를 두드린다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatService {

    /** 한 번에 내려줄 메시지 수. 채팅은 끝에서 시작하므로 이 정도면 첫 화면이 다 찬다. */
    private static final int PAGE_SIZE = 50;

    /** 관리자 목록 한 페이지. */
    private static final int ROOM_PAGE_SIZE = 20;

    private final ChatRoomRepository roomRepository;
    private final ChatMessageRepository messageRepository;
    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;

    // ── 손님 ────────────────────────────────────────────────────────────────

    /**
     * 내 문의방을 연다. <b>없으면 만든다.</b>
     *
     * <p>"방 만들기" 버튼을 따로 두지 않는 이유 — 손님 입장에서 방은 개념이 아니라
     * 그냥 "문의하기"다. 버튼을 나누면 빈 방이 쌓이고, 손님은 왜 두 단계인지 모른다.
     */
    @Transactional
    public ChatRoom openMyRoom(Member member) {
        // 회원 행을 먼저 잠그면 같은 회원의 첫 두 요청이 동시에 빈 방을 보고 중복 생성하지 못한다.
        Member activeMember = memberRepository.findActiveByIdForUpdate(member.getId())
                .orElseThrow(() -> new ChatException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        return roomRepository.findByMemberIdAndTypeForUpdate(
                        activeMember.getId(), ChatRoom.RoomType.SUPPORT)
                .orElseGet(() -> roomRepository.save(ChatRoom.builder()
                        .member(activeMember)
                        .type(ChatRoom.RoomType.SUPPORT)
                        .build()));
    }

    /**
     * 내 방의 메시지를 읽는다. <b>읽는 순간 안 읽은 수가 0이 된다.</b>
     *
     * <p>별도의 "읽음 처리" API 를 두지 않는 이유 — 두면 화면이 그걸 부르는 걸 잊는 순간
     * 배지가 영영 안 사라진다. 읽기와 읽음 처리를 한 호출에 묶으면 빠뜨릴 수가 없다.
     */
    @Transactional
    public List<ChatMessageResponse> readMyMessages(Member member) {
        ChatRoom room = openMyRoom(member);
        room.markRead(SenderRole.MEMBER);
        return recentWindow(room.getId(), member.getId()).messages();
    }

    @Transactional
    public ChatMessageResponse sendAsMember(Member member, String content) {
        return sendAsMember(member, content, null);
    }

    @Transactional
    public ChatMessageResponse sendAsMember(Member member, String content, String clientMessageId) {
        ChatRoom room = openMyRoom(member);
        return append(room, SenderRole.MEMBER, member.getId(), content, clientMessageId);
    }

    public long myUnreadCount(Member member) {
        return roomRepository.sumMemberUnread(member.getId());
    }

    /** 사진도 동일한 방 잠금·소유권·차단·재시도 관문을 거친다. 권한 확인 전에 S3에 쓰지 않는다. */
    @Transactional
    public ChatMessageResponse sendImage(Member member, Long roomId, String content, String clientMessageId,
                                         Supplier<ChatImagePayload> upload) {
        ChatRoom room = findRoomForUpdate(roomId);
        SenderRole sender;
        if (room.getMember().getId().equals(member.getId())) {
            sender = SenderRole.MEMBER;
            if (room.getType() == ChatRoom.RoomType.STORE) findMessageableStore(room.getStoreId());
        } else if (room.getType() == ChatRoom.RoomType.SUPPORT && member.getRole() == Role.ADMIN) {
            sender = SenderRole.ADMIN;
        } else {
            assertStoreOwner(room, member);
            findMessageableStore(room.getStoreId());
            sender = SenderRole.OWNER;
        }
        assertNotBlocked(room);
        var existing = messageRepository.findByRoomIdAndSenderMemberIdAndClientMessageId(
                roomId, member.getId(), clientMessageId);
        if (existing.isPresent()) return ChatMessageResponse.from(existing.get(), member.getId());
        ChatImagePayload image = upload.get();
        String caption = content == null ? "" : content.trim();
        ChatMessage saved = messageRepository.save(ChatMessage.builder().room(room).senderRole(sender)
                .senderMemberId(member.getId()).clientMessageId(clientMessageId).content(caption)
                .imageKey(image.key()).imageContentType(image.contentType()).imageWidth(image.width())
                .imageHeight(image.height()).imageBytes(image.bytes()).build());
        room.onMessageSent(sender, LocalDateTime.now(), caption.isEmpty() ? "사진" : "사진 · " + caption);
        return ChatMessageResponse.from(saved, member.getId());
    }

    /** 관리자는 고객지원 사진만 직접 조회한다. 가게 대화는 실제 참가자만 통과한다. */
    public void assertImageReader(Long roomId, Member member) {
        ChatRoom room = findRoom(roomId);
        if (room.getType() == ChatRoom.RoomType.SUPPORT && member.getRole() == Role.ADMIN) return;
        assertParticipant(roomId, member);
    }

    /** 내 고객지원·가게 문의를 하나의 메신저 목록으로 반환한다. */
    public Page<ConversationSummaryResponse> listMyConversations(Member member, int page) {
        Page<ChatRoom> rooms = roomRepository.findForMember(
                member.getId(), PageRequest.of(Math.max(page, 0), ROOM_PAGE_SIZE));
        Map<Long, String> previews = missingPreviewFallbacks(rooms.getContent());
        Map<Long, String> storeImages = storeImageUrls(rooms.getContent());
        return rooms.map(room -> ConversationSummaryResponse.forMember(
                room, previews.get(room.getId()), room.getStoreId() == null
                        ? null : storeImages.get(room.getStoreId())));
    }

    @Transactional
    public ConversationThreadResponse openSupportConversation(Member member) {
        ChatRoom room = openMyRoom(member);
        room.markRead(SenderRole.MEMBER);
        MessageWindow window = recentWindow(room.getId(), member.getId());
        return ConversationThreadResponse.from(
                room, ConversationSummaryResponse.SUPPORT_NAME, "MEMBER", true,
                window.messages(), window.hasOlder(), window.nextBeforeId());
    }

    /** GET은 방 생성·읽음 변경 없이 조회한다. 새 방을 여는 동작은 POST/open 전용이다. */
    public ConversationThreadResponse getSupportConversation(Member member) {
        ChatRoom room = roomRepository.findByMemberIdAndType(member.getId(), ChatRoom.RoomType.SUPPORT)
                .orElseThrow(() -> new ChatException("대화를 아직 시작하지 않았습니다.", HttpStatus.NOT_FOUND));
        return threadForMember(room);
    }

    public ConversationThreadResponse getStoreConversation(Member member, Long storeId) {
        ChatRoom room = roomRepository.findByMemberIdAndTypeAndStoreId(member.getId(), ChatRoom.RoomType.STORE, storeId)
                .orElseThrow(() -> new ChatException("대화를 아직 시작하지 않았습니다.", HttpStatus.NOT_FOUND));
        return threadForMember(room);
    }

    public ConversationThreadResponse getRoomAsOwner(Member owner, Long roomId) {
        ChatRoom room = findRoom(roomId);
        assertStoreOwner(room, owner);
        MessageWindow window = recentWindow(roomId, owner.getId());
        return ConversationThreadResponse.from(room, room.getMember().getName(), "OWNER", isStoreMessageable(room.getStoreId()),
                window.messages(), window.hasOlder(), window.nextBeforeId());
    }

    public List<ChatMessageResponse> getRoomAsAdmin(Long roomId) {
        return getRoomAsAdmin(roomId, null);
    }

    public List<ChatMessageResponse> getRoomAsAdmin(Long roomId, Long viewerId) {
        requireType(findRoom(roomId), ChatRoom.RoomType.SUPPORT);
        return recentWindow(roomId, viewerId).messages();
    }

    /** 가게 문의방은 손님·가게 조합마다 하나다. 회원 행 잠금이 첫 동시 생성을 직렬화한다. */
    @Transactional
    public ChatRoom openStoreRoom(Member member, Long storeId) {
        Member activeMember = memberRepository.findActiveByIdForUpdate(member.getId())
                .orElseThrow(() -> new ChatException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        return roomRepository.findStoreChatForUpdate(
                        activeMember.getId(), ChatRoom.RoomType.STORE, storeId)
                .orElseGet(() -> {
                    Store store = findMessageableStore(storeId);
                    if (store.getOwner() != null && store.getOwner().getId().equals(activeMember.getId())) {
                        throw new ChatException("내 가게에는 문의를 보낼 수 없습니다.", HttpStatus.BAD_REQUEST);
                    }
                    return roomRepository.save(ChatRoom.builder()
                            .member(activeMember)
                            .type(ChatRoom.RoomType.STORE)
                            .storeId(store.getId())
                            .storeNameSnapshot(store.getName())
                            .build());
                });
    }

    @Transactional
    public ConversationThreadResponse openStoreConversation(Member member, Long storeId) {
        ChatRoom room = openStoreRoom(member, storeId);
        room.markRead(SenderRole.MEMBER);
        return threadForMember(room);
    }

    @Transactional
    public ChatMessageResponse sendAsMemberToStore(
            Member member, Long storeId, String content, String clientMessageId) {
        ChatRoom room = openStoreRoom(member, storeId);
        findMessageableStore(storeId);
        assertNotBlocked(room);
        return append(room, SenderRole.MEMBER, member.getId(), content, clientMessageId);
    }

    /** 내 고객 대화와 내가 소유한 가게 받은 문의를 합친 전체 배지 수. */
    public long totalUnreadCount(Member member) {
        long memberUnread = roomRepository.sumMemberUnread(member.getId());
        List<Long> storeIds = ownedStoreIds(member);
        long ownerUnread = storeIds.isEmpty() ? 0 : roomRepository.sumOwnerUnread(
                ChatRoom.RoomType.STORE, storeIds);
        long adminUnread = member.getRole() == Role.ADMIN
                ? roomRepository.sumAdminUnread(ChatRoom.RoomType.SUPPORT) : 0;
        return memberUnread + ownerUnread + adminUnread;
    }

    /** 사장님 받은 문의. 가게가 폐업해도 과거 대화를 읽을 수 있어 전체 소유 가게를 사용한다. */
    public Page<ConversationSummaryResponse> listStoreInbox(Member owner, int page) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), ROOM_PAGE_SIZE);
        List<Long> storeIds = ownedStoreIds(owner);
        if (storeIds.isEmpty()) return Page.empty(pageable);
        Page<ChatRoom> rooms = roomRepository.findStoreInbox(
                ChatRoom.RoomType.STORE, storeIds, pageable);
        Map<Long, String> previews = missingPreviewFallbacks(rooms.getContent());
        Map<Long, String> storeImages = storeImageUrls(rooms.getContent());
        return rooms.map(room -> ConversationSummaryResponse.forOwner(
                room, previews.get(room.getId()), storeImages.get(room.getStoreId())));
    }

    @Transactional
    public ConversationThreadResponse readRoomAsOwner(Member owner, Long roomId) {
        ChatRoom room = findRoomForUpdate(roomId);
        assertStoreOwner(room, owner);
        room.markRead(SenderRole.OWNER);
        String title = room.getMember().getName();
        MessageWindow window = recentWindow(roomId, owner.getId());
        return ConversationThreadResponse.from(
                room, title, "OWNER", isStoreMessageable(room.getStoreId()),
                window.messages(), window.hasOlder(), window.nextBeforeId());
    }

    @Transactional
    public ChatMessageResponse sendAsOwner(
            Member owner, Long roomId, String content, String clientMessageId) {
        ChatRoom room = findRoomForUpdate(roomId);
        assertStoreOwner(room, owner);
        findMessageableStore(room.getStoreId());
        assertNotBlocked(room);
        return append(room, SenderRole.OWNER, owner.getId(), content, clientMessageId);
    }

    // ── 관리자 ──────────────────────────────────────────────────────────────

    public Page<ChatRoomResponse> listRoomsForAdmin(int page) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), ROOM_PAGE_SIZE);
        Page<ChatRoom> rooms = roomRepository.findAllForAdmin(
                ChatRoom.RoomType.SUPPORT, pageable);
        Map<Long, String> previews = missingPreviewFallbacks(rooms.getContent());
        return rooms.map(room -> ChatRoomResponse.from(room, previews.get(room.getId())));
    }

    @Transactional
    public List<ChatMessageResponse> readRoomAsAdmin(Long roomId) {
        return readRoomAsAdmin(roomId, null);
    }

    @Transactional
    public List<ChatMessageResponse> readRoomAsAdmin(Long roomId, Long viewerId) {
        ChatRoom room = findRoomForUpdate(roomId);
        requireType(room, ChatRoom.RoomType.SUPPORT);
        room.markRead(SenderRole.ADMIN);
        return recentWindow(roomId, viewerId).messages();
    }

    /** 열린 관리자 메신저에 새 문의가 도착한 경우 별도 POST로 읽음 축을 맞춘다. */
    @Transactional
    public void markRoomReadAsAdmin(Long roomId) {
        ChatRoom room = findRoomForUpdate(roomId);
        requireType(room, ChatRoom.RoomType.SUPPORT);
        room.markRead(SenderRole.ADMIN);
    }

    /** 관리자 고객지원의 증분 조회. 가게 대화는 신고 문맥 조회로만 검토하고 읽음 수는 바꾸지 않는다. */
    public List<ChatMessageResponse> getNewMessagesAsAdmin(Long roomId, Long afterId) {
        return getNewMessagesAsAdmin(roomId, afterId, null);
    }

    public List<ChatMessageResponse> getNewMessagesAsAdmin(Long roomId, Long afterId, Long viewerId) {
        requireType(findRoom(roomId), ChatRoom.RoomType.SUPPORT);
        return getNewMessages(roomId, afterId, viewerId);
    }

    @Transactional
    public ChatMessageResponse sendAsAdmin(Member admin, Long roomId, String content) {
        return sendAsAdmin(admin, roomId, content, null);
    }

    @Transactional
    public ChatMessageResponse sendAsAdmin(
            Member admin, Long roomId, String content, String clientMessageId) {
        ChatRoom room = findRoomForUpdate(roomId);
        requireType(room, ChatRoom.RoomType.SUPPORT);
        return append(room, SenderRole.ADMIN, admin.getId(), content, clientMessageId);
    }

    public long adminWaitingRoomCount() {
        return roomRepository.countRoomsWaitingForAdmin(ChatRoom.RoomType.SUPPORT);
    }

    // ── 폴링 (양쪽 공용) ────────────────────────────────────────────────────

    /**
     * {@code afterId} 뒤에 온 메시지만. 화면이 3~5초마다 부른다.
     *
     * <p>전체를 다시 받지 않는 게 요점이다 — 대화가 길어질수록 폴링 비용이 커지면
     * 오래 쓴 사람이 벌을 받는 구조가 된다.
     *
     * <p><b>읽음 처리를 하지 않는다.</b> 폴링은 "화면이 살아 있다"는 뜻일 뿐,
     * 사람이 보고 있다는 뜻이 아니다. 탭을 띄워만 놓아도 안 읽은 수가 0이 되면 배지가 거짓말을 한다.
     */
    public List<ChatMessageResponse> getNewMessages(Long roomId, Long afterId) {
        return getNewMessages(roomId, afterId, null);
    }

    public List<ChatMessageResponse> getNewMessages(Long roomId, Long afterId, Long viewerId) {
        return messageResponses(messageRepository
                .findByRoomIdAndIdGreaterThanOrderByIdAsc(roomId, afterId == null ? 0L : afterId), viewerId);
    }

    /** 위로 스크롤할 때만 부르는 오래된 메시지 cursor 조회. 전체 건수 집계는 하지 않는다. */
    public ChatHistoryResponse getOlderMessages(Long roomId, Long beforeId, int requestedSize) {
        return getOlderMessages(roomId, beforeId, requestedSize, null);
    }

    public ChatHistoryResponse getOlderMessages(Long roomId, Long beforeId, int requestedSize, Long viewerId) {
        if (beforeId == null || beforeId <= 0) {
            throw new ChatException("메시지 기준값이 올바르지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        int size = Math.max(10, Math.min(requestedSize, PAGE_SIZE));
        var slice = messageRepository.findByRoomIdAndIdLessThanOrderByIdDesc(
                roomId, beforeId, PageRequest.of(0, size));
        List<ChatMessageResponse> messages = messageResponses(slice.getContent(), viewerId).reversed();
        Long nextBeforeId = messages.isEmpty() ? null : messages.getFirst().getId();
        return ChatHistoryResponse.of(messages, slice.hasNext(), nextBeforeId);
    }

    /** 그 방이 이 회원의 것인지. 손님 경로에서 방 ID 를 받을 때 쓴다. */
    public void assertOwnedBy(Long roomId, Member member) {
        ChatRoom room = findRoom(roomId);
        if (!room.getMember().getId().equals(member.getId())) {
            throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
    }

    /** 통합 메신저 폴링용 참가자 확인. 회원 본인 또는 해당 가게 소유자만 통과한다. */
    public void assertParticipant(Long roomId, Member member) {
        ChatRoom room = findRoom(roomId);
        if (room.getMember().getId().equals(member.getId())) return;
        if (room.getType() == ChatRoom.RoomType.STORE && ownsStore(room.getStoreId(), member)) return;
        throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
    }

    /** 활성 화면이 새 메시지를 실제로 받은 뒤 호출한다. 회원/사장님 읽음 축을 섞지 않는다. */
    @Transactional
    public void markReadAsParticipant(Long roomId, Member member, String viewerRole) {
        ChatRoom room = findRoomForUpdate(roomId);
        if ("OWNER".equalsIgnoreCase(viewerRole)) {
            assertStoreOwner(room, member);
            room.markRead(SenderRole.OWNER);
            return;
        }
        if (!"MEMBER".equalsIgnoreCase(viewerRole)) {
            throw new ChatException("읽음 처리 역할이 올바르지 않습니다.", HttpStatus.BAD_REQUEST);
        }
        if (!room.getMember().getId().equals(member.getId())) {
            throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
        room.markRead(SenderRole.MEMBER);
    }

    // ── 내부 ────────────────────────────────────────────────────────────────

    private ChatRoom findRoom(Long roomId) {
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new ChatException("대화를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private ChatRoom findRoomForUpdate(Long roomId) {
        return roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new ChatException("대화를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private MessageWindow recentWindow(Long roomId, Long viewerId) {
        var slice = messageRepository.findByRoomIdOrderByIdDesc(
                roomId, PageRequest.of(0, PAGE_SIZE));
        List<ChatMessageResponse> desc = messageResponses(slice.getContent(), viewerId);
        // 저장소는 최신부터 주고 화면은 오래된 것부터 그린다 — 뒤집는 곳을 한 군데로 모은다.
        List<ChatMessageResponse> messages = desc.reversed();
        Long nextBeforeId = messages.isEmpty() ? null : messages.getFirst().getId();
        return new MessageWindow(messages, slice.hasNext(), nextBeforeId);
    }

    private record MessageWindow(
            List<ChatMessageResponse> messages, boolean hasOlder, Long nextBeforeId) {}

    /**
     * 메시지를 넣고 방 요약을 갱신한다.
     *
     * <p>둘이 <b>같은 트랜잭션</b>이어야 한다. 메시지만 들어가고 {@code lastMessageAt} 이 안 바뀌면
     * 관리자 목록에서 그 방이 아래에 그대로 남아 답을 못 받는다.
     */
    private ChatMessageResponse append(
            ChatRoom room, SenderRole sender, Long senderId, String content, String clientMessageId) {
        String trimmed = content == null ? "" : content.trim();
        if (trimmed.isEmpty()) {
            throw new ChatException("내용을 입력해주세요.");
        }

        String normalizedClientId = clientMessageId == null || clientMessageId.isBlank()
                ? null : clientMessageId.trim();
        if (normalizedClientId != null) {
            var existing = messageRepository.findByRoomIdAndSenderMemberIdAndClientMessageId(
                    room.getId(), senderId, normalizedClientId);
            if (existing.isPresent()) return messageResponses(List.of(existing.get()), senderId).getFirst();
        }

        ChatMessage saved = messageRepository.save(ChatMessage.builder()
                .room(room)
                .senderRole(sender)
                .senderMemberId(senderId)
                .clientMessageId(normalizedClientId)
                .content(trimmed)
                .build());

        room.onMessageSent(sender, LocalDateTime.now(), trimmed);
        log.info("Chat message sent: roomId={}, sender={}", room.getId(), sender);
        return messageResponses(List.of(saved), senderId).getFirst();
    }

    /** 한 메시지 창의 발신 역할만 표시한다. 지원 담당자의 개인 계정 정보는 조회하지 않는다. */
    private List<ChatMessageResponse> messageResponses(List<ChatMessage> messages, Long viewerId) {
        return messages.stream().map(item -> ChatMessageResponse.from(item, viewerId)).toList();
    }

    /** 기존 방의 요약 칼럼이 비어 있을 때만, 이미 권한 확인한 한 페이지의 마지막 실제 메시지를 읽는다. */
    private Map<Long, String> missingPreviewFallbacks(List<ChatRoom> rooms) {
        List<Long> roomIds = rooms.stream()
                .filter(room -> room.getLastMessagePreview() == null
                        || room.getLastMessagePreview().isBlank())
                .map(ChatRoom::getId).distinct().toList();
        if (roomIds.isEmpty()) return Map.of();
        Map<Long, String> previews = new HashMap<>();
        for (ChatMessage message : messageRepository.findLatestByRoomIds(roomIds)) {
            if (message.getRoom() != null && roomIds.contains(message.getRoom().getId())) {
                previews.put(message.getRoom().getId(), ChatRoom.previewContent(ChatMessageResponse.from(message).getContent()));
            }
        }
        return previews;
    }

    /** 현재 대표 사진을 한 페이지당 한 번에 읽는다. 방 생성 당시의 사진 스냅샷에 고정하지 않는다. */
    private Map<Long, String> storeImageUrls(List<ChatRoom> rooms) {
        List<Long> storeIds = rooms.stream().map(ChatRoom::getStoreId)
                .filter(id -> id != null).distinct().toList();
        if (storeIds.isEmpty()) return Map.of();
        Map<Long, String> imageUrls = new HashMap<>();
        for (Store store : storeRepository.findAllById(storeIds)) {
            if (store.getMainImageUrl() != null && !store.getMainImageUrl().isBlank()) {
                imageUrls.put(store.getId(), store.getMainImageUrl());
            }
        }
        return imageUrls;
    }

    private ConversationThreadResponse threadForMember(ChatRoom room) {
        String title = room.getType() == ChatRoom.RoomType.SUPPORT
                ? ConversationSummaryResponse.SUPPORT_NAME : room.getStoreNameSnapshot();
        MessageWindow window = recentWindow(room.getId(), room.getMember().getId());
        Store store = room.getType() == ChatRoom.RoomType.STORE
                ? storeRepository.findById(room.getStoreId()).orElse(null) : null;
        return ConversationThreadResponse.from(
                room, title, "MEMBER", room.getType() == ChatRoom.RoomType.SUPPORT
                        || (store != null && !store.isDeleted() && !store.isSuspended()),
                window.messages(), window.hasOlder(), window.nextBeforeId(),
                store == null ? null : store.getMainImageUrl());
    }

    private Store findMessageableStore(Long storeId) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ChatException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        if (store.isDeleted() || store.isSuspended()) {
            throw new ChatException("현재 문의를 받을 수 없는 가게입니다.", HttpStatus.CONFLICT);
        }
        return store;
    }

    private boolean isStoreMessageable(Long storeId) {
        if (storeId == null) return false;
        return storeRepository.findById(storeId)
                .map(store -> !store.isDeleted() && !store.isSuspended())
                .orElse(false);
    }

    private List<Long> ownedStoreIds(Member owner) {
        // 가게의 과거 소유 관계만 남아 있어도 USER·ADMIN 계정은 사장님 받은 문의를
        // 볼 수 없어야 한다. 역할 강등 뒤 목록·배지에서 방이 다시 보이는 것을 막는다.
        if (owner == null || !owner.isBusiness()) return List.of();
        return storeRepository.findByOwnerId(owner.getId()).stream()
                .map(Store::getId)
                .distinct()
                .toList();
    }

    private boolean ownsStore(Long storeId, Member owner) {
        if (storeId == null || owner == null || !owner.isBusiness()) return false;
        return storeRepository.findById(storeId)
                .map(Store::getOwner)
                .map(Member::getId)
                .filter(owner.getId()::equals)
                .isPresent();
    }

    private void assertStoreOwner(ChatRoom room, Member owner) {
        requireType(room, ChatRoom.RoomType.STORE);
        if (!ownsStore(room.getStoreId(), owner)) {
            throw new ChatException("가게 문의를 볼 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
    }

    private void assertNotBlocked(ChatRoom room) {
        if (room.isBlocked()) {
            throw new ChatException("차단된 대화에는 새 메시지를 보낼 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    private void requireType(ChatRoom room, ChatRoom.RoomType expected) {
        if (room.getType() != expected) {
            throw new ChatException("대화 유형이 올바르지 않습니다.", HttpStatus.FORBIDDEN);
        }
    }
}
