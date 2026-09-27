package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 채팅 메시지 한 줄 (2026-08-24 신설).
 *
 * <p><b>수정·삭제가 없다.</b> 대화 기록은 "무슨 이야기가 오갔나"의 증거이고,
 * 고칠 수 있게 만드는 순간 증거가 아니게 된다. 환불 원장을 읽기 전용으로 둔 것과 같은 이유다.
 */
@Entity
@Table(
        name = "chat_message",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_chat_message_idempotency",
                columnNames = {"room_id", "sender_member_id", "client_message_id"}),
        indexes = {
                // 방 하나의 메시지를 시간순으로 읽는다 — 사실상 유일한 조회 패턴이다.
                @Index(name = "idx_chat_message_room", columnList = "room_id, id"),
                @Index(name = "idx_chat_message_idempotency", columnList = "room_id, sender_member_id, client_message_id")
        }
)
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoom room;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_role", length = 10, nullable = false)
    private SenderRole senderRole;

    /**
     * 보낸 사람의 회원 ID. 관리자가 여러 명일 때 "누가 답했나"를 알기 위해 남긴다.
     *
     * <p>FK 가 아니라 값이다 — 계정이 사라져도 대화는 남아야 한다.
     */
    @Column(name = "sender_member_id")
    private Long senderMemberId;

    /**
     * 클라이언트가 한 전송 시도에 붙인 안정 ID. 응답을 못 받아 재시도해도 방 잠금 아래
     * 같은 ID를 먼저 찾아 한 줄만 저장한다. 구버전 요청은 null로 계속 허용한다.
     */
    @Column(name = "client_message_id", length = 64)
    private String clientMessageId;

    /**
     * 본문. 길이를 {@code TEXT} 로 두되 <b>입력 단계에서 2000자로 자른다</b>(DTO 검증).
     * 채팅에 장문을 붙여넣는 건 대개 실수라, 막는 편이 서로에게 낫다.
     */
    @Column(name = "content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "image_key", length = 512)
    private String imageKey;

    @Column(name = "image_content_type", length = 40)
    private String imageContentType;

    @Column(name = "image_width")
    private Integer imageWidth;

    @Column(name = "image_height")
    private Integer imageHeight;

    @Column(name = "image_bytes")
    private Integer imageBytes;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
