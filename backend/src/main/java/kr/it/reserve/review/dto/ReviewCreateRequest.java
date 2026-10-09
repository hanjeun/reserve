package kr.it.reserve.review.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReviewCreateRequest {

    @NotNull(message = "예약 ID는 필수예요.")
    private Long reservationId;

    @NotNull(message = "별점은 필수예요.")
    @Min(value = 1, message = "별점은 1점 이상이어야 해요.")
    @Max(value = 5, message = "별점은 5점 이하여야 해요.")
    private Integer rating;

    @NotBlank(message = "제목은 필수예요.")
    @Size(max = 100, message = "제목은 100자 이내여야 해요.")
    private String title;

    @NotBlank(message = "내용은 필수예요.")
    @Size(max = 1000, message = "내용은 1000자 이내여야 해요.")
    private String content;
}
