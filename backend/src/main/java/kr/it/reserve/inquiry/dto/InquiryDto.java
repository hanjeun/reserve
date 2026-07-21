package kr.it.reserve.inquiry.dto;

import kr.it.reserve.inquiry.entity.Inquiry;
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
        private String guestName;   // 비로그인일 때만 사용
        private String guestEmail;  // 비로그인일 때만 사용
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
        private String memberEmail;
        private Long memberId;
        private String createdAt;
        private String answeredAt;

        public static InquiryResponse fromEntity(Inquiry inquiry) {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
            boolean isGuest = inquiry.getMember() == null;

            return InquiryResponse.builder()
                    .id(inquiry.getId())
                    .category(inquiry.getCategory().name())
                    .categoryDisplayName(inquiry.getCategory().getDisplayName())
                    .title(inquiry.getTitle())
                    .content(inquiry.getContent())
                    .status(inquiry.getStatus().name())
                    .statusDisplayName(inquiry.getStatus().getDisplayName())
                    .answer(inquiry.getAnswer())
                    .memberName(isGuest ? inquiry.getGuestName() + " (비회원)" : inquiry.getMember().getName())
                    .memberEmail(isGuest ? inquiry.getGuestEmail() : inquiry.getMember().getEmail())
                    .memberId(isGuest ? null : inquiry.getMember().getId())
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
