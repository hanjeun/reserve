package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatMessageHidden;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ChatMessageHiddenRepository extends JpaRepository<ChatMessageHidden, Long> {
    boolean existsByMemberIdAndMessageId(Long memberId, Long messageId);

    @Query("SELECT hidden.message.id FROM ChatMessageHidden hidden WHERE hidden.member.id = :memberId AND hidden.message.id IN :messageIds")
    List<Long> findHiddenMessageIds(@Param("memberId") Long memberId, @Param("messageIds") Collection<Long> messageIds);

    @Query("SELECT DISTINCT hidden.message.room.id FROM ChatMessageHidden hidden WHERE hidden.member.id = :memberId AND hidden.message.room.id IN :roomIds")
    List<Long> findHiddenRoomIds(@Param("memberId") Long memberId, @Param("roomIds") Collection<Long> roomIds);

    Slice<ChatMessageHidden> findByMember_IdAndMessage_Room_IdAndIdGreaterThanOrderByIdAsc(
            Long memberId, Long roomId, Long afterId, Pageable pageable);

    void deleteByMemberId(Long memberId);
}
