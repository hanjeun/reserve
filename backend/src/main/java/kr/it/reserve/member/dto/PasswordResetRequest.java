package kr.it.reserve.member.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import kr.it.reserve.global.security.PasswordPolicy;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class PasswordResetRequest {

    @NotBlank(message = "이메일을 입력해주세요.")
    @Email(message = "올바른 이메일 형식이 아닙니다.")
    private String email;

    @NotBlank(message = "인증 코드를 입력해주세요.")
    @Pattern(regexp = "^\\d{6}$", message = "인증 코드는 6자리 숫자입니다.")
    private String code;

    @NotBlank(message = "새 비밀번호를 입력해주세요.")
    @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_LENGTH,
            message = PasswordPolicy.LENGTH_MESSAGE)
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = PasswordPolicy.COMPOSITION_MESSAGE)
    private String newPassword;

    @NotBlank(message = "새 비밀번호 확인을 입력해주세요.")
    private String newPasswordConfirm;

    @AssertTrue(message = PasswordPolicy.MISMATCH_MESSAGE)
    public boolean isPasswordConfirmed() {
        return PasswordPolicy.matches(newPassword, newPasswordConfirm);
    }
}
