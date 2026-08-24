package kr.it.reserve.store.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.store.entity.Store;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StoreResponse {
    
    private Long id;
    private String name;
    private String description;
    private String address;
    private String zipCode;
    private String addressDetail;
    private Double latitude;
    private Double longitude;
    private String phone;
    private String category;
    private String mainImageUrl;
    private Integer mainImageWidth;
    private Integer mainImageHeight;
    private List<String> detailImageUrls;
    private List<ImageMeta> detailImageMeta;
    private List<String> keywords;
    
    @JsonFormat(pattern = "HH:mm")
    private LocalTime openTime;

    @JsonFormat(pattern = "HH:mm")
    private LocalTime closeTime;

    @JsonFormat(pattern = "HH:mm")
    private LocalTime breakStartTime;

    @JsonFormat(pattern = "HH:mm")
    private LocalTime breakEndTime;
    
    private Double rating;
    private Integer reviewCount;

    // (2026-08-09) 여기 있던 @Min 을 제거했다 — 이건 **응답** DTO 라 Bean Validation 이
    // 아예 동작하지 않는다(응답 객체는 검증 대상이 아니다). "검증이 있다"는 착각만 줌.
    // 실제 방어는 StoreService 의 clampDeposit() 이 맡는다.
    private Integer noShowDeposit;  // 노쇼 방지금
    
    // ========== 환불 정책 ==========
    private Integer fullRefundDays;     // 전액 환불 가능 일수
    private Integer partialRefundDays;  // 부분 환불 가능 일수
    private Integer partialRefundRate;  // 부분 환불 비율 (%)

    // 예약 슬롯 정책
    private Integer maxCapacityPerSlot;
    private Boolean autoApprovalEnabled;
    private Integer bookingDeadlineHours;
    private Integer paymentTimeoutMinutes;
    private Integer reservationSlotMinutes;
    /**
     * 예약 방식 — {@code SLOT} · {@code SESSION} · {@code DAY}.
     * <b>항상 값이 있다</b>({@code resolveBookingType} 이 null 을 SLOT 으로 흡수한다) —
     * 화면이 null 분기를 하지 않아도 되게 만든 것이다.
     */
    private String bookingType;

    /** SESSION 전용 회차 시각("11:00"). 다른 방식이면 빈 목록. */
    private List<String> sessionTimes;

    /** 운영 시작일(ISO). null = 제한 없음. 화면이 달력에서 이 날 이전을 막는 데 쓴다. */
    private String openDate;

    /** 운영 종료일(ISO). 당일까지 영업. null = 무기한. */
    private String closeDate;

    private Integer nearbyRadiusKm;
    private Boolean allowLatePayment;
    private Boolean allowDuplicateReservation;
    private Boolean emailNotificationEnabled;

    // 휴무·예약범위 (2026-08-11). 달력이 어떤 날짜를 막을지 결정하는 데 쓰인다 —
    // 서버 검증(Store.isClosedOn)과 같은 값을 내려야 화면과 실제 동작이 어긋나지 않는다.
    private List<Integer> closedDays;
    private List<String> closedDates;
    private Integer maxAdvanceBookingDays;

    private LocalDateTime createdAt;
    private Long ownerId;  // 소유자 ID (프론트 권한 검증용)

    // 제재 상태 (관리자 목록/소유자 화면용)
    private String status;            // ACTIVE | SUSPENDED | BANNED
    private String suspendedUntil;    // SUSPENDED일 때만 값 존재, BANNED/ACTIVE는 null
    private String suspendReason;

    // 이미지 원본 크기 (프론트 스켈레톤이 실제 비율대로 미리 그려지게 해서 레이아웃 튐 방지용)
    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImageMeta {
        private String url;
        private Integer width;
        private Integer height;
    }

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    // Store.detailImagesMeta(JSON, url 없이 width/height만 배열)를 detailImages(URL 리스트)와
    // 순서대로 짝지어 프론트가 바로 쓸 수 있는 List<ImageMeta>로 변환.
    // 파싱 실패하거나 개수가 안 맞으면 빈 리스트로 처리(옛날 데이터처럼 meta가 없는 경우와 동일하게 취급 —
    // 잘못 짝지어진 값을 내려주는 것보다 비율 힌트가 아예 없는 게 안전함).
    private static List<ImageMeta> parseDetailImageMeta(List<String> urls, String metaJson) {
        if (urls == null || urls.isEmpty() || metaJson == null || metaJson.isBlank()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, Integer>> parsed = OBJECT_MAPPER.readValue(
                    metaJson, new TypeReference<List<Map<String, Integer>>>() {});
            if (parsed.size() != urls.size()) {
                return Collections.emptyList();
            }
            List<ImageMeta> result = new ArrayList<>();
            for (int i = 0; i < urls.size(); i++) {
                Map<String, Integer> m = parsed.get(i);
                result.add(ImageMeta.builder().url(urls.get(i)).width(m.get("width")).height(m.get("height")).build());
            }
            return result;
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    public static StoreResponse fromEntity(Store store) {
        List<String> detailUrls = store.getDetailImageList();
        return StoreResponse.builder()
                .id(store.getId())
                .name(store.getName())
                .description(store.getDescription())
                .address(store.getAddress())
                .zipCode(store.getZipCode())
                .addressDetail(store.getAddressDetail())
                .latitude(store.getLatitude())
                .longitude(store.getLongitude())
                .phone(store.getPhone())
                .category(store.getCategory())
                .mainImageUrl(store.getMainImageUrl())
                .mainImageWidth(store.getMainImageWidth())
                .mainImageHeight(store.getMainImageHeight())
                .detailImageUrls(detailUrls)
                .detailImageMeta(parseDetailImageMeta(detailUrls, store.getDetailImagesMeta()))
                .keywords(store.getKeywordList())
                .openTime(store.getOpenTime())
                .closeTime(store.getCloseTime())
                .breakStartTime(store.getBreakStartTime())
                .breakEndTime(store.getBreakEndTime())
                .rating(store.getRating())
                .reviewCount(store.getReviewCount())
                .noShowDeposit(store.getNoShowDeposit())
                .fullRefundDays(store.getFullRefundDays())
                .partialRefundDays(store.getPartialRefundDays())
                .partialRefundRate(store.getPartialRefundRate())
                .maxCapacityPerSlot(store.getMaxCapacityPerSlot())
                .autoApprovalEnabled(store.getAutoApprovalEnabled())
                .bookingDeadlineHours(store.getBookingDeadlineHours())
                .paymentTimeoutMinutes(store.getPaymentTimeoutMinutes())
                .reservationSlotMinutes(store.getReservationSlotMinutes())
                .nearbyRadiusKm(store.getNearbyRadiusKm())
                .allowLatePayment(store.getAllowLatePayment())
                .allowDuplicateReservation(store.getAllowDuplicateReservation())
                .emailNotificationEnabled(store.getEmailNotificationEnabled())
                .bookingType(store.resolveBookingType().name())
                .sessionTimes(store.getSessionTimeList().stream()
                        .map(t -> t.toString().substring(0, 5)).toList())
                .openDate(store.getOpenDate() != null ? store.getOpenDate().toString() : null)
                .closeDate(store.getCloseDate() != null ? store.getCloseDate().toString() : null)
                .closedDays(store.getClosedDayList())
                .closedDates(store.getClosedDateList().stream().map(java.time.LocalDate::toString).toList())
                .maxAdvanceBookingDays(store.getMaxAdvanceBookingDays())
                .createdAt(store.getCreatedAt())
                .ownerId(store.getOwner() != null ? store.getOwner().getId() : null)
                .status(store.getStatus() != null ? store.getStatus().name() : "ACTIVE")
                .suspendedUntil(store.getSuspendedUntil() != null ? store.getSuspendedUntil().toLocalDate().toString() : null)
                .suspendReason(store.getSuspendReason())
                .build();
    }
}
