package com.reserve.advertisement.entity;

import com.reserve.store.entity.Store;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 가게 광고.
 *
 * 결제(Portone)는 예약금 결제(Payment/PaymentService)와 완전히 분리된 독립 흐름 —
 * 기존 예약 결제 코드는 전혀 건드리지 않고, PortoneService(순수 API 래퍼)만 재사용한다.
 * 그래서 merchantUid/결제 상태를 이 엔티티가 자체적으로 갖고 있다.
 *
 * 노출 방식: 결제 완료 즉시 ACTIVE(사전 관리자 승인 없음) — 문제가 생기면
 * 관리자가 사후에 SUSPENDED로 내린다(Store의 정지 패턴과 동일한 철학).
 */
@Entity
@Table(name = "advertisement")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Advertisement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ad_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Enumerated(EnumType.STRING)
    @Column(name = "ad_type", nullable = false)
    private AdType adType;

    // BANNER 타입만 사용 (S3 CloudFront URL, 콤마로 구분된 문자열로 저장 — Store.detailImages와 동일한 패턴). BADGE는 null.
    @Column(name = "image_urls", length = 2000)
    private String imageUrls;

    // BANNER 타입만 사용 — 배너에 표시할 문구
    @Column(name = "title", length = 100)
    private String title;

    @Column(name = "description", length = 300)
    private String description;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "amount", nullable = false)
    private Integer amount;

    @Column(name = "merchant_uid", nullable = false, unique = true)
    private String merchantUid;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private AdStatus status = AdStatus.PENDING_PAYMENT;

    @Column(name = "suspend_reason")
    private String suspendReason;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /** 오늘 날짜 기준으로 노출 기간 내인지 (status와 별개로 날짜만 체크) */
    public boolean isWithinDateRange() {
        LocalDate today = LocalDate.now();
        return !today.isBefore(startDate) && !today.isAfter(endDate);
    }

    // 배너 이미지 편의 메서드 — Store.getDetailImageList()/setDetailImageList()와 동일한 패턴
    public java.util.List<String> getImageUrlList() {
        if (imageUrls == null || imageUrls.trim().isEmpty()) {
            return new java.util.ArrayList<>();
        }
        return java.util.List.of(imageUrls.split(","));
    }

    public void setImageUrlList(java.util.List<String> urlList) {
        if (urlList == null || urlList.isEmpty()) {
            this.imageUrls = "";
        } else {
            this.imageUrls = String.join(",", urlList);
        }
    }
}
