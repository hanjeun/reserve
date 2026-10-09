package kr.it.reserve.chat.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

/** 계정별 표시 제외만 저장한다. 메시지 원문·첨부·신고 증거는 변경하지 않는다. */
@Entity
@Table(name = "chat_message_hidden", uniqueConstraints =
        @UniqueConstraint(name = "uk_chat_hidden_viewer", columnNames = {"message_id", "member_id"}),
        indexes = @Index(name = "idx_chat_hidden_poll", columnList = "member_id,id"))
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessageHidden {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "message_id", nullable = false, foreignKey = @ForeignKey(name = "fk_chat_hidden_message"))
    @OnDelete(action = OnDeleteAction.CASCADE)
    private ChatMessage message;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false, foreignKey = @ForeignKey(name = "fk_chat_hidden_member"))
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Member member;

    @Column(name = "hidden_at", nullable = false)
    private LocalDateTime hiddenAt;
}
