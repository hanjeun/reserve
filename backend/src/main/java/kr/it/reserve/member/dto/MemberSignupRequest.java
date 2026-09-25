package kr.it.reserve.member.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import kr.it.reserve.global.security.PasswordPolicy;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonIgnoreProperties("role")
public class MemberSignupRequest {

    @NotBlank(message = "이름은 필수 항목입니다.")
    @Size(min = 2, max = 20, message = "이름은 2~20자로 입력해주세요.")
    private String name;

    @NotBlank(message = "이메일은 필수 항목입니다.")
    @Email(message = "올바른 이메일 형식이 아닙니다.")
    @Size(max = 100, message = "이메일은 100자 이내로 작성해주세요.")
    private String email;

    @NotBlank(message = "비밀번호는 필수 항목입니다.")
    @Size(min = PasswordPolicy.MIN_LENGTH, max = PasswordPolicy.MAX_LENGTH,
            message = PasswordPolicy.LENGTH_MESSAGE)
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = PasswordPolicy.COMPOSITION_MESSAGE)
    private String password;

    @NotBlank(message = "비밀번호 확인은 필수 항목입니다.")
    private String passwordConfirm;

    // 필수 약관 동의 여부 (서비스 이용약관 + 개인정보 처리방침)
    @AssertTrue(message = "필수 약관에 동의해주세요.")
    private boolean termsAgreed;

    // 선택 동의: 이메일 마케팅 수신 동의
    @Builder.Default
    private boolean marketingAgreed = false;

    @AssertTrue(message = PasswordPolicy.MISMATCH_MESSAGE)
    public boolean isPasswordConfirmed() {
        return PasswordPolicy.matches(password, passwordConfirm);
    }
}
