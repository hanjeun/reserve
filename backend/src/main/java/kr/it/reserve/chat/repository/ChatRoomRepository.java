package kr.it.reserve.chat.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.chat.entity.ChatRoom;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    Optional<ChatRoom> findByMemberIdAndType(Long memberId, ChatRoom.RoomType type);

    Optional<ChatRoom> findByMemberIdAndTypeAndStoreId(
            Long memberId, ChatRoom.RoomType type, Long storeId);

    /** 같은 회원의 방 생성·메시지·읽음 갱신을 직렬화한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ChatRoom r WHERE r.member.id = :memberId AND r.type = :type")
    Optional<ChatRoom> findByMemberIdAndTypeForUpdate(
            @Param("memberId") Long memberId,
            @Param("type") ChatRoom.RoomType type);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ChatRoom r WHERE r.member.id = :memberId AND r.type = :type AND r.storeId = :storeId")
    Optional<ChatRoom> findStoreChatForUpdate(
            @Param("memberId") Long memberId,
            @Param("type") ChatRoom.RoomType type,
            @Param("storeId") Long storeId);

    /** 관리자 메시지·읽음 갱신도 같은 방 행 잠금을 사용한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ChatRoom r WHERE r.id = :id")
    Optional<ChatRoom> findByIdForUpdate(@Param("id") Long id);

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
             WHERE r.type = :type
               AND r.lastMessageAt IS NOT NULL
             ORDER BY CASE WHEN r.adminUnread > 0 THEN 0 ELSE 1 END,
                      r.lastMessageAt DESC NULLS LAST
            """,
            countQuery = "SELECT COUNT(r) FROM ChatRoom r WHERE r.type = :type AND r.lastMessageAt IS NOT NULL")
    Page<ChatRoom> findAllForAdmin(@Param("type") ChatRoom.RoomType type, Pageable pageable);

    /** 관리자 배지용 — 답을 기다리는 방이 몇 개인가. 목록을 안 불러오고 숫자만 본다. */
    @Query("SELECT COUNT(r) FROM ChatRoom r WHERE r.type = :type AND r.adminUnread > 0")
    long countRoomsWaitingForAdmin(@Param("type") ChatRoom.RoomType type);

    /** 통합 메신저 런처 배지는 방 수가 아니라 실제 안 읽은 메시지 수를 보여준다. */
    @Query("SELECT COALESCE(SUM(r.adminUnread), 0) FROM ChatRoom r WHERE r.type = :type")
    long sumAdminUnread(@Param("type") ChatRoom.RoomType type);

    /** 손님 배지용. 방이 없으면 0. */
    @Query("SELECT COALESCE(SUM(r.memberUnread), 0) FROM ChatRoom r WHERE r.member.id = :memberId")
    long sumMemberUnread(@Param("memberId") Long memberId);

    @Query("""
            SELECT r FROM ChatRoom r
             WHERE r.member.id = :memberId
               AND r.lastMessageAt IS NOT NULL
               AND r.memberHiddenAt IS NULL
             ORDER BY CASE WHEN r.memberUnread > 0 THEN 0 ELSE 1 END,
                      r.lastMessageAt DESC NULLS LAST, r.id DESC
            """)
    Page<ChatRoom> findForMember(@Param("memberId") Long memberId, Pageable pageable);

    @Query("SELECT r FROM ChatRoom r WHERE r.member.id = :memberId AND r.memberHiddenAt IS NOT NULL ORDER BY r.lastMessageAt DESC, r.id DESC")
    Page<ChatRoom> findHiddenForMember(@Param("memberId") Long memberId, Pageable pageable);

    @Query(value = """
            SELECT r FROM ChatRoom r JOIN FETCH r.member
             WHERE r.type = :type AND r.storeId IN :storeIds AND r.lastMessageAt IS NOT NULL
               AND ((:hidden = true AND r.ownerHiddenAt IS NOT NULL AND r.ownerHiddenByMemberId = :ownerId)
                 OR (:hidden = false AND (r.ownerHiddenAt IS NULL OR r.ownerHiddenByMemberId <> :ownerId)))
             ORDER BY CASE WHEN r.ownerUnread > 0 THEN 0 ELSE 1 END, r.lastMessageAt DESC, r.id DESC
            """, countQuery = """
            SELECT COUNT(r) FROM ChatRoom r
             WHERE r.type = :type AND r.storeId IN :storeIds AND r.lastMessageAt IS NOT NULL
               AND ((:hidden = true AND r.ownerHiddenAt IS NOT NULL AND r.ownerHiddenByMemberId = :ownerId)
                 OR (:hidden = false AND (r.ownerHiddenAt IS NULL OR r.ownerHiddenByMemberId <> :ownerId)))
            """)
    Page<ChatRoom> findVisibleStoreInbox(@Param("type") ChatRoom.RoomType type, @Param("storeIds") List<Long> storeIds,
                                        @Param("ownerId") Long ownerId, @Param("hidden") boolean hidden, Pageable pageable);

    @Query(value = """
            SELECT r FROM ChatRoom r
              JOIN FETCH r.member
             WHERE r.type = :type
               AND r.storeId IN :storeIds
               AND r.lastMessageAt IS NOT NULL
             ORDER BY CASE WHEN r.ownerUnread > 0 THEN 0 ELSE 1 END,
                      r.lastMessageAt DESC NULLS LAST, r.id DESC
            """,
            countQuery = """
            SELECT COUNT(r) FROM ChatRoom r
             WHERE r.type = :type
               AND r.storeId IN :storeIds
               AND r.lastMessageAt IS NOT NULL
            """)
    Page<ChatRoom> findStoreInbox(
            @Param("type") ChatRoom.RoomType type,
            @Param("storeIds") List<Long> storeIds,
            Pageable pageable);

    @Query("""
            SELECT COALESCE(SUM(r.ownerUnread), 0) FROM ChatRoom r
             WHERE r.type = :type
               AND r.storeId IN :storeIds
            """)
    long sumOwnerUnread(
            @Param("type") ChatRoom.RoomType type,
            @Param("storeIds") List<Long> storeIds);
}
