package kr.it.reserve.chat.service;

import kr.it.reserve.chat.dto.ChatMessageResponse;
import kr.it.reserve.chat.dto.ChatRoomResponse;
import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.entity.SenderRole;
import kr.it.reserve.chat.repository.ChatMessageRepository;
import kr.it.reserve.chat.repository.ChatRoomRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 인앱 채팅 (2026-08-24 신설). 1단계는 <b>손님 ↔ 관리자</b>뿐이다.
 *
 * <p><b>★ 실시간을 WebSocket 이 아니라 폴링으로 하는 이유</b>
 * <ul>
 *   <li><b>블루/그린 배포마다 모든 연결이 끊긴다.</b> 재연결·유실 복구를 직접 짜야 한다</li>
 *   <li>서버 메모리 여유가 실측 600MB 뿐이다(2026-08-19). 연결 상태를 들고 있을 여유가 적다</li>
 *   <li>예약 플랫폼 문의는 <b>실시간성이 낮다.</b> 3~5초 폴링이면 체감이 거의 같다</li>
 * </ul>
 * 그래서 {@link #getNewMessages}(증분 조회)를 두고, 화면은 <b>패널이 열려 있을 때만</b> 폴링한다.
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
        return recentMessages(room.getId());
    }

    @Transactional
    public ChatMessageResponse sendAsMember(Member member, String content) {
        ChatRoom room = openMyRoom(member);
        return append(room, SenderRole.MEMBER, member.getId(), content);
    }

    public long myUnreadCount(Member member) {
        return roomRepository.sumMemberUnread(member.getId());
    }

    // ── 관리자 ──────────────────────────────────────────────────────────────

    public Page<ChatRoomResponse> listRoomsForAdmin(int page) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), ROOM_PAGE_SIZE);
        return roomRepository.findAllForAdmin(pageable).map(ChatRoomResponse::from);
    }

    @Transactional
    public List<ChatMessageResponse> readRoomAsAdmin(Long roomId) {
        ChatRoom room = findRoomForUpdate(roomId);
        room.markRead(SenderRole.ADMIN);
        return recentMessages(roomId);
    }

    @Transactional
    public ChatMessageResponse sendAsAdmin(Member admin, Long roomId, String content) {
        ChatRoom room = findRoomForUpdate(roomId);
        return append(room, SenderRole.ADMIN, admin.getId(), content);
    }

    public long adminWaitingRoomCount() {
        return roomRepository.countRoomsWaitingForAdmin();
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
        return messageRepository
                .findByRoomIdAndIdGreaterThanOrderByIdAsc(roomId, afterId == null ? 0L : afterId)
                .stream().map(ChatMessageResponse::from).toList();
    }

    /** 그 방이 이 회원의 것인지. 손님 경로에서 방 ID 를 받을 때 쓴다. */
    public void assertOwnedBy(Long roomId, Member member) {
        ChatRoom room = findRoom(roomId);
        if (!room.getMember().getId().equals(member.getId())) {
            throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
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

    private List<ChatMessageResponse> recentMessages(Long roomId) {
        List<ChatMessageResponse> desc = messageRepository
                .findByRoomIdOrderByIdDesc(roomId, PageRequest.of(0, PAGE_SIZE))
                .map(ChatMessageResponse::from).getContent();
        // 저장소는 최신부터 주고 화면은 오래된 것부터 그린다 — 뒤집는 곳을 한 군데로 모은다.
        return desc.reversed();
    }

    /**
     * 메시지를 넣고 방 요약을 갱신한다.
     *
     * <p>둘이 <b>같은 트랜잭션</b>이어야 한다. 메시지만 들어가고 {@code lastMessageAt} 이 안 바뀌면
     * 관리자 목록에서 그 방이 아래에 그대로 남아 답을 못 받는다.
     */
    private ChatMessageResponse append(ChatRoom room, SenderRole sender, Long senderId, String content) {
        String trimmed = content == null ? "" : content.trim();
        if (trimmed.isEmpty()) {
            throw new ChatException("내용을 입력해주세요.");
        }

        ChatMessage saved = messageRepository.save(ChatMessage.builder()
                .room(room)
                .senderRole(sender)
                .senderMemberId(senderId)
                .content(trimmed)
                .build());

        room.onMessageSent(sender, LocalDateTime.now());
        log.info("Chat message sent: roomId={}, sender={}", room.getId(), sender);
        return ChatMessageResponse.from(saved);
    }
}
