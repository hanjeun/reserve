package com.reserve.review.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReviewCreateRequest {

    @NotNull(message = "예약 ID는 필수입니다.")
    private Long reservationId;

    @NotNull(message = "별점은 필수입니다.")
    @Min(value = 1, message = "별점은 1점 이상이어야 합니다.")
    @Max(value = 5, message = "별점은 5점 이하여야 합니다.")
    private Integer rating;

    @NotBlank(message = "제목은 필수입니다.")
    @Size(max = 100, message = "제목은 100자 이내여야 합니다.")
    private String title;

    @NotBlank(message = "내용은 필수입니다.")
    @Size(max = 1000, message = "내용은 1000자 이내여야 합니다.")
    private String content;
}
