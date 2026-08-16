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
    @Email(message = "올바른 이메일 형식이 아닙니다.")
    private String toEmail;

    @NotBlank(message = "제목을 입력해주세요.")
    @Size(max = 500, message = "제목은 500자 이내로 입력해주세요.")
    private String subject;

    @NotBlank(message = "내용을 입력해주세요.")
    @Size(max = 5000, message = "내용은 5000자 이내로 입력해주세요.")
    private String body;

    /**
     * 광고성 정보인가 (2026-08-11 신설).
     *
     * <p>{@code true} 면 발송 전에 <b>수신자의 마케팅 수신 동의를 확인</b>하고, 동의하지 않았거나
     * 회원이 아니면 거부한다. 정보통신망법상 광고성 정보는 사전 동의가 필요하다.
     *
     * <p><b>기본값이 {@code true} 인 이유</b> — 안전한 쪽이 기본이어야 한다.
     * 기본을 false 로 두면 이 필드를 안 보내는 옛 호출·실수한 호출이 전부 "광고 아님"으로
     * 통과해 버린다. 문의 답변처럼 광고가 아닌 발송은 <b>명시적으로</b> false 를 보내게 한다.
     */
    private Boolean marketing = true;

    public boolean isMarketing() {
        return !Boolean.FALSE.equals(marketing);
    }
}
