package kr.it.reserve.member.dto;

import jakarta.validation.constraints.AssertTrue;
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
public class PasswordChangeRequest {

    @NotBlank(message = "현재 비밀번호를 입력해주세요.")
    private String currentPassword;

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
