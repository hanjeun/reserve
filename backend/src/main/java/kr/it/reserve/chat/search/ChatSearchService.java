package kr.it.reserve.chat.search;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import kr.it.reserve.chat.dto.ConversationSummaryResponse;
import kr.it.reserve.chat.dto.ConversationThreadResponse;
import kr.it.reserve.chat.entity.ChatRoom;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.chat.service.ChatService;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.policy.MemberSearchAccess;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true, timeout = 3)
public class ChatSearchService {
    private static final int SIZE = 20;
    private static final String ACCESS = """
            room.memberBlockedAt IS NULL AND room.ownerBlockedAt IS NULL
            AND EXISTS (SELECT viewer.id FROM Member viewer WHERE viewer.id = :memberId AND
            """ + MemberSearchAccess.VISIBLE + """
                AND viewer.role = :role)
            AND ((room.member.id = :memberId AND room.memberHiddenAt IS NULL)
              OR (:business = true AND room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.STORE
                AND (room.ownerHiddenAt IS NULL OR room.ownerHiddenByMemberId <> :memberId)
                AND EXISTS (SELECT store.id FROM Store store WHERE store.id = room.storeId AND store.owner.id = :memberId))
              OR (:admin = true AND room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.SUPPORT))
            """;
    private static final String MESSAGE_VISIBLE = """
            message.purgedAt IS NULL AND message.retractedAt IS NULL AND message.createdAt >= :cutoff
            AND NOT EXISTS (SELECT hidden.id FROM ChatMessageHidden hidden
                WHERE hidden.message.id = message.id AND hidden.member.id = :memberId)
            """;
    private static final String ROOM_FIELDS = "room.id, room.type, room.storeId, room.storeNameSnapshot, counterpart.id, counterpart.name, counterpart.profileImage, ";
    private final ChatService chats;
    @PersistenceContext private EntityManager entityManager;

    public record Hit(String type, Long id, Long roomId, Long storeId, Long messageId, String kind,
            String title, String description, String imageUrl, LocalDateTime at) { }
    public record Result(List<Hit> conversations, List<Hit> messages, boolean moreConversations, boolean moreMessages, int page) { }

    public Result search(Member member, String keyword, String scope, int page) {
        String term = keyword == null ? "" : keyword.strip();
        if (term.length() > 100 || page < 0 || page > 1000 || !List.of("all", "conversations", "messages").contains(scope))
            throw new ChatException("검색 조건을 다시 확인해주세요.");
        if (term.isBlank()) return new Result(List.of(), List.of(), false, false, page);
        String pattern = "%" + term.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        List<Object[]> rooms = "messages".equals(scope) ? List.of() : query("SELECT " + ROOM_FIELDS + "room.lastMessageAt FROM ChatRoom room JOIN room.member counterpart WHERE " + ACCESS + """
                AND room.lastMessageAt IS NOT NULL
                AND (LOWER(room.storeNameSnapshot) LIKE :keyword ESCAPE '!'
                  OR (room.member.id <> :memberId AND LOWER(counterpart.name) LIKE :keyword ESCAPE '!')
                  OR (room.member.id = :memberId AND room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.SUPPORT
                    AND LOWER(:supportName) LIKE :keyword ESCAPE '!'))
                ORDER BY room.lastMessageAt DESC, room.id DESC
                """, Object[].class, member).setParameter("keyword", pattern)
                .setParameter("supportName", ConversationSummaryResponse.SUPPORT_NAME)
                .setFirstResult(page * SIZE).setMaxResults(SIZE + 1).getResultList();
        List<Object[]> messages = "conversations".equals(scope) ? List.of() : query("SELECT " + ROOM_FIELDS + "message.createdAt, message.id, message.content, message.imageOriginalFilename FROM ChatMessage message JOIN message.room room JOIN room.member counterpart WHERE " + ACCESS + " AND " + MESSAGE_VISIBLE + """
                AND (LOWER(message.content) LIKE :keyword ESCAPE '!' OR LOWER(message.imageOriginalFilename) LIKE :keyword ESCAPE '!')
                ORDER BY message.id DESC
                """, Object[].class, member).setParameter("keyword", pattern).setParameter("cutoff", cutoff())
                .setFirstResult(page * SIZE).setMaxResults(SIZE + 1).getResultList();
        return new Result(rooms.stream().limit(SIZE).map(row -> hit(row, member, term, false)).toList(),
                messages.stream().limit(SIZE).map(row -> hit(row, member, term, true)).toList(),
                rooms.size() > SIZE && page < 1000, messages.size() > SIZE && page < 1000, page);
    }

    public ConversationThreadResponse context(Member member, Long roomId, Long messageId) {
        if (roomId == null || roomId <= 0 || messageId == null || messageId <= 0 || messageId == Long.MAX_VALUE)
            throw new ChatException("검색한 메시지를 다시 선택해주세요.");
        var matches = query("SELECT message.id FROM ChatMessage message JOIN message.room room WHERE " + ACCESS + " AND "
                + MESSAGE_VISIBLE + " AND room.id = :roomId AND message.id = :messageId", Long.class, member)
                .setParameter("cutoff", cutoff()).setParameter("roomId", roomId).setParameter("messageId", messageId)
                .setMaxResults(1).getResultList();
        if (matches.isEmpty()) throw new ChatException("검색한 메시지를 볼 수 없어요.", HttpStatus.NOT_FOUND);
        return chats.getSearchContext(member, roomId, messageId);
    }

    private <T> TypedQuery<T> query(String text, Class<T> type, Member member) {
        return MemberSearchAccess.bind(entityManager.createQuery(text, type), member.getId())
                .setParameter("role", member.getRole()).setParameter("business", member.isBusiness()).setParameter("admin", member.isAdmin());
    }
    private static LocalDateTime cutoff() { return LocalDateTime.now(Clock.systemUTC()).minusDays(ChatRetentionPolicy.MESSAGE_RETENTION_DAYS); }
    private Hit hit(Object[] row, Member member, String term, boolean message) {
        boolean customer = member.getId().equals(row[4]);
        boolean support = row[1] == ChatRoom.RoomType.SUPPORT;
        String kind = customer ? support ? "support" : "store" : support ? "admin" : "owner";
        String title = customer ? support ? ConversationSummaryResponse.SUPPORT_NAME : (String) row[3] : (String) row[5];
        String description = message ? excerpt((String) row[9], (String) row[10], term)
                : support ? "고객지원 대화" : customer ? "가게 문의" : (String) row[3];
        Long messageId = message ? (Long) row[8] : null;
        return new Hit(message ? "MESSAGE" : "CONVERSATION", message ? messageId : (Long) row[0], (Long) row[0], (Long) row[2],
                messageId, kind, title == null || title.isBlank() ? "대화 상대" : title, description,
                customer ? null : (String) row[6], (LocalDateTime) row[7]);
    }
    private String excerpt(String content, String filename, String term) {
        String text = content == null || content.isBlank() ? "[사진] " + (filename == null ? "" : filename) : content;
        int match = text.toLowerCase(Locale.ROOT).indexOf(term.toLowerCase(Locale.ROOT));
        int start = Math.max(0, match - 45);
        int end = Math.min(text.length(), start + 160);
        return (start > 0 ? "…" : "") + text.substring(start, end) + (end < text.length() ? "…" : "");
    }
}
