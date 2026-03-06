package com.reserve.inquiry.dto;

import com.reserve.inquiry.entity.Inquiry;
import lombok.*;

import java.time.format.DateTimeFormatter;

public class InquiryDto {

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class InquiryRequest {
        private String category;
        private String title;
        private String content;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class InquiryResponse {
        private Long id;
        private String category;
        private String categoryDisplayName;
        private String title;
        private String content;
        private String status;
        private String statusDisplayName;
        private String answer;
        private String memberName;
        private Long memberId;
        private String createdAt;
        private String answeredAt;

        public static InquiryResponse fromEntity(Inquiry inquiry) {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
            
            return InquiryResponse.builder()
                    .id(inquiry.getId())
                    .category(inquiry.getCategory().name())
                    .categoryDisplayName(inquiry.getCategory().getDisplayName())
                    .title(inquiry.getTitle())
                    .content(inquiry.getContent())
                    .status(inquiry.getStatus().name())
                    .statusDisplayName(inquiry.getStatus().getDisplayName())
                    .answer(inquiry.getAnswer())
                    .memberName(inquiry.getMember().getName())
                    .memberId(inquiry.getMember().getId())
                    .createdAt(inquiry.getCreatedAt().format(formatter))
                    .answeredAt(inquiry.getAnsweredAt() != null ? inquiry.getAnsweredAt().format(formatter) : null)
                    .build();
        }
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AnswerRequest {
        private String answer;
    }
}
