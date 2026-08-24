package kr.it.reserve.store.entity;

import kr.it.reserve.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
/*
 * 인덱스는 StoreRepository의 실제 쿼리에서 역산했다. (근거는 Reservation 엔티티 주석 참고)
 * ※ 거리순 정렬은 Haversine 인메모리 계산이라(StoreService.distanceKm) 인덱스로 못 돕는다 —
 *   latitude/longitude에 인덱스를 넣어봐야 쓰이지 않으므로 넣지 않았다.
 */
@Table(name = "store", indexes = {
    // findByDeletedAtIsNullAndStatusOrderBy… — 가게 목록(평점순·리뷰순·최신순 전부 이 조합)
    @Index(name = "idx_store_deleted_status", columnList = "deleted_at, status, created_at"),
    // findByOwnerAndDeletedAtIsNullOrderByCreatedAtDesc — 내 가게 목록
    @Index(name = "idx_store_owner", columnList = "owner_id, deleted_at, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "store_id")
    private Long id;

    // 가게 소유자
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private Member owner;

    @Column(name = "store_name", nullable = false)
    private String name;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "address")
    private String address;

    @Column(name = "zip_code", length = 10)
    private String zipCode;

    @Column(name = "address_detail")
    private String addressDetail;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "phone")
    private String phone;

    @Column(name = "category")
    private String category;

    @Column(name = "main_image_url")
    private String mainImageUrl;

    // 메인 이미지 원본 크기 — 업로드 시 ImageIO로 헤더만 읽어 저장(전체 디코딩 안 함),
    // 프론트 스켈레톤이 실제 이미지 비율대로 미리 그려지게 해서 CLS 방지용. 측정 실패해도 업로드 자체는 막지 않고 null로 놓음
    @Column(name = "main_image_width")
    private Integer mainImageWidth;

    @Column(name = "main_image_height")
    private Integer mainImageHeight;

    @Column(name = "rating")
    private Double rating;

    @Column(name = "review_count")
    @Builder.Default
    private Integer reviewCount = 0;

    // 키워드 (콤마로 구분된 문자열로 저장)
    @Column(name = "keywords", length = 500)
    private String keywords;

    // 상세 이미지 URL들 (콤마로 구분된 문자열로 저장)
    @Column(name = "detail_images", length = 2000)
    private String detailImages;

    // detailImages와 1:1 순서 대응되는 각 이미지의 원본 크기 JSON 배열
    // 예: [{"width":1200,"height":800},{"width":900,"height":1200}] — url은 detailImages에 이미 있어서 중복 저장 안 함.
    // 파싱/직렬화는 StoreService에서 Jackson으로 처리(엔티티는 단순 원시 문자열 보관만 담당)
    @Column(name = "detail_images_meta", length = 2000)
    private String detailImagesMeta;

    // 영업 시간
    @Column(name = "open_time")
    private LocalTime openTime;

    @Column(name = "close_time")
    private LocalTime closeTime;

    // 브레이크 타임 (선택, null = 없음)
    @Column(name = "break_start_time")
    private LocalTime breakStartTime;

    @Column(name = "break_end_time")
    private LocalTime breakEndTime;

    /**
     * 정기 휴무 요일 — ISO 요일 번호를 콤마로 이어 저장한다 (월=1 … 일=7). 예: {@code "1,3"}
     * ({@code keywords}·{@code detailImages} 와 같은 CSV 컨벤션. 별도 테이블을 두기엔 값이 최대 7개다.)
     *
     * <p><b>왜 필요했나</b> (2026-08-11 신설) — 그 전까지 영업시간이 요일 구분 없이 하나뿐이라
     * <b>월요일 휴무인 가게도 월요일 예약을 받았다.</b> 기능이 없는 게 아니라 잘못된 예약을 받는
     * 상태였고, 사장님은 그걸 하나씩 거절해야 했다. 거절은 이제 전액 환불이 나가므로
     * 예약금이 왕복하는 비용까지 붙는다.
     *
     * <p>{@code null}·빈 문자열 = 휴무 없음(연중무휴).
     */
    @Column(name = "closed_days", length = 20)
    private String closedDays;

    /**
     * 임시 휴무일 — ISO 날짜를 콤마로 이어 저장한다. 예: {@code "2026-09-15,2026-09-16"}
     *
     * <p>명절·개인 사정처럼 <b>특정 날짜만</b> 닫는 경우. 정기 휴무({@link #closedDays})가 있어도
     * 이게 없으면 그날 들어온 예약을 일일이 거절해야 한다.
     *
     * <p>지난 날짜는 {@code StoreService} 가 저장 시점에 걸러낸다 — 안 그러면 이 값이 무한히 길어진다.
     */
    @Column(name = "closed_dates", length = 1000)
    private String closedDates;

    /**
     * 예약을 어떤 방식으로 받는가 (2026-08-24 신설). {@code null} = {@link BookingType#SLOT}.
     *
     * <p>⚠️ <b>{@code null} 을 SLOT 으로 읽는 것이 생명줄이다.</b> {@code ddl-auto: update} 는
     * 컬럼을 추가할 뿐 기존 행을 채우지 않으므로, 기존 가게는 전부 {@code NULL} 이다.
     * 직접 읽지 말고 {@link #resolveBookingType()} 을 쓸 것.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "booking_type", length = 20)
    private BookingType bookingType;

    /**
     * {@link BookingType#SESSION} 전용 — 사장님이 직접 나열한 회차 시각. 예: {@code "11:00,14:00,17:00"}
     *
     * <p>별도 테이블이 아니라 CSV 인 이유 — 회차는 하루 3~10개, 순서가 있고, 검색 대상이 아니다.
     * {@code closedDays} 가 같은 방식이고 잘 돌고 있다. <b>회차마다 정원이 달라지면</b> 그때
     * 테이블로 올린다 — 미리 만들면 조인과 라이프사이클만 늘어난다.
     */
    @Column(name = "session_times", length = 500)
    private String sessionTimes;

    /**
     * 운영 시작일 — 이 날짜 <b>이전</b>은 예약을 받지 않는다. {@code null} = 시작일 제한 없음.
     *
     * <p>팝업스토어·기간 한정 클래스처럼 <b>영업 자체에 기간이 있는</b> 가게를 위한 것이다.
     * 휴무일({@link #closedDays}·{@link #closedDates})로는 표현할 수 없다 —
     * 휴무는 "여는 가게가 그날만 쉰다"이고, 이건 "그 기간 밖에는 가게가 존재하지 않는다"이다.
     */
    @Column(name = "open_date")
    private LocalDate openDate;

    /**
     * 운영 종료일 — 이 날짜 <b>다음</b>은 예약을 받지 않는다(종료일 당일은 영업). {@code null} = 무기한.
     *
     * <p>⚠️ {@code ddl-auto: update} 는 컬럼을 추가할 뿐 <b>기존 행을 채우지 않는다.</b>
     * 기존 가게는 두 값이 모두 {@code NULL} 이고, 그건 "무기한 영업" 으로 해석돼
     * 지금까지와 똑같이 동작한다 — 마이그레이션이 필요 없는 이유다.
     */
    @Column(name = "close_date")
    private LocalDate closeDate;

    /**
     * 오늘부터 며칠 뒤까지 예약을 받을지. {@code null} = 제한 없음.
     *
     * <p>그 전까지 미래 날짜 제한이 아예 없어 <b>1년 뒤 예약도 들어왔다.</b>
     * 가게 입장에서 그렇게 먼 예약은 운영 계획을 세울 수 없고, 이용자도 잊어버린다.
     */
    @Column(name = "max_advance_booking_days")
    private Integer maxAdvanceBookingDays;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // 노쇼 방지금 (0원이면 무료, null이면 설정 안함)
    @Column(name = "no_show_deposit")
    @Builder.Default
    private Integer noShowDeposit = 0;

    // ========== 환불 정책 ==========
    // 전액 환불 가능 일수 (예약일 N일 전까지 전액 환불)
    @Column(name = "full_refund_days")
    @Builder.Default
    private Integer fullRefundDays = 3;

    // 부분 환불 가능 일수 (예약일 N일 전까지 부분 환불)
    @Column(name = "partial_refund_days")
    @Builder.Default
    private Integer partialRefundDays = 1;

    // 부분 환불 비율 (퍼센트, 예: 50 = 50%)
    @Column(name = "partial_refund_rate")
    @Builder.Default
    private Integer partialRefundRate = 50;

    // ========== 예약 슬롯 정책 ==========
    // 동시간대 최대 예약 인원 (null = 무제한)
    @Column(name = "max_capacity_per_slot")
    private Integer maxCapacityPerSlot;

    // 자동 승인 여부 (true = 예약 즉시 CONFIRMED)
    // NOT NULL + DEFAULT FALSE : JPA 로딩 시에도 null 방지
    @Column(name = "auto_approval_enabled", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean autoApprovalEnabled = false;

    // 예약 가능 마감 시간 (예약 시간 N시간 전까지만 예약 가능, null = 제한 없음)
    @Column(name = "booking_deadline_hours")
    private Integer bookingDeadlineHours;

    // 결제 대기 만료 시간 (예약 생성 후 N분 내 미결제 시 자동 취소, null = 기본값 30분)
    @Column(name = "payment_timeout_minutes")
    @Builder.Default
    private Integer paymentTimeoutMinutes = 30;

    // 예약 단위 시간 (분) - 예약 시간 선택 시 단위, 기본 30분
    @Column(name = "reservation_slot_minutes")
    @Builder.Default
    private Integer reservationSlotMinutes = 30;

    // "우리동네" 배지 표시 기준 거리(km) - 사장님이 직접 설정, 1~10km 범위로 제한(StoreService 검증)
    @Column(name = "nearby_radius_km")
    @Builder.Default
    private Integer nearbyRadiusKm = 3;

    // 나중 결제 허용 여부 (true = 예약금 있어도 즉시 결제 없이 예약 가능, 추후 결제하기 버튼으로 결제)
    @Column(name = "allow_late_payment", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean allowLatePayment = false;

    // 중복 예약 허용 여부 (true = 같은 날짜에 여러 예약 가능, false = 1인 1일 1예약 제한)
    @Column(name = "allow_duplicate_reservation", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean allowDuplicateReservation = false;

    // 이메일 알림 수신 여부 (true = 새 예약 시 사장님에게 이메일 발송)
    @Column(name = "email_notification_enabled", nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private Boolean emailNotificationEnabled = true;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    // ── 영업 제재 상태 (Member의 status 패턴과 동일) ──
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private StoreStatus status = StoreStatus.ACTIVE;

    @Column(name = "suspended_until")
    private LocalDateTime suspendedUntil;

    @Column(name = "suspend_reason")
    private String suspendReason;

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    // 제재 상태 체크 — Member.isSuspended()와 동일한 로직
    public boolean isSuspended() {
        if (this.status == StoreStatus.BANNED) return true;
        if (this.status == StoreStatus.SUSPENDED) {
            if (this.suspendedUntil != null && LocalDateTime.now().isAfter(this.suspendedUntil)) {
                return false;
            }
            return true;
        }
        return false;
    }

    public void suspend(LocalDateTime until, String reason) {
        this.status = StoreStatus.SUSPENDED;
        this.suspendedUntil = until;
        this.suspendReason = reason;
    }

    public void ban(String reason) {
        this.status = StoreStatus.BANNED;
        this.suspendedUntil = null;
        this.suspendReason = reason;
    }

    public void unban() {
        this.status = StoreStatus.ACTIVE;
        this.suspendedUntil = null;
        this.suspendReason = null;
    }

    // 키워드 편의 메서드
    public List<String> getKeywordList() {
        if (keywords == null || keywords.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return List.of(keywords.split(","));
    }

    public void setKeywordList(List<String> keywordList) {
        if (keywordList == null || keywordList.isEmpty()) {
            this.keywords = "";
        } else {
            this.keywords = String.join(",", keywordList);
        }
    }

    // 상세 이미지 편의 메서드
    public List<String> getDetailImageList() {
        if (detailImages == null || detailImages.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return List.of(detailImages.split(","));
    }

    public void setDetailImageList(List<String> imageList) {
        if (imageList == null || imageList.isEmpty()) {
            this.detailImages = "";
        } else {
            this.detailImages = String.join(",", imageList);
        }
    }

    // ── 휴무 (2026-08-11) ────────────────────────────────────────────────────
    // 파싱을 엔티티에 두는 이유 — 이 CSV 를 읽는 곳이 셋이다(예약 검증, 가능시간 조회, 응답 DTO).
    // 각자 split 하게 두면 "빈 문자열" "공백 섞임" 같은 케이스를 한 곳만 처리하는 사고가 난다.

    /** 정기 휴무 요일 (ISO: 월=1 … 일=7). 값이 없으면 빈 리스트. */
    public List<Integer> getClosedDayList() {
        return parseCsv(closedDays).stream().map(Integer::valueOf).toList();
    }

    public void setClosedDayList(List<Integer> days) {
        this.closedDays = (days == null || days.isEmpty()) ? null
                : days.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
    }

    /** 임시 휴무일. 값이 없으면 빈 리스트. */
    public List<LocalDate> getClosedDateList() {
        return parseCsv(closedDates).stream().map(LocalDate::parse).toList();
    }

    public void setClosedDateList(List<LocalDate> dates) {
        this.closedDates = (dates == null || dates.isEmpty()) ? null
                : dates.stream().map(LocalDate::toString).collect(java.util.stream.Collectors.joining(","));
    }

    /**
     * 그 날짜에 문을 닫는가 — 정기 휴무 요일이거나 임시 휴무일이면 {@code true}.
     *
     * <p>예약 검증·가능시간 조회·달력 표시가 <b>모두 이 한 메서드를 지나게</b> 한다.
     * 세 곳에 같은 판정을 복사해두면 한 곳만 고쳐지는 일이 반드시 생긴다.
     */
    public boolean isClosedOn(LocalDate date) {
        if (date == null) return false;
        return getClosedDayList().contains(date.getDayOfWeek().getValue())
                || getClosedDateList().contains(date);
    }

    /**
     * 그 날짜에 <b>예약을 받을 수 있는가</b> — 운영 기간 안이고 휴무가 아니면 {@code true}.
     *
     * <p><b>★ 예약 검증·가능시간 조회·달력이 전부 이 메서드 하나를 지나야 한다.</b>
     * 휴무 판정이 {@link #isClosedOn} 한 곳에 모여 있어서 지금까지 어긋난 적이 없었다.
     * 운영 기간을 새 판정으로 따로 만들면 그 이점이 사라진다 — "화면엔 되는데 누르면 안 되는"
     * 상태는 판정이 흩어질 때 생긴다.
     *
     * <p>경계는 <b>양쪽 모두 포함</b>이다. 사장님이 "9/1~9/30 운영"이라고 적으면
     * 9월 30일은 여는 날이라고 읽는 게 자연스럽다.
     */
    /**
     * 예약 방식. <b>화면은 이 값 하나만 고르고 나머지는 따라온다</b> —
     * 체크박스를 여러 개 주면 사장님이 조합을 만들지 못한다.
     */
    public enum BookingType {
        /** 영업시간을 예약 단위로 쪼갠다. 식당·미용실·병원. <b>기본값이자 기존 동작.</b> */
        SLOT,
        /** 사장님이 회차를 직접 나열한다. 공연·클래스·투어. */
        SESSION,
        /** 시간 선택이 없다 — 날짜만 고른다. 팝업스토어·종일권·대관. */
        DAY
    }

    /** {@code null} 을 흡수한다. <b>기존 가게(NULL)는 전부 SLOT 이다.</b> 직접 필드를 읽지 말 것. */
    public BookingType resolveBookingType() {
        return bookingType != null ? bookingType : BookingType.SLOT;
    }

    /** 회차 목록(SESSION 전용). 비어 있으면 빈 리스트. */
    public List<LocalTime> getSessionTimeList() {
        return parseCsv(sessionTimes).stream().map(LocalTime::parse).sorted().toList();
    }

    public void setSessionTimeList(List<LocalTime> times) {
        this.sessionTimes = (times == null || times.isEmpty()) ? null
                : times.stream().distinct().sorted()
                       .map(t -> t.toString().substring(0, 5))
                       .collect(java.util.stream.Collectors.joining(","));
    }

    /**
     * {@link BookingType#DAY} 예약이 저장될 시각.
     *
     * <p><b>왜 시간을 nullable 로 안 만들었나</b> — 정원 계산·중복 검사·QR·환불이 전부
     * {@code reservationTime} 에 묶여 있다. nullable 로 바꾸면 그 전부에 분기가 생긴다.
     * "하루 = 슬롯 한 개"로 보면 <b>기존 로직이 한 줄도 안 바뀌고 재사용된다.</b>
     *
     * <p>{@code 0} 같은 sentinel 을 쓰지 않는 것과 같은 결의 판단이다 —
     * 이 프로젝트는 sentinel 때문에 환불 정책이 통째로 뒤집힌 전례가 있다.
     * 여기서는 "의미 없는 특수값"이 아니라 <b>실제로 그 가게가 문 여는 시각</b>을 쓴다.
     */
    public LocalTime dayBookingTime() {
        return openTime != null ? openTime : LocalTime.MIDNIGHT;
    }

    public boolean isBookableOn(LocalDate date) {
        if (date == null) return false;
        if (openDate != null && date.isBefore(openDate)) return false;
        if (closeDate != null && date.isAfter(closeDate)) return false;
        return !isClosedOn(date);
    }

    /** 빈 값·공백·후행 콤마를 한 곳에서 흡수한다. */
    private static List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) return new ArrayList<>();
        List<String> out = new ArrayList<>();
        for (String part : csv.split(",")) {
            String v = part.trim();
            if (!v.isEmpty()) out.add(v);
        }
        return out;
    }
}
