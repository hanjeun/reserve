package com.reserve.review.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class ReviewUpdateRequest {

    @NotNull(message = "별점은 필수입니다.")
    @Min(value = 1, message = "별점은 1 이상이어야 합니다.")
    @Max(value = 5, message = "별점은 5 이하이어야 합니다.")
    private Integer rating;

    @NotBlank(message = "제목은 필수입니다.")
    @Size(max = 100, message = "제목은 100자 이하이어야 합니다.")
    private String title;

    @NotBlank(message = "내용은 필수입니다.")
    @Size(max = 1000, message = "내용은 1000자 이하이어야 합니다.")
    private String content;
}
