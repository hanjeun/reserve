package kr.it.reserve.mailbox.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ComposeMailRequest {

    @NotBlank(message = "받는 사람 이메일을 입력해주세요.")
    @Email(message = "올바른 이메일 형식이 아니에요.")
    private String toEmail;

    @NotBlank(message = "제목을 입력해주세요.")
    @Size(max = 500, message = "제목은 500자 이내로 입력해주세요.")
    private String subject;

    @NotBlank(message = "내용을 입력해주세요.")
    @Size(max = 5000, message = "내용은 5000자 이내로 입력해주세요.")
    private String body;

    /**
     * 정보통신망법상 광고성 정보는 사전 동의가 필요하다.
     * 기본값은 광고성이며, 비광고 발송만 명시적으로 false를 보낸다.
     */
    private Boolean marketing = true;

    public boolean isMarketing() {
        return !Boolean.FALSE.equals(marketing);
    }
}
