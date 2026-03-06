package com.reserve.review.dto;

import com.reserve.review.entity.Review;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Getter
@Builder
public class ReviewResponse {

    private Long id;
    private Long storeId;
    private String storeName;
    private Long memberId;
    private String memberName;
    private String memberEmail;
    private Long reservationId;
    private Integer rating;
    private String title;
    private String content;
    private LocalDateTime createdAt;
    private String createdAtFormatted;

    public static ReviewResponse fromEntity(Review review) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy.MM.dd");
        
        return ReviewResponse.builder()
                .id(review.getId())
                .storeId(review.getStore().getId())
                .storeName(review.getStore().getName())
                .memberId(review.getMember().getId())
                .memberName(review.getMember().getName())
                .memberEmail(review.getMember().getEmail())
                .reservationId(review.getReservation() != null ? review.getReservation().getId() : null)
                .rating(review.getRating())
                .title(review.getTitle())
                .content(review.getContent())
                .createdAt(review.getCreatedAt())
                .createdAtFormatted(review.getCreatedAt() != null ? 
                        review.getCreatedAt().format(formatter) : "")
                .build();
    }
}
