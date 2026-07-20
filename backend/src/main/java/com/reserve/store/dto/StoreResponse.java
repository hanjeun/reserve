package com.reserve.store.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reserve.store.entity.Store;
import jakarta.validation.constraints.Min;
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

    @Min(value = 0, message = "노쇼 금액은 0원 이상이어야 합니다.")
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
    private Integer nearbyRadiusKm;
    private Boolean allowLatePayment;
    private Boolean allowDuplicateReservation;
    private Boolean emailNotificationEnabled;

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
                .createdAt(store.getCreatedAt())
                .ownerId(store.getOwner() != null ? store.getOwner().getId() : null)
                .status(store.getStatus() != null ? store.getStatus().name() : "ACTIVE")
                .suspendedUntil(store.getSuspendedUntil() != null ? store.getSuspendedUntil().toLocalDate().toString() : null)
                .suspendReason(store.getSuspendReason())
                .build();
    }
}
