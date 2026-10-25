package kr.it.reserve.advertisement.entity;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.store.entity.Store;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 노출 상태는 광고에, 결제·환불 판단과 이전 결제 시도는 AdPaymentAttempt 원장에 보존한다. */
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

    public static final int BANNER_TITLE_MAX_LENGTH = 100;
    public static final int BANNER_DESCRIPTION_MAX_LENGTH = 300;

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
    @Column(name = "title", length = BANNER_TITLE_MAX_LENGTH)
    private String title;

    @Column(name = "description", length = BANNER_DESCRIPTION_MAX_LENGTH)
    private String description;

    // BANNER 타입만 사용. 기존 광고의 NULL은 응답 경계에서 SOFT_RISE로 해석한다.
    // nullable로 추가해야 ddl-auto:update가 이미 데이터가 있는 운영 테이블에도 안전하게 컬럼을 더할 수 있다.
    @Enumerated(EnumType.STRING)
    @Column(name = "banner_motion", columnDefinition = "varchar(24)")
    private BannerMotionPreset bannerMotion;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "amount", nullable = false)
    private Integer amount;

    @Column(name = "merchant_uid", nullable = false, unique = true)
    private String merchantUid;

    /**
     * 광고 상태는 상태값 추가가 MySQL 네이티브 ENUM 정의에 종속되지 않도록 VARCHAR로 매핑한다.
     * 기존 스키마의 타입 변경은 자동 생성에 맡기지 않고 manual-ddl 런북의 검증·승인 절차를 따른다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, columnDefinition = "varchar(20)")
    @Builder.Default
    private AdStatus status = AdStatus.PENDING_PAYMENT;

    @Column(name = "suspend_reason")
    private String suspendReason;

    // 광고 성과 지표 — Promotion.viewCount/likeCount와 동일한 단순 카운터 방식.
    // 별도 이벤트 로그 테이블 없이 지금 규모에 맞게 간단하게 시작 — 하루 단위 추이가 필요해지면
    // 별도 로그 테이블로 증분해야 함(현재 구조로는 일별 추이 불가, 누적 지표만 제공).
    @Column(name = "impression_count", nullable = false)
    @Builder.Default
    private Integer impressionCount = 0;

    // BANNER만 의미 있는 지표(BADGE는 클릭 개념이 애매해서 노출만 집계)
    @Column(name = "click_count", nullable = false)
    @Builder.Default
    private Integer clickCount = 0;

    // 배너 클릭 뒤 생성된 같은 가게의 예약을 서버가 한 번만 귀속해 증가시킨다.
    // 클릭 자체를 이벤트 테이블로 보관하지 않으므로 완전한 마케팅 어트리뷰션이 아니라 예약 전환 참고 지표다.
    @Column(name = "conversion_count", nullable = false)
    @Builder.Default
    private Integer conversionCount = 0;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // 목록에서 숨겨도 결제·노출 이력은 보존한다.
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(Clock.systemDefaultZone());
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

    public BannerMotionPreset getResolvedBannerMotion() {
        return bannerMotion == null ? BannerMotionPreset.SOFT_RISE : bannerMotion;
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
