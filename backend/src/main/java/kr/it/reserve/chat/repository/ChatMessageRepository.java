package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatMessage;
import kr.it.reserve.chat.entity.ChatReport;
import kr.it.reserve.chat.entity.SenderRole;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Collection;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    interface RetentionCandidate {
        Long getId();
        Long getRoomId();
    }

    @Query("""
            SELECT m.id AS id, m.room.id AS roomId FROM ChatMessage m
             WHERE m.purgedAt IS NULL AND m.createdAt < :cutoff
              AND NOT EXISTS (SELECT r.id FROM ChatReport r WHERE r.room.id = m.room.id AND (
                r.evidenceCapturedAt IS NULL OR r.retentionHold = true OR r.status IN :activeStatuses
                OR r.retentionCategory IN :heldCategories OR r.retentionCategory IS NULL
                OR r.minimumRetentionUntil >= :now))
             ORDER BY m.createdAt, m.id
            """)
    List<RetentionCandidate> findExpired(@Param("cutoff") java.time.LocalDateTime cutoff,
            @Param("activeStatuses") Collection<ChatReport.Status> activeStatuses,
            @Param("heldCategories") Collection<ChatReport.RetentionCategory> heldCategories,
            @Param("now") java.time.LocalDateTime now, Pageable pageable);

    boolean existsByImageKey(String imageKey);
    boolean existsByImageKeyAndIdNot(String imageKey, Long id);

    Slice<ChatMessage> findByRoomIdAndRetractionRevisionGreaterThanOrderByRetractionRevisionAsc(
            Long roomId, Long revision, Pageable pageable);

    java.util.Optional<ChatMessage> findByIdAndRoomId(Long id, Long roomId);

    /** 실제로 수신한 커서 뒤에 남은 상대 메시지 수. 방 쓰기 잠금 아래에서만 읽음 갱신에 사용한다. */
    @Query("""
            SELECT COUNT(message) FROM ChatMessage message
             WHERE message.room.id = :roomId AND message.id > :readThroughId
               AND message.senderRole <> :reader
            """)
    long countUnreadAfter(@Param("roomId") Long roomId,
                          @Param("readThroughId") Long readThroughId,
                          @Param("reader") SenderRole reader);

    java.util.Optional<ChatMessage> findByRoomIdAndSenderMemberIdAndClientMessageId(
            Long roomId, Long senderMemberId, String clientMessageId);

    /** 이미 권한 검사한 한 페이지의 방들에서 마지막 실제 메시지만 배치 조회한다. */
    @Query("""
            SELECT message FROM ChatMessage message
             WHERE message.room.id IN :roomIds
               AND message.id = (
                   SELECT MAX(latest.id) FROM ChatMessage latest
                    WHERE latest.room.id = message.room.id
               )
            """)
    List<ChatMessage> findLatestByRoomIds(@Param("roomIds") List<Long> roomIds);

    /**
     * 방의 메시지를 <b>최신부터</b> 페이지 단위로. 화면이 뒤집어서 그린다.
     *
     * <p>오래된 것부터 주면 "마지막 페이지"를 먼저 계산해야 대화 끝을 보여줄 수 있다.
     * 채팅은 항상 끝에서 시작하므로 최신부터가 자연스럽다.
     */
    Slice<ChatMessage> findByRoomIdOrderByIdDesc(Long roomId, Pageable pageable);

    /** 위로 스크롤할 때 기준 ID보다 오래된 메시지를 최신순으로 제한 조회한다. */
    Slice<ChatMessage> findByRoomIdAndIdLessThanOrderByIdDesc(
            Long roomId, Long beforeId, Pageable pageable);

    /** 폴링용 — 이 ID보다 뒤에 온 메시지를 오래된 것부터 제한 조회한다. */
    Slice<ChatMessage> findByRoomIdAndIdGreaterThanOrderByIdAsc(Long roomId, Long afterId, Pageable pageable);
}
