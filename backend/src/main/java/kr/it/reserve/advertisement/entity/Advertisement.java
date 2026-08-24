package kr.it.reserve.advertisement.entity;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.store.entity.Store;
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
/*
 * 인덱스는 AdvertisementRepository의 실제 쿼리에서 역산했다. (근거는 Reservation 엔티티 주석 참고)
 * ※ merchant_uid는 @Column(unique = true)라 유니크 제약이 이미 인덱스 역할을 한다 — 중복 정의하지 않는다.
 */
@Table(name = "advertisement", indexes = {
    // findByStatusAndAdTypeAndStartDateLessThanEqualAndEndDateGreaterThanEqual… —
    // 노출 중인 광고 조회. 홈·목록에서 매 요청 돌기 때문에 여기가 가장 뜨겁다.
    @Index(name = "idx_ad_active", columnList = "status, ad_type, start_date, end_date"),
    // findByStatusAndEndDateBefore — 만료 처리 스케줄러(AdvertisementExpiryScheduler)
    @Index(name = "idx_ad_status_end", columnList = "status, end_date"),
    // 관리자 전체 목록 (deletedAt IS NULL ORDER BY createdAt DESC)
    @Index(name = "idx_ad_deleted_created", columnList = "deleted_at, created_at")
})
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

    /**
     * 광고 상태.
     *
     * columnDefinition = "varchar(20)"인 이유 (2026-07 버그 수정):
     * Hibernate는 MySQL에서 @Enumerated(STRING) 필드를 네이티브 ENUM 컬럼으로 만든다.
     * 그런데 ddl-auto: update는 "없는 컬럼 추가"만 해주고 "기존 컬럼의 타입 변경"은 하지 않는다.
     * 그래서 나중에 AdStatus에 CANCELLED/REFUNDED를 추가했을 때 DB의 enum 정의는
     * enum('ACTIVE','EXPIRED','PAYMENT_FAILED','PENDING_PAYMENT','SUSPENDED') 5개인 채로 굳어버렸고,
     * 결제 전 광고를 취소하면 UPDATE ... SET status='CANCELLED'가 MySQL에서 거부되어 500이 났다.
     *
     * varchar로 두면 앞으로 AdStatus에 값을 추가해도 DB가 다시 깨지지 않는다.
     * (Store.status가 이미 varchar(20)이라 같은 문제를 겪지 않았다 — 그 선례를 따른다)
     * 기존 DB에는 ddl-auto가 타입을 안 바꾸므로 수동 ALTER가 필요하다:
     *   ALTER TABLE advertisement MODIFY COLUMN status VARCHAR(20) NOT NULL;
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, columnDefinition = "varchar(20)")
    @Builder.Default
    private AdStatus status = AdStatus.PENDING_PAYMENT;

    @Column(name = "suspend_reason")
    private String suspendReason;

    // 광고 성과 지표(2026-07 추가) — Promotion.viewCount/likeCount와 동일한 단순 카운터 방식.
    // 별도 이벤트 로그 테이블 없이 지금 규모에 맞게 간단하게 시작 — 하루 단위 추이가 필요해지면
    // 별도 로그 테이블로 증분해야 함(현재 구조로는 일별 추이 불가, 누적 지표만 제공).
    @Column(name = "impression_count", nullable = false)
    @Builder.Default
    private Integer impressionCount = 0;

    // BANNER만 의미 있는 지표(BADGE는 클릭 개념이 애매해서 노출만 집계)
    @Column(name = "click_count", nullable = false)
    @Builder.Default
    private Integer clickCount = 0;

    // 배너 클릭 후 24시간 이내 같은 가게에 예약이 생성되면 프론트에서 이 카운터를 증가시킴(sessionStorage 기반
    // 귀속 — 서버 측에서는 단순히 "이 adId의 전환이 하나 더 생겨있다"만 데이터로 남김).
    @Column(name = "conversion_count", nullable = false)
    @Builder.Default
    private Integer conversionCount = 0;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // 2026-07 추가 — 종료상태(EXPIRED/CANCELLED/REFUNDED/SUSPENDED) 광고를 사업자가 목록에서 직접
    // 숨길 수 있게 — 예약(Reservation.deletedAt)과 동일한 소프트삭제 패턴(휴지통 30일 보관 후 자동 영구삭제).
    // 결제/노출 이력은 지우지 않고 그대로 보존하는 게 목적이라 하드삭제가 아니라 소프트삭제.
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    /**
     * 오늘 날짜 기준으로 노출 기간 내인지 (status와 별개로 날짜만 체크).
     * startDate·endDate 는 사장님이 고른 한국 날짜이므로 오늘도 KST 여야 한다(ServiceTime 참고).
     */
    public boolean isWithinDateRange() {
        LocalDate today = ServiceTime.today();
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

    public void increaseImpressionCount() {
        this.impressionCount++;
    }

    public void increaseClickCount() {
        this.clickCount++;
    }

    public void increaseConversionCount() {
        this.conversionCount++;
    }

    /** 노출 대비 클릭률(%) — 노출이 0이면 null("집계 불가" 의미 — 0%와 구별) */
    public Double getClickThroughRate() {
        if (impressionCount == null || impressionCount == 0) return null;
        return Math.round((clickCount * 1000.0) / impressionCount) / 10.0;
    }

    /** 클릭 대비 전환율(%) — BADGE는 clickCount가 항상 0이라 null */
    public Double getConversionRate() {
        if (clickCount == null || clickCount == 0) return null;
        return Math.round((conversionCount * 1000.0) / clickCount) / 10.0;
    }
}
