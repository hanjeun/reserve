package kr.it.reserve.inquiry.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
        @NotBlank(message = "문의 유형을 선택해주세요.")
        private String category;

        @NotBlank(message = "제목을 입력해주세요.")
        @Size(max = 200, message = "제목은 200자 이내로 입력해주세요.")
        private String title;

        @NotBlank(message = "내용을 입력해주세요.")
        @Size(max = 2000, message = "내용은 2000자 이내로 입력해주세요.")
        private String content;

        // 로그인 회원은 이름·이메일을 서버의 회원 정보에서 가져오므로 null을 허용한다.
        // 비회원일 때의 필수 여부는 InquiryService가 회원 여부와 함께 검사한다.
        @Size(max = 50, message = "이름은 50자 이내로 입력해주세요.")
        private String guestName;   // 비로그인일 때만 사용

        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Size(max = 100, message = "이메일은 100자 이내로 입력해주세요.")
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
        @NotBlank(message = "답변을 입력해주세요.")
        @Size(max = 2000, message = "답변은 2000자 이내로 입력해주세요.")
        private String answer;
    }
}
