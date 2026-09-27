package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 고객지원({@link RoomType#SUPPORT})과 가게 문의({@link RoomType#STORE})의 공통 채팅방.
 *
 * <p><b>왜 Inquiry 를 고치지 않고 새로 만드나</b> — {@code Inquiry} 는 "문의 1건 + 답변" 모양이고
 * 채팅은 "방 1개 + 메시지 N개"다. 데이터 모양 자체가 달라서 억지로 끼우면 둘 다 어정쩡해진다.
 * 기존 {@code Inquiry}는 비회원도 남길 수 있는 단건 문의로 유지하고, 로그인 사용자의 연속 대화만
 * 이 모델에 둔다. 두 도메인을 섣불리 합치면 익명 문의의 보존·답변 계약까지 흔들린다.
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
                @Index(name = "idx_chat_room_member_type", columnList = "member_id, type"),
                // 사장님 받은 문의: 소유 가게 ID 집합 + 최근 시각으로 조회한다.
                @Index(name = "idx_chat_room_store_type", columnList = "store_id, type, last_message_at")
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
     * 방의 종류. 저장된 enum 값은 운영 데이터 호환을 위해 SUPPORT/STORE를 유지한다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20, nullable = false)
    @Builder.Default
    private RoomType type = RoomType.SUPPORT;

    /**
     * 가게 문의일 때만 채워진다({@link RoomType#STORE}). SUPPORT 면 {@code null}.
     *
     * <p>FK 를 걸지 않고 ID 만 갖는다. 가게가 삭제돼도 <b>대화 기록은 남아야 한다</b> —
     * "무슨 이야기가 오갔나"는 가게보다 오래 살아남는 기록이다.
     */
    @Column(name = "store_id")
    private Long storeId;

    /** 가게가 닫히거나 이름이 바뀌어도 과거 대화의 상대를 식별할 수 있는 생성 시점 이름. */
    @Column(name = "store_name_snapshot", length = 255)
    private String storeNameSnapshot;

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

    /** 가게 소유자가 아직 안 읽은 개수. 관리자 받은 문의와 절대 공유하지 않는다. */
    @Column(name = "owner_unread", nullable = false)
    @Builder.Default
    private int ownerUnread = 0;

    /** 목록 미리보기용 마지막 본문. 메시지 테이블을 방마다 다시 읽지 않게 한다. */
    @Column(name = "last_message_preview", length = 160)
    private String lastMessagePreview;

    /** 손님이 이 가게 대화를 차단한 시각. null이면 차단하지 않았다. */
    @Column(name = "member_blocked_at")
    private LocalDateTime memberBlockedAt;

    /** 가게 역할이 이 대화를 차단한 시각. 소유자가 바뀌어도 가게의 운영 상태로 승계한다. */
    @Column(name = "owner_blocked_at")
    private LocalDateTime ownerBlockedAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum RoomType {
        /** 손님 ↔ 관리자(서비스 문의). */
        SUPPORT,
        /** 손님 ↔ 사장님(가게 문의). 고객지원과 운영 권한·받은편지함이 분리된다. */
        STORE
    }

    /**
     * 메시지를 넣은 뒤 방의 요약 상태를 갱신한다.
     *
     * <p>보낸 쪽의 안 읽은 수는 0으로 만든다 — <b>내가 보내는 순간 나는 그 방을 보고 있다.</b>
     * 이걸 빼면 답장을 보낸 관리자에게 자기가 방금 읽은 방이 계속 "안 읽음"으로 남는다.
     */
    public void onMessageSent(SenderRole sender, LocalDateTime at, String content) {
        this.lastMessageAt = at;
        this.lastMessagePreview = previewContent(content);
        switch (sender) {
            case ADMIN -> {
                this.memberUnread += 1;
                this.adminUnread = 0;
            }
            case OWNER -> {
                this.memberUnread += 1;
                this.ownerUnread = 0;
            }
            case MEMBER -> {
                this.memberUnread = 0;
                if (this.type == RoomType.STORE) this.ownerUnread += 1;
                else this.adminUnread += 1;
            }
        }
    }

    /** 그 쪽이 방을 열었다 — 안 읽은 수를 0으로. */
    public void markRead(SenderRole reader) {
        if (reader == SenderRole.ADMIN) this.adminUnread = 0;
        else if (reader == SenderRole.OWNER) this.ownerUnread = 0;
        else this.memberUnread = 0;
    }

    /** 한쪽이라도 차단하면 상대가 계속 보내는 우회가 없도록 양쪽 전송을 모두 멈춘다. */
    public boolean isBlocked() {
        return memberBlockedAt != null || ownerBlockedAt != null;
    }

    public boolean isBlockedBy(SenderRole role) {
        if (role == SenderRole.MEMBER) return memberBlockedAt != null;
        if (role == SenderRole.OWNER) return ownerBlockedAt != null;
        return false;
    }

    /** 서비스가 참가자 권한과 STORE 유형을 확인한 뒤 호출한다. 같은 요청은 멱등이다. */
    public void setBlocked(SenderRole role, boolean blocked, LocalDateTime at) {
        if (role == SenderRole.MEMBER) memberBlockedAt = blocked ? at : null;
        else if (role == SenderRole.OWNER) ownerBlockedAt = blocked ? at : null;
        else throw new IllegalArgumentException("Only store conversation participants can block a room");
    }

    /** 저장된 요약이 없는 이전 방의 읽기 전용 미리보기에도 같은 길이 규칙을 적용한다. */
    public static String previewContent(String content) {
        if (content == null) return null;
        String singleLine = content.replaceAll("\\s+", " ").trim();
        return singleLine.length() <= 150 ? singleLine : singleLine.substring(0, 150) + "…";
    }
}
