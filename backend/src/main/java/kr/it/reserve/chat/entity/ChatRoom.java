package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 채팅방 — 1단계는 <b>손님 ↔ 관리자</b> 한 방향뿐이다 (2026-08-24 신설).
 *
 * <p><b>왜 Inquiry 를 고치지 않고 새로 만드나</b> — {@code Inquiry} 는 "문의 1건 + 답변" 모양이고
 * 채팅은 "방 1개 + 메시지 N개"다. 데이터 모양 자체가 달라서 억지로 끼우면 둘 다 어정쩡해진다.
 * 채팅이 자리를 잡으면 그때 문의를 흡수할지 정한다 — 지금 합치면 되돌리기가 어렵다.
 *
 * <p><b>왜 손님↔관리자부터인가</b> — 화면이 둘(손님·관리자)로 끝난다. 여기서 폴링 주기·읽음 처리·
 * UI 를 다 검증한 뒤 가게 문의로 넓히면 두 번째는 훨씬 빠르다. 처음부터 셋을 만들면
 * 세 화면이 동시에 미완성인 구간이 길어진다.
 *
 * <p>{@link #type} 과 {@link #store} 를 지금부터 두는 이유는 <b>나중에 컬럼을 추가하는 것보다
 * 처음부터 있는 편이 싸기</b> 때문이다 — {@code ddl-auto: update} 는 컬럼 추가는 해주지만
 * 기존 행을 채워주지 않아서, 나중에 넣으면 전부 {@code NULL} 인 채로 해석 규칙이 필요해진다.
 */
@Entity
@Table(
        name = "chat_room",
        indexes = {
                // 관리자 목록: 안 읽은 방 먼저, 그다음 최근 순. 두 컬럼이 같이 쓰인다.
                @Index(name = "idx_chat_room_last_message", columnList = "last_message_at"),
                // 손님이 자기 방을 찾는 경로. member + type 조합으로 조회한다.
                @Index(name = "idx_chat_room_member_type", columnList = "member_id, type")
        }
)
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 방의 주인 = 손님. 관리자는 방을 소유하지 않고 모든 방에 들어간다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    /**
     * 방의 종류. 1단계는 {@link RoomType#SUPPORT} 하나뿐이다.
     * 값을 미리 둔 이유는 위 클래스 주석 참고.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20, nullable = false)
    @Builder.Default
    private RoomType type = RoomType.SUPPORT;

    /**
     * 가게 문의일 때만 채워진다({@link RoomType#STORE}). SUPPORT 면 {@code null}.
     * 지금은 항상 null 이다 — 2단계에서 쓴다.
     *
     * <p>FK 를 걸지 않고 ID 만 갖는다. 가게가 삭제돼도 <b>대화 기록은 남아야 한다</b> —
     * "무슨 이야기가 오갔나"는 가게보다 오래 살아남는 기록이다.
     */
    @Column(name = "store_id")
    private Long storeId;

    /**
     * 마지막 메시지 시각. 목록 정렬에 쓴다.
     *
     * <p>메시지 테이블을 매번 집계하지 않으려고 여기 둔다 — 목록 한 화면에 방이 20개면
     * 집계 쿼리가 20번 나가거나 조인이 복잡해진다. 대신 <b>메시지를 넣을 때마다 같이 갱신</b>해야 한다.
     */
    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;

    /** 손님이 아직 안 읽은 개수. 관리자가 보내면 증가하고, 손님이 방을 열면 0이 된다. */
    @Column(name = "member_unread", nullable = false)
    @Builder.Default
    private int memberUnread = 0;

    /** 관리자가 아직 안 읽은 개수. 손님이 보내면 증가하고, 관리자가 방을 열면 0이 된다. */
    @Column(name = "admin_unread", nullable = false)
    @Builder.Default
    private int adminUnread = 0;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum RoomType {
        /** 손님 ↔ 관리자(서비스 문의). 1단계. */
        SUPPORT,
        /** 손님 ↔ 사장님(가게 문의). 2단계 — 아직 안 쓴다. */
        STORE
    }

    /**
     * 메시지를 넣은 뒤 방의 요약 상태를 갱신한다.
     *
     * <p>보낸 쪽의 안 읽은 수는 0으로 만든다 — <b>내가 보내는 순간 나는 그 방을 보고 있다.</b>
     * 이걸 빼면 답장을 보낸 관리자에게 자기가 방금 읽은 방이 계속 "안 읽음"으로 남는다.
     */
    public void onMessageSent(SenderRole sender, LocalDateTime at) {
        this.lastMessageAt = at;
        if (sender == SenderRole.ADMIN) {
            this.memberUnread += 1;
            this.adminUnread = 0;
        } else {
            this.adminUnread += 1;
            this.memberUnread = 0;
        }
    }

    /** 그 쪽이 방을 열었다 — 안 읽은 수를 0으로. */
    public void markRead(SenderRole reader) {
        if (reader == SenderRole.ADMIN) this.adminUnread = 0;
        else this.memberUnread = 0;
    }
}
