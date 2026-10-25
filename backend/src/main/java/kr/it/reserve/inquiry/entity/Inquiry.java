package kr.it.reserve.inquiry.entity;

import kr.it.reserve.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Clock;
import java.time.LocalDateTime;

@Entity
@Table(name = "inquiry")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Inquiry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "inquiry_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    private Member member;

    // 비로그인(게스트) 문의용 — member가 null일 때만 사용됨 (정지된 회원도 문의 가능하게 하기 위함)
    @Column(name = "guest_name", length = 50)
    private String guestName;

    @Column(name = "guest_email", length = 100)
    private String guestEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InquiryCategory category;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private InquiryStatus status = InquiryStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String answer;

    @Column(name = "answered_at")
    private LocalDateTime answeredAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** 화면 표시 순서를 맞추고 ETC는 마지막에 둔다. 저장된 문자열과의 호환성을 위해 기존 열거값 이름을 바꾸거나 삭제하지 않는다. */
    public enum InquiryCategory {
        RESERVATION("예약 문의"),
        PAYMENT("결제 문의"),
        REFUND("환불 문의"),
        STORE("가게 문의"),
        AD("광고 문의"),
        REVIEW("리뷰 문의"),
        ACCOUNT("계정 문의"),
        ETC("기타 문의");

        private final String displayName;

        InquiryCategory(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    public enum InquiryStatus {
        PENDING("답변 대기"),
        ANSWERED("답변 완료");

        private final String displayName;

        InquiryStatus(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    public void answer(String answerContent) {
        this.answer = answerContent;
        this.status = InquiryStatus.ANSWERED;
        this.answeredAt = LocalDateTime.now(Clock.systemDefaultZone());
    }
}
