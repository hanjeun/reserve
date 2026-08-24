package kr.it.reserve.store.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class StoreUpdateRequest {
    
    private String name;
    private String description;
    private String address;
    private String zipCode;
    private String addressDetail;
    private Double latitude;
    private Double longitude;
    private String phone;
    private String category;
    
    // 키워드 (콤마 구분 문자열 또는 리스트)
    private List<String> keywords;
    
    // 새 이미지 업로드 (선택적)
    private MultipartFile mainImage;
    private List<MultipartFile> detailImages;

    // 기존 이미지 URL 유지
    private String existingMainImageUrl;
    private List<String> existingDetailImageUrls;

    // 영업 시간
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime openTime;

    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime closeTime;

    // 브레이크 타임 (선택, null = 없음)
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime breakStartTime;

    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime breakEndTime;

    // 노쇼 방지금 (0원이면 무료)
    private Integer noShowDeposit;

    // ========== 환불 정책 ==========
    // 전액 환불 가능 일수 (예약일 N일 전까지 전액 환불)
    private Integer fullRefundDays;

    // 부분 환불 가능 일수 (예약일 N일 전까지 부분 환불)
    private Integer partialRefundDays;

    // 부분 환불 비율 (퍼센트, 예: 50 = 50%)
    private Integer partialRefundRate;

    // ========== 예약 슬롯 정책 ==========
    // 빈 문자열("") 허용 : 빈 문자열 = 무제한(null), 숫자 = 제한 인원
    private String maxCapacityPerSlotRaw;
    private Boolean autoApprovalEnabled;

    // 예약 가능 마감 시간
    private Integer bookingDeadlineHours;

    // 결제 대기 만료 시간
    private Integer paymentTimeoutMinutes;

    // 예약 단위 시간 (분)
    private Integer reservationSlotMinutes;

    // "우리동네" 배지 표시 기준 거리(km) - null = 변경 없음, 1~10 범위로 제한(StoreService 검증)
    private Integer nearbyRadiusKm;

    // 나중 결제 허용
    private Boolean allowLatePayment;

    // 중복 예약 허용 (null = 변경 없음)
    private Boolean allowDuplicateReservation;

    // 이메일 알림 수신 여부
    private Boolean emailNotificationEnabled;

    /**
     * 정기 휴무 요일 — ISO 요일 번호 목록 (월=1 … 일=7). 빈 목록·null = 연중무휴.
     * 폼이 multipart 라 문자열 CSV 로도 올 수 있어 서비스에서 정규화한다.
     */
    private List<Integer> closedDays;

    /** 임시 휴무일 — ISO 날짜 문자열 목록("2026-09-15"). 지난 날짜는 저장 시 걸러진다. */
    private List<String> closedDates;

    /**
     * 예약 방식 — {@code SLOT} · {@code SESSION} · {@code DAY}. null·빈 값·모르는 값 = SLOT(기존 동작).
     *
     * <p>enum 이 아니라 String 인 이유는 {@code openDate} 와 같다(multipart 바인딩).
     * 모르는 값을 400 으로 거절하지 않고 SLOT 으로 흡수하는 것도 의도다 —
     * 옛 클라이언트가 이 필드를 안 보내거나 엉뚱한 값을 보내도 가게가 잠기면 안 된다.
     */
    private String bookingType;

    /** SESSION 전용 회차 시각 목록("11:00"). SLOT·DAY 에서는 무시된다. */
    private List<String> sessionTimes;

    /**
     * 운영 시작일 — ISO 날짜 문자열("2026-09-01"). null·빈 값 = 시작일 제한 없음.
     *
     * <p>{@code LocalDate} 가 아니라 {@code String} 인 이유 — 이 요청은 multipart 라
     * {@code @ModelAttribute} 로 바인딩되는데, 날짜 타입은 별도 컨버터가 있어야 붙는다.
     * 형식이 깨졌을 때 {@code BindException} 으로 새어나가면 기존 에러 규격과 달라진다.
     * {@code closedDates} 가 같은 이유로 {@code List<String>} 이다.
     */
    private String openDate;

    /** 운영 종료일 — 당일까지 영업. null·빈 값 = 무기한. */
    private String closeDate;

    /** 오늘부터 며칠 뒤까지 예약을 받을지. null·0 이하 = 제한 없음. */
    private Integer maxAdvanceBookingDays;

    public Integer getMaxCapacityPerSlot() {
        if (maxCapacityPerSlotRaw == null || maxCapacityPerSlotRaw.isBlank()) return null;
        try { return Integer.parseInt(maxCapacityPerSlotRaw.trim()); }
        catch (NumberFormatException e) { return null; }
    }

    // 폼 파라미터 이름 매핑 (백엔드는 maxCapacityPerSlot 로도 받음)
    public void setMaxCapacityPerSlot(String value) {
        this.maxCapacityPerSlotRaw = value;
    }
}
