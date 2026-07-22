package kr.it.reserve.member.dto;

import kr.it.reserve.member.entity.Role;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberDto {

    @NotEmpty(message = "이름은 필수 항목입니다.")
    private String name;

    @NotEmpty(message = "이메일은 필수 항목입니다.")
    @Size(max = 100, message = "이메일은 100자 이내로 작성해주세요.")
    private String email;

    @NotEmpty(message = "비밀번호는 필수 항목입니다.")
    @Size(min = 8, message = "비밀번호는 8자 이상으로 입력해주세요.")
    private String password;

    @NotEmpty(message = "비밀번호 확인은 필수 항목입니다.")
    @Size(min = 8, message = "비밀번호는 8자 이상으로 입력해주세요.")
    private String passwordConfirm;

    @NotNull(message = "사용자 유형을 선택해주세요.")
    @Builder.Default
    private Role role = Role.USER;

    // 필수 약관 동의 여부 (서비스 이용약관 + 개인정보 처리방침)
    @AssertTrue(message = "필수 약관에 동의해주세요.")
    private boolean termsAgreed;

    // 선택 동의: 이메일 마케팅 수신 동의
    @Builder.Default
    private boolean marketingAgreed = false;
}
