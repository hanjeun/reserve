package com.reserve.business.entity;

import com.reserve.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "business_verification")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class BusinessVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 신청한 회원
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    // 사업자 등록증 S3 key (URL이 아닌 key 저장 → 조회 시 Pre-signed URL 생성)
    // 예: users/1/businesses/uuid.jpg  또는  local/users/1/businesses/uuid.jpg
    @Column(name = "license_image_url", nullable = false)
    private String licenseImageKey;

    // 상호명
    @Column(name = "business_name", nullable = false)
    private String businessName;

    // 사업자 등록번호
    @Column(name = "business_number", length = 20)
    private String businessNumber;

    // 추가 메모 (선택사항)
    @Column(name = "memo", length = 500)
    private String memo;

    // 인증 상태
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private VerificationStatus status = VerificationStatus.PENDING;

    // 거절 사유
    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    // 신청 일시
    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // 처리 일시
    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    // 처리한 관리자
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "processed_by")
    private Member processedBy;

    // 인증 상태 enum
    public enum VerificationStatus {
        PENDING("대기중"),
        APPROVED("승인됨"),
        REJECTED("거절됨");

        private final String displayName;

        VerificationStatus(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    // 승인 처리
    public void approve(Member admin) {
        this.status = VerificationStatus.APPROVED;
        this.processedAt = LocalDateTime.now();
        this.processedBy = admin;
        this.rejectionReason = null;
    }

    // 거절 처리
    public void reject(Member admin, String reason) {
        this.status = VerificationStatus.REJECTED;
        this.processedAt = LocalDateTime.now();
        this.processedBy = admin;
        this.rejectionReason = reason;
    }
}
