package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatRoom;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    Optional<ChatRoom> findByMemberIdAndType(Long memberId, ChatRoom.RoomType type);

    /**
     * 관리자 목록 — <b>안 읽은 방이 먼저, 그다음 최근 순.</b>
     *
     * <p>단순히 최근 순으로 두면 답을 기다리는 방이 활발한 방에 밀려 아래로 내려간다.
     * 관리자 화면에서 제일 중요한 건 "아직 답 안 한 방"이라 그걸 위로 올린다.
     *
     * <p>{@code JOIN FETCH member} — 목록이 손님 이름·이메일을 보여주므로 없으면 방 개수만큼
     * 추가 쿼리가 나간다(N+1).
     */
    @Query(value = """
            SELECT r FROM ChatRoom r
              JOIN FETCH r.member
             ORDER BY CASE WHEN r.adminUnread > 0 THEN 0 ELSE 1 END,
                      r.lastMessageAt DESC NULLS LAST
            """,
            countQuery = "SELECT COUNT(r) FROM ChatRoom r")
    Page<ChatRoom> findAllForAdmin(Pageable pageable);

    /** 관리자 배지용 — 답을 기다리는 방이 몇 개인가. 목록을 안 불러오고 숫자만 본다. */
    @Query("SELECT COUNT(r) FROM ChatRoom r WHERE r.adminUnread > 0")
    long countRoomsWaitingForAdmin();

    /** 손님 배지용. 방이 없으면 0. */
    @Query("SELECT COALESCE(SUM(r.memberUnread), 0) FROM ChatRoom r WHERE r.member.id = :memberId")
    long sumMemberUnread(@Param("memberId") Long memberId);
}
