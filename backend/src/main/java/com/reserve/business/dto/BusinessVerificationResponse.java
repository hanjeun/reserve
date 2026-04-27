package com.reserve.business.dto;

import com.reserve.business.entity.BusinessVerification;
import com.reserve.business.entity.BusinessVerification.VerificationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessVerificationResponse {

    private Long id;
    private Long memberId;
    private String memberName;
    private String memberEmail;
    private String licenseImageKey;  // S3 key (관리자 상세 조회 시 Pre-signed URL로 변환됨)
    private String licenseImageUrl;  // Pre-signed URL (관리자 상세 조회 시에만 값 있음, 목록에선 null)
    private String businessName;
    private String businessNumber;
    private String memo;
    private VerificationStatus status;
    private String statusDisplayName;
    private String rejectionReason;
    private LocalDateTime createdAt;
    private LocalDateTime processedAt;
    private String processedByName;

    public static BusinessVerificationResponse fromEntity(BusinessVerification verification) {
        return BusinessVerificationResponse.builder()
                .id(verification.getId())
                .memberId(verification.getMember().getId())
                .memberName(verification.getMember().getName())
                .memberEmail(verification.getMember().getEmail())
                .licenseImageKey(verification.getLicenseImageKey())
                .businessName(verification.getBusinessName())
                .businessNumber(verification.getBusinessNumber())
                .memo(verification.getMemo())
                .status(verification.getStatus())
                .statusDisplayName(verification.getStatus().getDisplayName())
                .rejectionReason(verification.getRejectionReason())
                .createdAt(verification.getCreatedAt())
                .processedAt(verification.getProcessedAt())
                .processedByName(verification.getProcessedBy() != null ?
                        verification.getProcessedBy().getName() : null)
                .build();
    }

    /** 관리자 상세 조회 시 Pre-signed URL 포함 버전 */
    public static BusinessVerificationResponse fromEntityWithPresignedUrl(
            BusinessVerification verification, String presignedUrl) {
        return BusinessVerificationResponse.builder()
                .id(verification.getId())
                .memberId(verification.getMember().getId())
                .memberName(verification.getMember().getName())
                .memberEmail(verification.getMember().getEmail())
                .licenseImageKey(verification.getLicenseImageKey())
                .licenseImageUrl(presignedUrl)  // 5분짜리 임시 URL
                .businessName(verification.getBusinessName())
                .businessNumber(verification.getBusinessNumber())
                .memo(verification.getMemo())
                .status(verification.getStatus())
                .statusDisplayName(verification.getStatus().getDisplayName())
                .rejectionReason(verification.getRejectionReason())
                .createdAt(verification.getCreatedAt())
                .processedAt(verification.getProcessedAt())
                .processedByName(verification.getProcessedBy() != null ?
                        verification.getProcessedBy().getName() : null)
                .build();
    }
}
